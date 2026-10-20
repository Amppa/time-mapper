import { CONFIG } from "../shared/config.js";
import { State } from "../shared/state.js";
import {
  MathUtils,
  TimeUtils,
  MapUtils,
  TimelineUtils,
  I18nUtils,
  PeriodUtils,
  EscapeUtils
} from "../shared/utils.js";
import { TimeMapperVersion } from "../shared/version.js";
import { MapPreview } from "../shared/map-preview.js";
import { TimelinePreview } from "../shared/timeline-preview.js";
import { CityPreview } from "../shared/city-preview.js";
import { Storage } from "../shared/storage.js";

async function initOptions() {
  await State.init();

  // Surface sync write failures (quota, revoked permission) in the existing
  // inline status line instead of blocking dialogs.
  Storage.setWriteErrorHook(() => {
    if (cityRefs) {
      CityPreview.setSearchStatus(cityRefs, I18nUtils.getTranslation("storageWriteFailed"), true);
    }
  });

  const versionLabel = document.getElementById("versionLabel");
  if (globalThis.TimeMapperVersion) {
    globalThis.TimeMapperVersion.render(versionLabel);
  }

  // DOM Elements
  const langSelect = document.getElementById("langSelect");
  const nowLineModeSelect = document.getElementById("nowLineModeSelect");
  const themeSelect = document.getElementById("themeSelect");
  const resetMapButton = document.getElementById("resetMapButton");
  const resetPeriodsButton = document.getElementById("resetPeriodsButton");

  // Live minimap preview (shares MapPreview with the popup)
  const mapPreviewMount = document.getElementById("mapPreviewMount");
  const mapPreviewRefs = mapPreviewMount ? MapPreview.buildPreview(mapPreviewMount) : null;

  /**
   * Repaint the minimap preview from current State (ranges need base hours).
   */
  function renderMapPreview() {
    if (!mapPreviewRefs) return;
    State.makeBaseHours();
    MapPreview.renderAll(mapPreviewRefs, renderPreviews, State.selectedOffsetHours);
  }

  // Live timeline preview (shares TimelinePreview with the popup)
  const timelinePreviewMount = document.getElementById("timelinePreviewMount");
  const timelinePreviewRefs = timelinePreviewMount ? TimelinePreview.buildPreview(timelinePreviewMount) : null;

  /**
   * Repaint the timeline preview (rows + now-line + scrub markers).
   */
  function renderTimelinePreview() {
    if (!timelinePreviewRefs) return;
    State.makeBaseHours();
    TimelinePreview.renderAll(timelinePreviewRefs);
  }

  // Live cities list (shares CityPreview with the popup)
  const citiesMount = document.getElementById("cardCities");
  const cityRefs = citiesMount ? CityPreview.collectRefs(citiesMount) : null;

  /**
   * Repaint the cities list from current State.
   */
  function renderCities() {
    if (!cityRefs) return;
    CityPreview.renderCurrentCitiesList(cityRefs, renderPreviews);
  }

  /** Repaint both previews + cities (selection / language / periods / storage). */
  function renderPreviews() {
    renderMapPreview();
    renderTimelinePreview();
    renderCities();
  }

  // Scrub interaction inside the timeline preview; night ref curve follows
  // on the map preview, mirroring the popup wiring.
  if (timelinePreviewRefs && mapPreviewRefs) {
    TimelinePreview.wireScrub(timelinePreviewRefs, {
      renderScrubLine: () => TimelinePreview.renderScrubLine(timelinePreviewRefs),
      renderNightArea: (offsetHours) => {
        MapPreview.renderNightArea(mapPreviewRefs, offsetHours);
        MapPreview.renderNightDecorations(mapPreviewRefs, offsetHours);
      },
    });
  }

  if (mapPreviewRefs) {
    MapPreview.wireMapClick(mapPreviewRefs, renderPreviews);
  }

  /**
   * Apply translations across the options page based on State.currentLang
   */
  function applyLanguage() {
    const lang = State.currentLang || "zh";

    I18nUtils.applyAttributes();

    // Reflect the stored language preference in the dropdown
    if (langSelect && typeof State.getLanguagePreference === "function") {
      langSelect.value = State.getLanguagePreference();
    }

    // Refresh period preview strings and labels
    renderPeriodControls();
    renderTimelinePreview();
  }

  /**
   * Format numerical setting values
   */
  function formatSettingValue(key, val) {
    const num = Number(val);
    if (key.endsWith("Scale")) return num.toFixed(2);
    if (key === "mapYOffset") return String(Math.round(num));
    return num.toFixed(1);
  }

  /**
   * Render Minimap settings controls
   */
  function renderMapControls() {
    const settings = State.mapSettings || CONFIG.defaultMapSettings;

    // Toggles
    ["showNightArea", "showHourLines", "showCityTimes"].forEach((key) => {
      const checkbox = document.querySelector(`input[type="checkbox"][data-setting="${key}"]`);
      if (checkbox) {
        checkbox.checked = !!settings[key];
      }
    });

    // Sliders & outputs
    ["lngOffset", "latOffset", "widthScale", "heightScale", "mapYOffset"].forEach((key) => {
      const slider = document.querySelector(`input[type="range"][data-setting="${key}"]`);
      const output = document.querySelector(`output[data-output="${key}"]`);
      const val = settings[key] !== undefined ? settings[key] : CONFIG.defaultMapSettings[key];

      if (slider) {
        slider.value = String(val);
      }
      if (output) {
        output.textContent = formatSettingValue(key, val);
      }
    });
  }

  /**
   * Update a specific map setting and save
   */
  function updateMapSetting(key, value) {
    const input = document.querySelector(`[data-setting="${key}"]`);
    if (!input) return;

    const min = Number(input.min);
    const max = Number(input.max);
    const next = MathUtils.clamp(Number(value), min, max);

    State.mapSettings = {
      ...State.mapSettings,
      [key]: key.endsWith("Scale") ? Number(next.toFixed(2)) : (key === "mapYOffset" ? Math.round(next) : Number(next.toFixed(1)))
    };
    State.saveMapSettings();

    input.value = String(State.mapSettings[key]);
    const output = document.querySelector(`output[data-output="${key}"]`);
    if (output) {
      output.textContent = formatSettingValue(key, State.mapSettings[key]);
    }
    renderMapPreview();
  }

  // --------------------------------------------------------------------------
  // Interactive 24-Hour Grid Timeline (Matches Preview Timeline Style)
  // --------------------------------------------------------------------------
  const periodCountSelect = document.getElementById("periodCountSelect");
  const interactiveHours = document.getElementById("interactiveHours");
  const timelineDividersLayer = document.getElementById("timelineDividersLayer");

  const PERIOD_META = {
    2: [
      { key: "day", labelKey: "periodDay", icon: "☀️" },
      { key: "night", labelKey: "periodNight", icon: "🌙" }
    ],
    3: [
      { key: "day", labelKey: "periodDay", icon: "☀️" },
      { key: "evening", labelKey: "periodEvening", icon: "🌇" },
      { key: "night", labelKey: "periodLateNight", icon: "🌙" }
    ],
    4: [
      { key: "morning", labelKey: "periodMorning", icon: "🌅" },
      { key: "day", labelKey: "periodDay", icon: "☀️" },
      { key: "evening", labelKey: "periodEvening", icon: "🌇" },
      { key: "night", labelKey: "periodNight", icon: "🌙" }
    ]
  };

  /**
   * Render the 24 hour cells (00 - 23) styled identically to the preview timeline
   */
  function renderInteractiveHours() {
    if (!interactiveHours) return;
    interactiveHours.innerHTML = "";

    for (let h = 0; h < 24; h++) {
      const cell = document.createElement("div");
      cell.className = "hour-cell interactive-hour-cell";
      cell.textContent = String(h).padStart(2, "0");
      cell.dataset.hour = String(h);
      cell.title = I18nUtils.getTranslation("hourCellTitle", { time: `${String(h).padStart(2, "0")}:00` });

      const styleInfo = PeriodUtils.getHourStyle(h);
      cell.style.backgroundColor = styleInfo.color;
      cell.style.color = styleInfo.fontColor;

      // Click on cell to snap nearest divider to this boundary
      cell.addEventListener("click", () => {
        handleCellClick(h);
      });

      interactiveHours.appendChild(cell);
    }
  }

  /**
   * Render draggable divider handles at period start points
   */
  function renderTimelineDividers() {
    if (!timelineDividersLayer) return;
    timelineDividersLayer.innerHTML = "";

    const count = State.timePeriods.length;
    const metaList = PERIOD_META[count] || PERIOD_META[3];

    State.timePeriods.forEach((period, idx) => {
      const meta = metaList[idx] || { labelKey: "periodFallback", icon: "⏰" };
      const label = I18nUtils.getTranslation(meta.labelKey, { index: idx + 1 });
      const divider = document.createElement("div");
      divider.className = "timeline-divider";
      divider.dataset.periodIndex = String(idx);
      divider.style.left = `${(period.start / 24) * 100}%`;
      divider.setAttribute("tabindex", "0");
      divider.setAttribute("role", "slider");
      divider.setAttribute("aria-label", I18nUtils.getTranslation("periodStartAria", { label }));
      divider.setAttribute("aria-valuenow", String(period.start));

      // Top knob with icon & hour text
      const topKnob = document.createElement("div");
      topKnob.className = "timeline-divider-knob top-knob";
      topKnob.textContent = `${meta.icon} ${String(period.start).padStart(2, "0")}:00`;

      // Vertical line
      const line = document.createElement("div");
      line.className = "timeline-divider-line";

      // Bottom knob
      const bottomKnob = document.createElement("div");
      bottomKnob.className = "timeline-divider-knob bottom-knob";

      divider.append(topKnob, line, bottomKnob);
      wireDividerDrag(divider, idx);
      timelineDividersLayer.appendChild(divider);
    });
  }

  /**
   * Move period divider to target hour with collision prevention
   */
  function moveDividerToHour(idx, targetHour) {
    const N = State.timePeriods.length;
    const prevIdx = (idx - 1 + N) % N;
    const nextIdx = (idx + 1) % N;

    const prevStart = State.timePeriods[prevIdx].start;
    const nextStart = State.timePeriods[nextIdx].start;

    // Minimum gap: targetHour cannot collide with prevStart or nextStart
    if (targetHour === prevStart || targetHour === nextStart) return false;

    // Check circular ordering
    // The current period must be between prevStart and nextStart in circular 24h space
    const isInsidePrev = (prevStart < nextStart)
      ? (targetHour > prevStart && targetHour < nextStart)
      : (targetHour > prevStart || targetHour < nextStart);

    if (!isInsidePrev) return false;

    // Apply change
    State.timePeriods[idx].start = targetHour;
    State.timePeriods[prevIdx].end = (targetHour - 1 + 24) % 24;

    State.saveTimePeriods();
    renderInteractiveHours();
    renderTimelineDividers();
    renderTimelinePreview();
    return true;
  }

  /**
   * Handle click on an hour cell
   */
  function handleCellClick(targetHour) {
    const N = State.timePeriods.length;
    let bestIdx = -1;
    let minDistance = 999;

    for (let i = 0; i < N; i++) {
      const start = State.timePeriods[i].start;
      const dist = Math.min(
        Math.abs(targetHour - start),
        24 - Math.abs(targetHour - start)
      );
      if (dist < minDistance && dist > 0) {
        minDistance = dist;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) {
      moveDividerToHour(bestIdx, targetHour);
    }
  }

  /**
   * Wire pointer and keyboard drag events for a divider handle
   */
  function wireDividerDrag(dividerEl, idx) {
    let isDragging = false;

    function onPointerMove(e) {
      if (!isDragging) return;
      const rect = interactiveHours.getBoundingClientRect();
      if (rect.width <= 0) return;

      const px = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const rawHour = Math.round((px / rect.width) * 24) % 24;

      moveDividerToHour(idx, rawHour);
    }

    function onPointerUp() {
      if (!isDragging) return;
      isDragging = false;
      dividerEl.classList.remove("is-dragging");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    }

    dividerEl.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      dividerEl.classList.add("is-dragging");
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
      e.preventDefault();
    });

    // Keyboard support (ArrowLeft / ArrowRight)
    dividerEl.addEventListener("keydown", (e) => {
      let delta = 0;
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") delta = -1;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") delta = 1;
      if (delta === 0) return;

      const currentStart = State.timePeriods[idx].start;
      const targetHour = (currentStart + delta + 24) % 24;
      moveDividerToHour(idx, targetHour);
      e.preventDefault();
    });
  }

  /**
   * Render Time Period settings controls
   */
  function renderPeriodControls() {
    if (nowLineModeSelect) {
      nowLineModeSelect.value = State.nowLineMode;
    }

    const count = (State.timePeriods && State.timePeriods.length) || 3;
    if (periodCountSelect) {
      periodCountSelect.value = String(count);
    }

    renderInteractiveHours();
    renderTimelineDividers();
  }

  /**
   * Reflect the stored theme in the dropdown
   */
  function renderThemeSegment() {
    if (!themeSelect) return;
    themeSelect.value = localStorage.getItem("theme") || "auto";
  }

  // --------------------------------------------------------------------------
  // Wire Event Listeners
  // --------------------------------------------------------------------------

  // 1. Language dropdown (auto follows the browser language)
  if (langSelect) {
    langSelect.addEventListener("change", () => {
      State.saveLanguage(langSelect.value);
      applyLanguage();
    });
  }

  // 2. Minimap Toggles
  document.querySelectorAll("input[type='checkbox'][data-setting]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const key = checkbox.dataset.setting;
      State.mapSettings[key] = checkbox.checked;
      State.saveMapSettings();
      renderMapPreview();
    });
  });

  // Minimap Sliders
  document.querySelectorAll("input[type='range'][data-setting]").forEach((slider) => {
    slider.addEventListener("input", () => {
      updateMapSetting(slider.dataset.setting, slider.value);
    });
  });

  // Minimap Stepper Buttons (+ / -)
  document.querySelectorAll("[data-adjust]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.adjust;
      const delta = Number(button.dataset.delta);
      const current = State.mapSettings[key] !== undefined ? State.mapSettings[key] : CONFIG.defaultMapSettings[key];
      updateMapSetting(key, current + delta);
    });
  });

  // Minimap Reset Button
  if (resetMapButton) {
    resetMapButton.addEventListener("click", () => {
      State.mapSettings = { ...CONFIG.defaultMapSettings };
      State.saveMapSettings();
      renderMapControls();
      renderMapPreview();
    });
  }

  // 3. Now-Line Reference Mode Select
  if (nowLineModeSelect) {
    nowLineModeSelect.addEventListener("change", () => {
      State.saveNowLineMode(nowLineModeSelect.value);
      renderTimelinePreview();
    });
  }

  // Period Count Selector Dropdown (2 / 3 / 4 periods)
  if (periodCountSelect) {
    periodCountSelect.addEventListener("change", () => {
      const count = Number(periodCountSelect.value);
      if (CONFIG.periodPresets[count]) {
        State.timePeriods = JSON.parse(JSON.stringify(CONFIG.periodPresets[count]));
        State.saveTimePeriods();
        renderPeriodControls();
        renderPreviews();
      }
    });
  }

  // Reset Periods Button
  if (resetPeriodsButton) {
    resetPeriodsButton.addEventListener("click", () => {
      const count = (State.timePeriods && State.timePeriods.length) || 3;
      State.timePeriods = JSON.parse(JSON.stringify(CONFIG.periodPresets[count] || CONFIG.defaultTimePeriods));
      State.saveTimePeriods();
      renderPeriodControls();
      renderPreviews();
    });
  }

  // 4. Appearance / Theme dropdown

  if (themeSelect) {
    themeSelect.addEventListener("change", () => {
      if (globalThis.TimeMapperTheme) {
        globalThis.TimeMapperTheme.apply(themeSelect.value);
      }
      renderThemeSegment();
      renderPeriodControls();
      renderPreviews();
    });
  }

  // Follow OS theme changes when theme is auto
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if ((localStorage.getItem("theme") || "auto") === "auto") {
      renderPeriodControls();
      renderPreviews();
    }
  });

  // Cities: search, limit, reset (shares CityPreview with the popup)
  if (cityRefs) {
    CityPreview.wireCitySearch(cityRefs, renderPreviews);
    CityPreview.wireResetButtons(cityRefs, renderPreviews);
  }

  // Local-only keys (theme, mapSettings) still travel via localStorage events.
  window.addEventListener("storage", () => {
    State.init();
    applyLanguage();
    renderMapControls();
    renderPeriodControls();
    renderThemeSegment();
    renderPreviews();
  });

  // Sync-key changes from the popup, other devices or other options tabs.
  const syncedKeys = new Set(Object.values(CONFIG.syncKeys));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (!Object.keys(changes).some((key) => syncedKeys.has(key))) return;
    State.init().then(() => {
      applyLanguage();
      renderMapControls();
      renderPeriodControls();
      renderThemeSegment();
      renderPreviews();
    });
  });

  // Initial UI Render
  applyLanguage();
  renderMapControls();
  renderPeriodControls();
  renderThemeSegment();
  renderPreviews();

  // Keep clock labels fresh like the popup does
  setInterval(() => renderPreviews(), 60 * 1000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initOptions);
} else {
  initOptions();
}
