/**
 * TimeMapper - Event Controller Module
 */

const AppController = {
  updateMapSetting(key, value) {
    const input = document.querySelector(`[data-setting="${key}"]`);
    if (!input) return;

    const min = Number(input.min);
    const max = Number(input.max);
    const next = MathUtils.clamp(Number(value), min, max);
    State.mapSettings = {
      ...State.mapSettings,
      [key]: key.endsWith("Scale") ? Number(next.toFixed(2)) : Number(next.toFixed(1))
    };
    State.saveMapSettings();
    Renderer.renderSettingsControls();
    Renderer.renderMap();
  },

  addGeneratedTimezone(offset, clickX, clickY) {
    const offsetText = offset >= 0 ? `+${offset}` : `${offset}`;
    const name = `UTC${offsetText}`;

    let zone;
    if (offset === 0) {
      zone = "Etc/GMT";
    } else if (offset > 0) {
      zone = `Etc/GMT-${offset}`;
    } else {
      zone = `Etc/GMT+${Math.abs(offset)}`;
    }

    const x = MathUtils.clamp(50 + (clickX - 50 - State.mapSettings.lngOffset) / State.mapSettings.widthScale, 0, 100);
    const y = MathUtils.clamp(50 + (clickY - 50 + State.mapSettings.latOffset) / State.mapSettings.heightScale, 0, 100);

    const newCity = {
      id: `custom-utc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      zone,
      x,
      y
    };

    State.customCities = [...State.customCities, newCity];
    State.saveCustomCities();
    State.toggleCity(newCity.id);
    Renderer.render();
  },

  wireMapSettings() {
    DOM.settingsButton.addEventListener("click", () => {
      const isOpen = DOM.settingsPanel.hidden;
      DOM.settingsPanel.hidden = !isOpen;
      DOM.settingsButton.setAttribute("aria-expanded", String(isOpen));
    });

    document.querySelectorAll("[data-setting]:not([type='checkbox'])").forEach((input) => {
      input.addEventListener("input", () => {
        this.updateMapSetting(input.dataset.setting, input.value);
      });
    });

    document.querySelectorAll("input[type='checkbox'][data-setting]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const key = checkbox.dataset.setting;
        State.mapSettings[key] = checkbox.checked;
        State.saveMapSettings();
        Renderer.applyVisibilitySettings();
      });
    });

    document.querySelectorAll("[data-adjust]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.dataset.adjust;
        const delta = Number(button.dataset.delta);
        this.updateMapSetting(key, State.mapSettings[key] + delta);
      });
    });

    if (DOM.resetMapButton) {
      DOM.resetMapButton.addEventListener("click", () => {
        State.mapSettings = { ...CONFIG.defaultMapSettings };
        State.saveMapSettings();
        Renderer.renderSettingsControls();
        Renderer.renderMap();
        Renderer.render();
      });
    }

    if (DOM.resetPeriodsButton) {
      DOM.resetPeriodsButton.addEventListener("click", () => {
        State.timePeriods = JSON.parse(JSON.stringify(CONFIG.defaultTimePeriods));
        State.saveTimePeriods();
        Renderer.render();
      });
    }

    const handleOpenOptions = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      const targetUrl = chrome.runtime?.getURL ? chrome.runtime.getURL("src/options/options.html") : "../options/options.html";
      try {
        if (chrome.tabs && chrome.tabs.create) {
          chrome.tabs.create({ url: targetUrl });
        } else if (chrome.runtime && chrome.runtime.openOptionsPage) {
          chrome.runtime.openOptionsPage(() => {
            if (chrome.runtime.lastError) {
              window.open(targetUrl, "_blank");
            }
          });
        } else {
          window.open(targetUrl, "_blank");
        }
      } catch (err) {
        window.open(targetUrl, "_blank");
      }
    };

    if (DOM.openOptionsBtn) {
      DOM.openOptionsBtn.addEventListener("click", handleOpenOptions);
    }
    if (DOM.topbarOptionsButton) {
      DOM.topbarOptionsButton.addEventListener("click", handleOpenOptions);
    }
  },

  wireCitiesDragOver() {
    if (!DOM.currentCitiesList) return;
    DOM.currentCitiesList.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    DOM.currentCitiesList.addEventListener("dragenter", (e) => {
      e.preventDefault();
    });
  },

  wireSettings() {
    this.wireMapSettings();
    CityPreview.wireCitySearch(CityPreview.collectRefs(document), () => Renderer.render());
    this.wireCitiesDragOver();
    CityPreview.wireCityLimit(CityPreview.collectRefs(document), () => Renderer.render());
  },

  wireScrubLine() {
    TimelinePreview.wireScrub(TimelinePreview.collectRefs(document), {
      renderScrubLine: () => Renderer.renderScrubLine(),
      renderNightArea: (offsetHours) => Renderer.renderNightArea(offsetHours),
    });
  },

  wireMapTimezoneHover() {
    if (DOM.mapShell && DOM.timezoneHoverBar) {
      DOM.mapShell.addEventListener("mousemove", (e) => {
        const rect = DOM.mapShell.getBoundingClientRect();
        const relativeX = (e.clientX - rect.left) / rect.width;
        if (relativeX >= 0 && relativeX <= 1) {
          const x = relativeX * 100;
          const lng = MapUtils.getXLongitude(x);

          const time = new Date();
          const offsetHours = State.selectedOffsetHours;
          time.setTime(time.getTime() + offsetHours * 60 * 60 * 1000);
          const subsolarLng = MapUtils.subsolarLng(time);

          const k = Math.round((lng - subsolarLng) / 15);

          const x_left = MathUtils.clamp(MapUtils.getLongitudeX(subsolarLng + (k - 0.5) * 15), 0, 100);
          const x_right = MathUtils.clamp(MapUtils.getLongitudeX(subsolarLng + (k + 0.5) * 15), 0, 100);

          const scale = (x_right - x_left) / 100;
          DOM.timezoneHoverBar.style.transform = `translateX(${x_left}%) scaleX(${scale})`;
          DOM.timezoneHoverBar.hidden = false;
        } else {
          DOM.timezoneHoverBar.hidden = true;
        }
      });

      DOM.mapShell.addEventListener("mouseleave", () => {
        DOM.timezoneHoverBar.hidden = true;
      });
    }

    if (DOM.cityLayer) {
      DOM.cityLayer.addEventListener("click", (e) => {
        if (e.target === DOM.cityLayer) {
          const rect = DOM.cityLayer.getBoundingClientRect();
          const clickX = ((e.clientX - rect.left) / rect.width) * 100;
          const clickY = ((e.clientY - rect.top) / rect.height) * 100;

          const lng = MapUtils.getXLongitude(clickX);
          const offset = MathUtils.clamp(Math.round(lng / 15), -12, 12);

          this.addGeneratedTimezone(offset, clickX, clickY);
        }
      });
    }
  },

  init() {
    State.init();

    this.wireSettings();
    this.wireScrubLine();
    this.wireMapTimezoneHover();
    Renderer.renderSettingsControls();

    CityPreview.wireResetButtons(CityPreview.collectRefs(document), () => {
      State.scrubs = [];
      State.activeScrubId = null;
      Renderer.render();
    });

    I18nUtils.applyAttributes();
    Renderer.render();

    // Listen to settings changes from Options page
    window.addEventListener("storage", () => {
      State.init();
      I18nUtils.applyAttributes();
      // resolve() only reads, so we never write localStorage back and cause a
      // second storage event in the options page.
      if (globalThis.TimeMapperTheme) {
        document.documentElement.dataset.theme =
          TimeMapperTheme.resolve(localStorage.getItem("theme") || "auto");
      }
      Renderer.renderSettingsControls();
      Renderer.render();
    });

    setInterval(() => Renderer.render(), 60 * 1000);
  }
};

AppController.init();
