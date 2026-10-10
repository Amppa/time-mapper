/**
 * World Time Aligner - Utilities Module
 */

const MathUtils = {
  clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
};

const TimeUtils = {
  _formatterCache: {},
  _resolvedCache: {},
  _cachedSupportedZones: null,

  getFormatter(locale, options) {
    const key = `${locale}_${options.timeZone || ''}_${options.hour || ''}_${options.minute || ''}_${options.hour12 || ''}_${options.weekday || ''}_${options.hourCycle || ''}_${options.timeZoneName || ''}_${options.year || ''}_${options.month || ''}_${options.day || ''}`;
    if (!this._formatterCache[key]) {
      this._formatterCache[key] = new Intl.DateTimeFormat(locale, options);
    }
    return this._formatterCache[key];
  },

  resolveZone(zone) {
    if (typeof zone !== "string") return "UTC";
    const cleanInput = zone.trim().toLowerCase().replace(/[\s\-_]+/g, "");

    if (this._resolvedCache[cleanInput]) {
      return this._resolvedCache[cleanInput];
    }

    // 1. Try case-insensitive and loose matching against browser supported zones
    if (typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function") {
      try {
        if (!this._cachedSupportedZones) {
          this._cachedSupportedZones = Intl.supportedValuesOf("timeZone");
        }
        const supported = this._cachedSupportedZones;
        // Look for exact match (ignoring case/spaces/hyphens/underscores)
        let match = supported.find(tz => tz.toLowerCase().replace(/[\s\-_]+/g, "") === cleanInput);
        if (match) {
          this._resolvedCache[cleanInput] = match;
          return match;
        }

        // Look for shorthand match (e.g. "taipei" matches "Asia/Taipei")
        match = supported.find(tz => {
          const parts = tz.toLowerCase().split("/");
          return parts[parts.length - 1].replace(/[\s\-_]+/g, "") === cleanInput;
        });
        if (match) {
          this._resolvedCache[cleanInput] = match;
          return match;
        }
      } catch (e) { }
    }

    // 2. Direct validation fallback (handles UTC offsets, Etc/GMT, etc.)
    try {
      this.getFormatter("en-US", { timeZone: zone }).format(new Date());
      this._resolvedCache[cleanInput] = zone;
      return zone;
    } catch { }

    // 3. Compatibility fallback for older browsers
    const prefixes = ["Asia", "Europe", "America", "Australia", "Africa", "Pacific", "Atlantic", "Indian"];
    const formatted = zone.trim().replace(/\s+/g, "_");
    for (const prefix of prefixes) {
      const candidate = `${prefix}/${formatted}`;
      try {
        this.getFormatter("en-US", { timeZone: candidate }).format(new Date());
        this._resolvedCache[cleanInput] = candidate;
        return candidate;
      } catch { }
    }

    this._resolvedCache[cleanInput] = "UTC";
    return "UTC";
  },

  isValidZone(zone) {
    if (typeof zone !== "string" || !zone.trim()) return false;
    const resolved = this.resolveZone(zone);
    try {
      this.getFormatter("en-US", { timeZone: resolved }).format(new Date());
      return resolved !== "UTC" || zone.trim().toUpperCase() === "UTC";
    } catch {
      return false;
    }
  },

  formatTime(date, zone, options = {}) {
    try {
      const resolved = this.resolveZone(zone);
      const locale = State.currentLang === "zh" ? "zh-TW" : "en-US";
      const formatter = this.getFormatter(locale, {
        timeZone: resolved,
        hour: "2-digit",
        minute: options.withMinutes === false ? undefined : "2-digit",
        hour12: false,
        weekday: options.weekday ? "short" : undefined
      });
      return formatter.format(date);
    } catch {
      return "00:00";
    }
  },

  hourInZone(date, zone) {
    try {
      const resolved = this.resolveZone(zone);
      const formatter = this.getFormatter("en-US", {
        timeZone: resolved,
        hour: "2-digit",
        hourCycle: "h23"
      });
      const parts = formatter.formatToParts(date);
      const hourPart = parts.find((part) => part.type === "hour");
      return hourPart ? Number(hourPart.value) : date.getHours();
    } catch {
      return date.getHours();
    }
  },

  dateInZone(date, zone) {
    try {
      const resolved = this.resolveZone(zone);
      const formatter = this.getFormatter("en-US", {
        timeZone: resolved,
        month: "numeric",
        day: "numeric"
      });
      return formatter.format(date);
    } catch {
      return `${date.getMonth() + 1}/${date.getDate()}`;
    }
  },

  utcOffsetText(date, zone) {
    try {
      const resolved = this.resolveZone(zone);
      const formatter = this.getFormatter("en-US", {
        timeZone: resolved,
        timeZoneName: "shortOffset"
      });
      const parts = formatter.formatToParts(date);
      const offset = parts.find((part) => part.type === "timeZoneName")?.value || "GMT";
      const match = offset.match(/^GMT([+-])?(\d{1,2})?(?::?(\d{2}))?$/);
      if (!match || !match[1]) return "UTC+0";

      const sign = match[1];
      const hour = Number(match[2] || 0);
      const minute = match[3] ? `:${match[3]}` : "";
      return `UTC${sign}${hour}${minute}`;
    } catch {
      return "UTC+0";
    }
  },

  getOffsetMinutes(date, zone) {
    try {
      const resolved = this.resolveZone(zone);
      const formatter = this.getFormatter("en-US", {
        timeZone: resolved,
        timeZoneName: "longOffset"
      });
      const parts = formatter.formatToParts(date);
      const offsetStr = parts.find((part) => part.type === "timeZoneName")?.value || "GMT";
      if (offsetStr === "GMT") return 0;

      const match = offsetStr.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);
      if (!match) return 0;

      const sign = match[1] === "+" ? 1 : -1;
      const hours = Number(match[2]);
      const minutes = match[3] ? Number(match[3]) : 0;
      return sign * (hours * 60 + minutes);
    } catch {
      return 0;
    }
  },

  isCurrentlyDST(zone) {
    try {
      const resolved = this.resolveZone(zone);
      const currentYear = new Date().getFullYear();

      const jan = new Date(Date.UTC(currentYear, 0, 1));
      const jul = new Date(Date.UTC(currentYear, 6, 1));

      const janOffset = this.getOffsetMinutes(jan, resolved);
      const julOffset = this.getOffsetMinutes(jul, resolved);

      if (janOffset === julOffset) {
        return false;
      }

      const maxOffset = Math.max(janOffset, julOffset);
      const curOffset = this.getOffsetMinutes(new Date(), resolved);

      return curOffset === maxOffset;
    } catch {
      return false;
    }
  }
};

