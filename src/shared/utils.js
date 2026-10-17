/**
 * TimeMapper - Utilities Module
 */

const MathUtils = {
  clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
};

const EscapeUtils = {
  HTML_ENTITIES: {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  },

  /**
   * Escape a value for safe interpolation into an innerHTML template.
   * Only needed for values from user input or remote APIs.
   */
  html(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => EscapeUtils.HTML_ENTITIES[char]);
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
      const locale = CONFIG.localeMap[State.currentLang] || "en-US";
      const formatter = this.getFormatter(locale, {
        timeZone: resolved,
        hour: "2-digit",
        minute: "2-digit",
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
  /**
   * The one place that maps translation keys onto the DOM. Both the popup and
   * the options page call applyAttributes(); neither should re-implement it.
   * `pick`/`put` describe how each attribute type reads its key and writes its
   * value, because textContent and an attribute are not interchangeable.
   */
  _attributes: [
    { selector: "[data-i18n]", pick: (el) => el.dataset.i18n, put: (el, text) => { el.textContent = text; } },
    { selector: "[data-i18n-placeholder]", pick: (el) => el.dataset.i18nPlaceholder, put: (el, text) => { el.placeholder = text; } },
    { selector: "[data-i18n-title]", pick: (el) => el.dataset.i18nTitle, put: (el, text) => { el.title = text; } },
    { selector: "[data-i18n-aria-label]", pick: (el) => el.dataset.i18nAriaLabel, put: (el, text) => { el.setAttribute("aria-label", text); } }
  ],

  /**
   * Translate every marked element under `root` and announce the language to
   * assistive tech via <html lang>.
   *
   * A key missing from the active dictionary is reported rather than silently
   * left as the hard-coded text in the HTML, which would otherwise render as a
   * random language inside an otherwise translated page.
   */
  applyAttributes(root = document) {
    const lang = State.currentLang;
    const dict = i18nTranslations[lang];

    if (!dict) {
      console.warn(`[i18n] no dictionary for language "${lang}"; leaving all marked text untranslated`);
    } else {
      for (const { selector, pick, put } of this._attributes) {
        root.querySelectorAll(selector).forEach((elem) => {
          const key = pick(elem);
          const text = dict[key];
          if (text === undefined || text === "") {
            console.warn(`[i18n] missing key "${key}" for language "${lang}" (${selector}); showing HTML fallback: "${(elem.textContent || "").trim()}"`);
            return;
          }
          put(elem, text);
        });
      }
    }

    document.documentElement.lang = CONFIG.localeMap[lang] || lang;
  },

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
  /** Active theme, following theme.js; falls back to light. */
  currentTheme() {
    try {
      if (globalThis.TimeMapperTheme) {
        return globalThis.TimeMapperTheme.resolve(localStorage.getItem("theme") || "auto");
      }
    } catch { }
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  },
  /** Fixed palette entry for a period index under the active theme. */
  getPeriodColors(idx) {
    const count = (typeof State !== "undefined" && State.timePeriods && State.timePeriods.length) || 3;
    const byCount = CONFIG.periodColorsByCount[count] || CONFIG.periodColorsByCount[3];
    const set = byCount[this.currentTheme()] || byCount.light;
    return set[idx] || set[set.length - 1];
  },
  getHourStyle(hour) {
    let idx = State.timePeriods.findIndex((p) => {
      if (p.start <= p.end) {
        return hour >= p.start && hour <= p.end;
      } else {
        return hour >= p.start || hour <= p.end;
      }
    });
    if (idx < 0) idx = State.timePeriods.length - 1;
    const period = State.timePeriods[idx];
    return { ...period, ...this.getPeriodColors(idx) };
  }
};

const MapUtils = {
  /**
   * Longitude of the subsolar point (where the sun is directly overhead)
   * for the given instant, in degrees.
   */
  subsolarLng(date) {
    return -(date.getUTCHours() + date.getUTCMinutes() / 60 - 12) * 15;
  },

  lngToX(lng) {
    return PROJECTION.lngX * lng + PROJECTION.lngXOffset;
  },

  xToLng(x) {
    return (x - PROJECTION.lngXOffset) / PROJECTION.lngX;
  },

  latToY(lat) {
    return PROJECTION.latY * lat + PROJECTION.latYOffset;
  },

  yToLat(y) {
    return (y - PROJECTION.latYOffset) / PROJECTION.latY;
  },

  lngLatOf(city) {
    if (typeof city.lng === "number" && typeof city.lat === "number") {
      return { lng: city.lng, lat: city.lat };
    }
    return { lng: this.xToLng(city.x), lat: this.yToLat(city.y) };
  },

  /**
   * Apply the user's calibration (scale + offset) to a base-map percentage.
   * `uncalibrate*` are the exact inverses, so a screen percentage can be
   * mapped back to the uncalibrated base map.
   */
  calibrateX(x) {
    return 50 + (x - 50) * State.mapSettings.widthScale + State.mapSettings.lngOffset;
  },

  calibrateY(y) {
    return 50 + (y - 50) * State.mapSettings.heightScale - State.mapSettings.latOffset;
  },

  uncalibrateX(screenX) {
    return 50 + (screenX - 50 - State.mapSettings.lngOffset) / State.mapSettings.widthScale;
  },

  uncalibrateY(screenY) {
    return 50 + (screenY - 50 + State.mapSettings.latOffset) / State.mapSettings.heightScale;
  },

  mapPosition(city) {
    const hasLngLat = typeof city.lng === "number" && typeof city.lat === "number";
    const cx = hasLngLat ? this.lngToX(city.lng) : city.x;
    const cy = hasLngLat ? this.latToY(city.lat) : city.y;
    return {
      x: MathUtils.clamp(this.calibrateX(cx), 0, 100),
      y: MathUtils.clamp(this.calibrateY(cy), 0, 100)
    };
  },

  /** Unclamped screen-x percentage for a longitude. */
  getLongitudeX(lng) {
    return this.calibrateX(this.lngToX(lng));
  },

  getXLongitude(screenX) {
    return this.xToLng(this.uncalibrateX(screenX));
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

  /**
   * Grid geometry of the hours row, expressed relative to the timeline panel:
   * where the grid starts and how wide it is. Returns null when the timeline
   * has not been laid out yet (or `scope` is not a searchable root).
   *
   * `scope` is the timeline panel element (or an ancestor of it); it defaults
   * to `document` for the popup. Needed because the options page hosts a
   * second, independent timeline that must measure its own geometry.
   */
  gridGeometry(scope) {
    const root = scope && scope.querySelector ? scope : (typeof document !== "undefined" ? document : null);
    if (!root) return null;
    const hoursEl = root.querySelector(".timeline-row .hours");
    const panelEl = root.matches && root.matches(".timeline-panel") ? root : root.querySelector(".timeline-panel");
    if (!hoursEl || !panelEl || !hoursEl.getBoundingClientRect || !panelEl.getBoundingClientRect) return null;
    const gridRect = hoursEl.getBoundingClientRect();
    const panelRect = panelEl.getBoundingClientRect();
    return {
      gridLeft: gridRect.left - panelRect.left,
      gridWidth: gridRect.width
    };
  },

  /** Convert a 0-1 day fraction to a pixel offset inside the timeline panel. */
  fractionToLeft(fraction, scope) {
    const geo = this.gridGeometry(scope);
    if (!geo) return 0;
    return geo.gridLeft + fraction * geo.gridWidth;
  },

  leftToFraction(pxLeft, scope) {
    const geo = this.gridGeometry(scope);
    if (!geo) return 0;
    return MathUtils.clamp((pxLeft - geo.gridLeft) / geo.gridWidth, 0, 1);
  },

  formatFractionTime(fraction) {
    if (typeof fraction !== "number" || isNaN(fraction)) return "--:--";
    let totalMinutes = Math.round(fraction * 24 * 60);
    totalMinutes = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  },

  snapToFiveMinutes(fraction) {
    if (typeof fraction !== "number" || isNaN(fraction)) return 0;
    const totalMinutes = Math.round(fraction * 24 * 60);
    const snappedMinutes = Math.round(totalMinutes / 5) * 5;
    return MathUtils.clamp(snappedMinutes / (24 * 60), 0, 1);
  }
};
