/**
 * TimeMapper - Shared Minimap Rendering Module
 *
 * Pure rendering of the world-map preview (pins, night area, hour lines,
 * map timeline strip). Consumed by the popup (Renderer delegates to it)
 * and by the options-page live preview. All DOM access goes through the
 * `refs` object so both pages share one implementation; the only
 * page-specific part is the `onCityToggle` callback after a pin click.
 *
 * Expects State / MapUtils / TimeUtils / I18nUtils / MathUtils loaded.
 */

const MapPreview = {
  ASSET_PATH: "../../assets/world-map.jpg",

  /** "Now" shifted by `offsetHours`; every sun-driven layer shares this. */
  shiftedNow(offsetHours) {
    return new Date(Date.now() + offsetHours * 60 * 60 * 1000);
  },

  /**
   * Collect the nodes this module renders into. `root` is `document`
   * in the popup or the mount element built by buildPreview().
   */
  collectRefs(root) {
    const q = (sel) => root.querySelector(sel);
    return {
      mapImg: q(".world-map"),
      cityLayer: q(".city-layer"),
      mapTimeLabelLayer: q(".map-time-label-layer"),
      hourLines: q(".hour-lines"),
      nightAreaOverlay: q(".night-area-overlay"),
      nightPath: q("#nightPath"),
      nightPathRef: q("#nightPathRef"),
      mapTimeline: q(".map-timeline"),
    };
  },

  /**
   * Build a standalone preview (map shell + timeline strip) into `mount`.
   * Same relative asset path works from src/popup/ and src/options/.
   */
  buildPreview(mount) {
    mount.innerHTML = "";

    const shell = document.createElement("div");
    shell.className = "map-shell";

    const img = document.createElement("img");
    img.className = "world-map";
    img.src = this.ASSET_PATH;
    img.alt = "World Map";
    shell.append(img);

    const hourLines = document.createElement("div");
    hourLines.className = "hour-lines";
    hourLines.setAttribute("aria-hidden", "true");
    shell.append(hourLines);

    const svgNS = "http://www.w3.org/2000/svg";
    const overlay = document.createElementNS(svgNS, "svg");
    overlay.setAttribute("class", "night-area-overlay");
    overlay.setAttribute("viewBox", "0 0 100 100");
    overlay.setAttribute("preserveAspectRatio", "none");
    overlay.setAttribute("aria-hidden", "true");
    const nightPath = document.createElementNS(svgNS, "path");
    nightPath.setAttribute("id", "nightPath");
    nightPath.setAttribute("d", "");
    const nightPathRef = document.createElementNS(svgNS, "path");
    nightPathRef.setAttribute("id", "nightPathRef");
    nightPathRef.setAttribute("d", "");
    overlay.append(nightPath, nightPathRef);
    shell.append(overlay);

    const cityLayer = document.createElement("div");
    cityLayer.className = "city-layer";
    cityLayer.setAttribute("aria-label", "City Pins");
    shell.append(cityLayer);

    const labelLayer = document.createElement("div");
    labelLayer.className = "map-time-label-layer";
    labelLayer.setAttribute("aria-hidden", "true");
    shell.append(labelLayer);

    const timeline = document.createElement("div");
    timeline.id = "mapTimeline";
    timeline.className = "map-timeline";
    timeline.setAttribute("aria-hidden", "true");

    mount.append(shell, timeline);
    return this.collectRefs(mount);
  },

  renderPins(refs, onCityToggle) {
    if (refs.mapImg) {
      refs.mapImg.style.transform = `translateY(calc(-50% + ${State.mapSettings.mapYOffset || 0}px))`;
    }
    if (refs.cityLayer) {
      refs.cityLayer.style.transform = `translateY(${State.mapSettings.mapYOffset || 0}px)`;
      refs.cityLayer.innerHTML = "";
    }
    if (refs.mapTimeLabelLayer) {
      refs.mapTimeLabelLayer.style.transform = `translateY(${State.mapSettings.mapYOffset || 0}px)`;
      refs.mapTimeLabelLayer.innerHTML = "";
    }

    const activeFraction = State.getActiveScrubFraction();
    const useFraction = activeFraction !== null ? activeFraction : TimelineUtils.getNowFraction();
    let targetDate = null;
    if (useFraction !== null && State.baseHours && State.baseHours[0]) {
      targetDate = new Date(State.baseHours[0].getTime() + useFraction * 24 * 3600000);
    }

    State.allCities().forEach((city) => {
      const position = MapUtils.mapPosition(city);
      const button = document.createElement("button");
      button.type = "button";
      const isSelected = State.selectedIds.includes(city.id);
      button.className = `city-pin${isSelected ? " is-selected" : ""}`;
      button.style.left = `${position.x}%`;
      button.style.top = `${position.y}%`;
      button.dataset.id = city.id;
      button.dataset.zone = city.zone;

      const cityName = I18nUtils.getCityName(city);
      button.title = cityName;
      button.setAttribute("aria-label", I18nUtils.getTranslation("selectCity", { name: cityName }));
      button.addEventListener("click", () => {
        State.toggleCity(city.id);
        if (onCityToggle) onCityToggle();
      });
      if (refs.cityLayer) refs.cityLayer.append(button);

      if (isSelected && refs.mapTimeLabelLayer) {
        const label = document.createElement("div");
        label.className = "map-time-label";
        label.style.left = `${position.x}%`;
        label.style.top = `${position.y}%`;
        label.dataset.id = city.id;
        label.dataset.zone = city.zone;

        if (targetDate) {
          label.textContent = TimeUtils.formatTime(targetDate, city.zone);
          label.style.display = "";
        } else {
          label.style.display = "none";
        }

        refs.mapTimeLabelLayer.append(label);
      }
    });
  },

  renderHourLines(refs, offsetHours = 0) {
    if (!refs.hourLines) return;
    refs.hourLines.innerHTML = "";
    refs.hourLines.style.backgroundImage = "none";

    const subsolarLng = MapUtils.subsolarLng(this.shiftedNow(offsetHours));
    const centerLng = MapUtils.getXLongitude(50);

    for (let h = 0; h < 24; h += 2) {
      const baseLng = subsolarLng + (h - 12) * 15;
      let diff = baseLng - centerLng;
      diff = ((diff + 180) % 360 + 360) % 360 - 180;
      const lng = centerLng + diff;

      const x = MathUtils.clamp(MapUtils.getLongitudeX(lng), 0, 100);

      const line = document.createElement("div");
      line.style.position = "absolute";
      line.style.left = `${x}%`;
      line.style.top = "0";
      line.style.bottom = "0";
      line.style.width = "1px";
      line.style.backgroundColor = "rgba(8, 74, 96, 0.18)";
      refs.hourLines.append(line);
    }
  },

  calcNightPoints(offsetHours) {
    const DECLINATION_DEG = 35.0;
    const tanDec = Math.tan(DECLINATION_DEG * Math.PI / 180);
    const Y_SHIFT = 10;

    const subsolarLng = MapUtils.subsolarLng(this.shiftedNow(offsetHours));

    const points = [];
    for (let x = 0; x <= 100; x += 2) {
      const lng = MapUtils.getXLongitude(x);
      const lat = Math.atan(-Math.cos((lng - subsolarLng) * Math.PI / 180) / tanDec)
        * 180 / Math.PI + Y_SHIFT;
      const { x: px, y: py } = MapUtils.mapPosition({ lng, lat });
      points.push(`${px.toFixed(1)},${py.toFixed(1)}`);
    }
    return points;
  },

  renderMapTimeline(refs, offsetHours = 0) {
    if (!refs.mapTimeline) return;
    refs.mapTimeline.innerHTML = "";

    const subsolarLng = MapUtils.subsolarLng(this.shiftedNow(offsetHours));
    const centerLng = MapUtils.getXLongitude(50);

    for (let h = 0; h < 24; h += 2) {
      const baseLng = subsolarLng + (h - 12) * 15;
      let diff = baseLng - centerLng;
      diff = ((diff + 180) % 360 + 360) % 360 - 180;
      const lng = centerLng + diff;

      const x = MapUtils.getLongitudeX(lng);
      if (x >= 0 && x <= 100) {
        const tick = document.createElement("div");
        tick.className = "map-timeline-tick";
        tick.style.left = `${x}%`;

        const label = document.createElement("div");
        label.className = "map-timeline-label";
        label.style.left = `${x}%`;
        label.textContent = `${String(h).padStart(2, "0")}:00`;

        refs.mapTimeline.append(tick, label);
      }
    }
  },

  renderNightArea(refs, offsetHours = 0) {
    if (!refs.nightPath) return;

    this.renderMapTimeline(refs, offsetHours);
    this.renderHourLines(refs, offsetHours);

    if (refs.nightAreaOverlay) {
      refs.nightAreaOverlay.style.transform = `translateY(${State.mapSettings.mapYOffset || 0}px)`;
    }

    // Filled night area — always at the true "now" position (offset = 0)
    const realNowPts = this.calcNightPoints(0);
    refs.nightPath.setAttribute("d", `M 0,100 L ${realNowPts.join(" L ")} L 100,100 Z`);

    // Dynamic reference curve — follows the active scrub line offset
    if (refs.nightPathRef) {
      const activePts = this.calcNightPoints(offsetHours);
      refs.nightPathRef.setAttribute("d", `M ${activePts.join(" L ")}`);
    }

    // Live update local times for selected cities on the map
    const activeFraction = State.getActiveScrubFraction();
    this.updateMapCityTimes(refs, activeFraction);
  },

  updateMapCityTimes(refs, activeFraction) {
    if (!refs.mapTimeLabelLayer) return;

    const useFraction = activeFraction !== null ? activeFraction : TimelineUtils.getNowFraction();

    if (useFraction === null || !State.baseHours || !State.baseHours[0]) {
      refs.mapTimeLabelLayer.querySelectorAll(".map-time-label").forEach((label) => {
        label.style.display = "none";
        label.textContent = "";
      });
      return;
    }

    const targetDate = new Date(State.baseHours[0].getTime() + useFraction * 24 * 3600000);

    refs.mapTimeLabelLayer.querySelectorAll(".map-time-label").forEach((label) => {
      const zone = label.dataset.zone;
      if (zone) {
        label.textContent = TimeUtils.formatTime(targetDate, zone);
        label.style.display = "";
      }
    });
  },

  applyVisibility(refs) {
    if (refs.nightAreaOverlay) {
      refs.nightAreaOverlay.style.display = State.mapSettings.showNightArea ? "" : "none";
    }
    if (refs.hourLines) {
      refs.hourLines.style.display = State.mapSettings.showHourLines ? "" : "none";
    }
    if (refs.mapTimeLabelLayer) {
      refs.mapTimeLabelLayer.style.display = State.mapSettings.showCityTimes ? "" : "none";
    }
  },

  /** Full repaint: pins + night + timeline + visibility. */
  renderAll(refs, onCityToggle, offsetHours = 0) {
    this.renderPins(refs, onCityToggle);
    this.renderNightArea(refs, offsetHours);
    this.applyVisibility(refs);
  },
};