const I18nUtils = {
  getTranslation(key, params = {}) {
    let text = i18nTranslations[State.currentLang]?.[key] || "";
    for (const [pKey, pVal] of Object.entries(params)) {
      text = text.replace(`{${pKey}}`, pVal);
    }
    return text;
  },

  getCityName(city) {
    if (!city) return "";
    if (city.id.startsWith("custom-")) {
      return city.name;
    }
    if (city.id === "local") {
      if (city.matchingId) {
        return i18nCityNames[State.currentLang]?.[city.matchingId] || city.matchingId;
      }
      const parts = city.zone.split("/");
      return parts[parts.length - 1].replace(/_/g, " ");
    }
    return i18nCityNames[State.currentLang]?.[city.id] || city.id;
  }
};

const PeriodUtils = {
  getHourStyle(hour) {
    const period = State.timePeriods.find((p) => {
      if (p.start <= p.end) {
        return hour >= p.start && hour <= p.end;
      } else {
        return hour >= p.start || hour <= p.end;
      }
    });
    return period || State.timePeriods[2];
  }
};

const MapUtils = {
  mapPosition(city) {
    let cx = city.x;
    let cy = city.y;
    if (typeof city.lng === "number" && typeof city.lat === "number") {
      cx = 0.2816 * city.lng + 46.2357;
      cy = -0.5257 * city.lat + 63.3239;
    }
    const screenPercentX = MathUtils.clamp(50 + (cx - 50) * State.mapSettings.widthScale + State.mapSettings.lngOffset, 0, 100);
    const screenPercentY = MathUtils.clamp(50 + (cy - 50) * State.mapSettings.heightScale - State.mapSettings.latOffset, 0, 100);
    return {
      x: screenPercentX,
      y: screenPercentY
    };
  },

  getLongitudeX(lng) {
    const cx = 0.2816 * lng + 46.2357;
    return 50 + (cx - 50) * State.mapSettings.widthScale + State.mapSettings.lngOffset;
  },

  getXLongitude(x) {
    const cx = 50 + (x - 50 - State.mapSettings.lngOffset) / State.mapSettings.widthScale;
    return (cx - 46.2357) / 0.2816;
  },

  getCityCoordinates(city) {
    let lng = city.lng;
    let lat = city.lat;
    if (typeof lng !== "number" || typeof lat !== "number") {
      // Reverse calculate from x, y
      lng = (city.x - 46.2357) / 0.2816;
      lat = (city.y - 63.3239) / -0.5257;
    }
    const lngText = lng >= 0 ? `${lng.toFixed(1)}°E` : `${Math.abs(lng).toFixed(1)}°W`;
    const latText = lat >= 0 ? `${lat.toFixed(1)}°N` : `${Math.abs(lat).toFixed(1)}°S`;
    return `${lngText}, ${latText}`;
  }
};

