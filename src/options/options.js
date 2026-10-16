/**
 * TimeMapper - Options Page Controller
 * Follows design and behavioral architecture of ../_chrome-ext-template
 */

document.addEventListener("DOMContentLoaded", () => {
  State.init();

  const versionLabel = document.getElementById("versionLabel");
  if (globalThis.TimeMapperVersion) {
    globalThis.TimeMapperVersion.render(versionLabel);
  }

  // DOM Elements
  const langSelect = document.getElementById("langSelect");
  const nowLineModeSegment = document.getElementById("nowLineModeSegment");
  const themeSelect = document.getElementById("themeSelect");
  const resetMapButton = document.getElementById("resetMapButton");
  const resetPeriodsButton = document.getElementById("resetPeriodsButton");

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
  }

  /**
   * Populate hour options in select dropdowns
   */
  function populateHourSelects() {
    document.querySelectorAll(".period-start, .period-end").forEach((select) => {
      if (select.children.length === 0) {
        select.innerHTML = "";
        for (let h = 0; h < 24; h++) {
          const opt = document.createElement("option");
          opt.value = h;
          opt.textContent = `${String(h).padStart(2, "0")}:00`;
          select.appendChild(opt);
        }
      }
    });
  }

  /**
   * Render Time Period settings controls
   */
  function renderPeriodControls() {
    // Now-line mode segment
    if (nowLineModeSegment) {
      nowLineModeSegment.querySelectorAll(".theme-option").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.nowlineValue === State.nowLineMode);
      });
    }

    // 3 Periods
    State.timePeriods.forEach((period, idx) => {
      const block = document.querySelector(`.period-card-block[data-period="${idx}"]`);
      if (!block) return;

      const startSelect = block.querySelector(".period-start");
      const endSelect = block.querySelector(".period-end");
      const bgInput = block.querySelector(".period-bg-color");
      const textInput = block.querySelector(".period-text-color");
      const bgHexLabel = block.querySelector(".bg-hex");
      const textHexLabel = block.querySelector(".text-hex");
      const previewBadge = document.getElementById(`periodPreview${idx}`);

      const hexBg = ColorUtils.toHex7(period.color).toUpperCase();
      const hexText = ColorUtils.toHex7(period.fontColor).toUpperCase();

      if (startSelect) startSelect.value = period.start;
      if (endSelect) endSelect.value = period.end;
      if (bgInput) bgInput.value = hexBg;
      if (textInput) textInput.value = hexText;
      if (bgHexLabel) bgHexLabel.textContent = hexBg;
      if (textHexLabel) textHexLabel.textContent = hexText;

      if (previewBadge) {
        const startStr = `${String(period.start).padStart(2, "0")}:00`;
        const endStr = `${String(period.end).padStart(2, "0")}:00`;
        previewBadge.textContent = `${startStr} - ${endStr}`;
        previewBadge.style.backgroundColor = period.color;
        previewBadge.style.color = period.fontColor;
      }
    });
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
    });
  }

  // 3. Now-Line Reference Mode Segment
  if (nowLineModeSegment) {
    nowLineModeSegment.addEventListener("click", (e) => {
      const btn = e.target.closest(".theme-option");
      if (!btn) return;
      const mode = btn.dataset.nowlineValue;
      State.saveNowLineMode(mode);
      nowLineModeSegment.querySelectorAll(".theme-option").forEach((b) => {
        b.classList.toggle("active", b === btn);
      });
    });
  }

  // Period Settings Selects & Color Pickers
  State.timePeriods.forEach((_, idx) => {
    const block = document.querySelector(`.period-card-block[data-period="${idx}"]`);
    if (!block) return;

    const startSelect = block.querySelector(".period-start");
    const endSelect = block.querySelector(".period-end");
    const bgInput = block.querySelector(".period-bg-color");
    const textInput = block.querySelector(".period-text-color");
    const bgHexLabel = block.querySelector(".bg-hex");
    const textHexLabel = block.querySelector(".text-hex");
    const previewBadge = document.getElementById(`periodPreview${idx}`);

    function updatePeriodState() {
      State.timePeriods[idx].start = Number(startSelect.value);
      State.timePeriods[idx].end = Number(endSelect.value);
      State.timePeriods[idx].color = bgInput.value;
      State.timePeriods[idx].fontColor = textInput.value;
      State.saveTimePeriods();

      if (bgHexLabel) bgHexLabel.textContent = bgInput.value.toUpperCase();
      if (textHexLabel) textHexLabel.textContent = textInput.value.toUpperCase();

      if (previewBadge) {
        const startStr = `${String(State.timePeriods[idx].start).padStart(2, "0")}:00`;
        const endStr = `${String(State.timePeriods[idx].end).padStart(2, "0")}:00`;
        previewBadge.textContent = `${startStr} - ${endStr}`;
        previewBadge.style.backgroundColor = State.timePeriods[idx].color;
        previewBadge.style.color = State.timePeriods[idx].fontColor;
      }
    }

    startSelect.addEventListener("change", updatePeriodState);
    endSelect.addEventListener("change", updatePeriodState);
    bgInput.addEventListener("input", updatePeriodState);
    textInput.addEventListener("input", updatePeriodState);
  });

  // Reset Periods Button
  if (resetPeriodsButton) {
    resetPeriodsButton.addEventListener("click", () => {
      State.timePeriods = JSON.parse(JSON.stringify(CONFIG.defaultTimePeriods));
      State.saveTimePeriods();
      renderPeriodControls();
    });
  }

  // 4. Appearance / Theme dropdown
  if (themeSelect) {
    themeSelect.addEventListener("change", () => {
      if (globalThis.TimeMapperTheme) {
        globalThis.TimeMapperTheme.apply(themeSelect.value);
      }
      renderThemeSegment();
    });
  }

  // Listen to changes from other contexts (e.g. Popup)
  window.addEventListener("storage", () => {
    State.init();
    applyLanguage();
    renderMapControls();
    renderPeriodControls();
    renderThemeSegment();
  });

  // Initial UI Render
  populateHourSelects();
  applyLanguage();
  renderMapControls();
  renderPeriodControls();
  renderThemeSegment();
});
