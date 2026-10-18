/**
 * TimeMapper - Shared Minimap Rendering Module
 */

import { State } from "./state.js";
import { MapUtils, TimeUtils, I18nUtils, MathUtils, TimelineUtils } from "./utils.js";

export const MapPreview = {
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
    }
    if (refs.mapTimeLabelLayer) {
      refs.mapTimeLabelLayer.style.transform = `translateY(${State.mapSettings.mapYOffset || 0}px)`;
    }

    const activeFraction = State.getActiveScrubFraction();
    const useFraction = activeFraction !== null ? activeFraction : TimelineUtils.getNowFraction();
    let targetDate = null;
    if (useFraction !== null && State.baseHours && State.baseHours[0]) {
      targetDate = new Date(State.baseHours[0].getTime() + useFraction * 24 * 3600000);
    }

    // Single delegated click listener on cityLayer instead of 70+ closures
    if (refs.cityLayer && !refs.cityLayer._hasCityDelegation) {
      refs.cityLayer._hasCityDelegation = true;
      refs.cityLayer.addEventListener("click", (e) => {
        const pin = e.target.closest(".city-pin");
        if (!pin || !refs.cityLayer.contains(pin)) return;
        e.stopPropagation();
        const cityId = pin.dataset.id;
        if (cityId) {
          State.toggleCity(cityId);
          if (refs._onCityToggle) refs._onCityToggle();
        }
      });
    }
    refs._onCityToggle = onCityToggle;

    const allCities = State.allCities();
    const existingPins = refs.cityLayer ? Array.from(refs.cityLayer.children) : [];

    // In-place patch if structure matches (same cities in same order)
    if (existingPins.length === allCities.length &&
        existingPins.every((btn, idx) => btn.dataset.id === allCities[idx].id)) {
      existingPins.forEach((btn, idx) => {
        const city = allCities[idx];
        const isSelected = State.selectedIds.includes(city.id);
        btn.classList.toggle("is-selected", isSelected);
      });

      // Synchronize label layer for selected cities
      if (refs.mapTimeLabelLayer) {
        const existingLabels = Array.from(refs.mapTimeLabelLayer.children);
        const labelsMatch = existingLabels.length === State.selectedIds.length &&
          existingLabels.every((lbl, idx) => lbl.dataset.id === State.selectedIds[idx]);
        if (!labelsMatch) {
          refs.mapTimeLabelLayer.innerHTML = "";
          const lblFrag = document.createDocumentFragment();
          State.selectedIds.forEach((id) => {
            const city = State.findCity(id);
            if (!city) return;
            const position = MapUtils.mapPosition(city);
            const label = document.createElement("div");
            label.className = "map-time-label";
            label.style.left = `${position.x}%`;
            label.style.top = `${position.y}%`;
            label.dataset.id = city.id;
            label.dataset.zone = city.zone;
            lblFrag.append(label);
          });
          refs.mapTimeLabelLayer.append(lblFrag);
        }
        this.updateMapCityTimes(refs, activeFraction);
      }
      return;
    }

    if (refs.cityLayer) refs.cityLayer.innerHTML = "";
    if (refs.mapTimeLabelLayer) refs.mapTimeLabelLayer.innerHTML = "";

    const pinFrag = document.createDocumentFragment();
    const labelFrag = refs.mapTimeLabelLayer ? document.createDocumentFragment() : null;

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
      pinFrag.append(button);

      if (isSelected && labelFrag) {
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

        labelFrag.append(label);
      }
    });

    if (refs.cityLayer) refs.cityLayer.append(pinFrag);
    if (refs.mapTimeLabelLayer && labelFrag) refs.mapTimeLabelLayer.append(labelFrag);
  },

  /**
   * Screen-x position of each 2-hour solar terminator line, wrapped into the
   * visible span around the map centre. `x` is intentionally unclamped so each
   * caller can pick its own policy: the hour lines pin to the edges, the
   * timeline strip drops off-map ticks.
   */
  hourLinePositions(offsetHours) {
    const subsolarLng = MapUtils.subsolarLng(this.shiftedNow(offsetHours));
    const centerLng = MapUtils.getXLongitude(50);
    const out = [];
    for (let h = 0; h < 24; h += 2) {
      let diff = subsolarLng + (h - 12) * 15 - centerLng;
      diff = ((diff + 180) % 360 + 360) % 360 - 180;
      out.push({ hour: h, x: MapUtils.getLongitudeX(centerLng + diff) });
    }
    return out;
  },

  renderHourLines(refs, offsetHours = 0) {
    if (!refs.hourLines) return;
    refs.hourLines.innerHTML = "";
    refs.hourLines.style.backgroundImage = "none";

    const frag = document.createDocumentFragment();
    for (const { x: rawX } of this.hourLinePositions(offsetHours)) {
      const line = document.createElement("div");
      line.style.position = "absolute";
      line.style.left = `${MathUtils.clamp(rawX, 0, 100)}%`;
      line.style.top = "0";
      line.style.bottom = "0";
      line.style.width = "1px";
      line.style.backgroundColor = "rgba(8, 74, 96, 0.18)";
      frag.append(line);
    }
    refs.hourLines.append(frag);
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

    const frag = document.createDocumentFragment();
    for (const { hour, x } of this.hourLinePositions(offsetHours)) {
      if (x < 0 || x > 100) continue;
      const tick = document.createElement("div");
      tick.className = "map-timeline-tick";
      tick.style.left = `${x}%`;

      const label = document.createElement("div");
      label.className = "map-timeline-label";
      label.style.left = `${x}%`;
      label.textContent = `${String(hour).padStart(2, "0")}:00`;

      frag.append(tick, label);
    }
    refs.mapTimeline.append(frag);
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

if (typeof globalThis !== "undefined") {
  globalThis.MapPreview = MapPreview;
}