const TimelineUtils = {
  getNowFraction() {
    const now = new Date();
    let hours, minutes;

    if (State.nowLineMode === "firstCity" && State.selectedIds.length > 0) {
      const firstCity = State.findCity(State.selectedIds[0]);
      if (firstCity) {
        const zone = TimeUtils.resolveZone(firstCity.zone);
        const formatter = TimeUtils.getFormatter("en-US", {
          timeZone: zone,
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23"
        });
        const parts = formatter.formatToParts(now);
        hours = Number(parts.find((p) => p.type === "hour").value);
        minutes = Number(parts.find((p) => p.type === "minute").value);
      } else {
        hours = now.getHours();
        minutes = now.getMinutes();
      }
    } else {
      // Default: browser local time
      hours = now.getHours();
      minutes = now.getMinutes();
    }

    return (hours + minutes / 60) / 24;
  },

  fractionToLeft(fraction) {
    const hoursEl = document.querySelector(".timeline-row .hours");
    if (!hoursEl || !DOM.timelinePanel) return 0;
    const gridRect = hoursEl.getBoundingClientRect();
    const panelRect = DOM.timelinePanel.getBoundingClientRect();
    const gridLeft = gridRect.left - panelRect.left;
    return gridLeft + fraction * gridRect.width;
  },

  leftToFraction(pxLeft) {
    const hoursEl = document.querySelector(".timeline-row .hours");
    if (!hoursEl || !DOM.timelinePanel) return 0;
    const gridRect = hoursEl.getBoundingClientRect();
    const panelRect = DOM.timelinePanel.getBoundingClientRect();
    const gridLeft = gridRect.left - panelRect.left;
    return MathUtils.clamp((pxLeft - gridLeft) / gridRect.width, 0, 1);
  }
};

const ColorUtils = {
  toHex7(colorStr) {
    if (!colorStr) return "#000000";
    colorStr = colorStr.trim();
    if (colorStr.startsWith("#")) {
      if (colorStr.length >= 7) {
        return colorStr.slice(0, 7);
      }
      return colorStr;
    }
    const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (match) {
      const r = Number(match[1]).toString(16).padStart(2, "0");
      const g = Number(match[2]).toString(16).padStart(2, "0");
      const b = Number(match[3]).toString(16).padStart(2, "0");
      return `#${r}${g}${b}`;
    }
    return "#000000";
  }
};
