/**
 * World Time Aligner - Event Controller Module
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

    DOM.resetMapButton.addEventListener("click", () => {
      State.mapSettings = { ...CONFIG.defaultMapSettings };
      State.saveMapSettings();
      if (DOM.mapPanel) {
        DOM.mapPanel.open = !State.mapSettings.mapCollapsed;
      }
      Renderer.renderSettingsControls();
      Renderer.renderMap();
      Renderer.render();
    });

    if (DOM.resetPeriodsButton) {
      DOM.resetPeriodsButton.addEventListener("click", () => {
        State.timePeriods = JSON.parse(JSON.stringify(CONFIG.defaultTimePeriods));
        State.saveTimePeriods();
        Renderer.renderPeriodSettings();
        Renderer.render();
      });
    }
  },

  fetchCityResults(query) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
    return fetch(url).then((res) => res.json());
  },

  wireCitySearch() {
    if (!DOM.searchCityBtn) return;

    document.addEventListener("click", (e) => {
      if (DOM.searchResultsList && !DOM.searchResultsList.contains(e.target) && e.target !== DOM.searchCityInput && e.target !== DOM.searchCityBtn) {
        DOM.searchResultsList.hidden = true;
      }
    });

    const triggerSearch = () => {
      const query = DOM.searchCityInput.value.trim();
      if (!query) return;

      DOM.searchCityBtn.textContent = "⏳";
      DOM.searchCityBtn.style.pointerEvents = "none";
      DOM.searchResultsList.hidden = true;
      DOM.searchResultsList.innerHTML = "";

      this.fetchCityResults(query)
        .then((data) => {
          if (data && data.results && data.results.length > 0) {
            DOM.searchResultsList.innerHTML = "";
            data.results.forEach((result) => {
              const card = document.createElement("div");
              card.className = "search-result-card";

              const locationParts = [];
              if (result.country) locationParts.push(result.country);
              if (result.admin1) locationParts.push(result.admin1);
              const subtitleText = locationParts.length > 0 ? ` (${locationParts.join(", ")})` : "";

              const lng = result.longitude || 0;
              const lat = result.latitude || 0;

              card.innerHTML = `
                <div class="search-result-info">
                  <div class="search-result-name-row">
                    <span class="search-result-name">${result.name}</span>
                    <span class="search-result-country">${subtitleText}</span>
                  </div>
                  <div class="search-result-details">${result.timezone || "UTC"} (Lng: ${lng.toFixed(1)}, Lat: ${lat.toFixed(1)})</div>
                </div>
              `;

              card.addEventListener("click", (evt) => {
                evt.stopPropagation();
                
                const cx = 0.2816 * lng + 46.2357;
                const cy = -0.5257 * lat + 63.3239;
                const newCity = {
                  id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  name: result.name,
                  zone: result.timezone || "UTC",
                  x: MathUtils.clamp(cx, 0, 100),
                  y: MathUtils.clamp(cy, 0, 100),
                  lng: lng,
                  lat: lat
                };

                State.customCities = [...State.customCities, newCity];
                State.saveCustomCities();
                State.toggleCity(newCity.id);

                DOM.searchCityInput.value = "";
                DOM.searchResultsList.hidden = true;
                DOM.searchResultsList.innerHTML = "";
              });
              
              DOM.searchResultsList.append(card);
            });
            DOM.searchResultsList.hidden = false;
          } else {
            alert(I18nUtils.getTranslation("cityNotFound") || "City not found");
          }
        })
        .catch((err) => {
          console.error(err);
          alert("Network error. Please try again.");
        })
        .finally(() => {
          DOM.searchCityBtn.textContent = I18nUtils.getTranslation("searchBtn") || "Search";
          DOM.searchCityBtn.style.pointerEvents = "auto";
        });
    };

    DOM.searchCityBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      triggerSearch();
    });

    DOM.searchCityInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        triggerSearch();
      }
    });
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

  wireCityLimit() {
    if (!DOM.cityLimitInput) return;
    DOM.cityLimitInput.addEventListener("input", (e) => {
      const val = parseInt(e.target.value, 10);
      if (!isNaN(val) && val > 0) {
        State.saveCityLimit(val);
      }
    });
    DOM.cityLimitInput.addEventListener("change", (e) => {
      const val = parseInt(e.target.value, 10);
      if (!isNaN(val) && val > 0) {
        State.saveCityLimit(val);
      } else {
        e.target.value = String(State.cityLimit);
      }
    });
  },

  wireSettings() {
    this.wireMapSettings();
    this.wireCitySearch();
    this.wireCitiesDragOver();
    this.wireCityLimit();
  },

  wireScrubLine() {
    if (!DOM.scrubLinesContainer || !DOM.timelinePanel) return;
    let isDragging = false;
    let activeDragScrubId = null;

    // --- Interaction 1 & 2: Click/Drag timeline to add or drag scrub-line ---
    DOM.timelinePanel.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return; // Left click only
      if (e.target.closest(".scrub-reset-btn")) return; // Let close button handler work

      const handle = e.target.closest(".scrub-handle");
      const hoursGrid = e.target.closest(".hours");
      if (!handle && !hoursGrid) return;

      let targetScrubId = null;
      let fraction = null;

      if (handle) {
        // Drag existing scrub line
        const group = handle.closest(".scrub-line-group");
        if (!group) return;
        targetScrubId = group.dataset.id;

        const scrub = State.scrubs.find(s => s.id === targetScrubId);
        if (scrub) {
          fraction = scrub.fraction;
        }
      } else {
        // Press to create a new scrub-line and start dragging immediately
        if (State.scrubs && State.scrubs.length >= 4) {
          return;
        }

        const panelRect = DOM.timelinePanel.getBoundingClientRect();
        const pxLeft = e.clientX - panelRect.left;
        fraction = TimelineUtils.leftToFraction(pxLeft);

        const newScrub = {
          id: `scrub_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          fraction: fraction
        };
        State.scrubs.push(newScrub);
        targetScrubId = newScrub.id;

        // Render the newly created scrub line
        State.activeScrubId = targetScrubId;
        Renderer.renderScrubLine();
      }

      if (targetScrubId) {
        activeDragScrubId = targetScrubId;
        State.activeScrubId = targetScrubId;
        isDragging = true;

        // Apply dragging visual styles
        DOM.scrubLinesContainer.querySelectorAll(".scrub-line, .scrub-handle").forEach((el) => {
          el.classList.remove("is-dragging");
        });

        const group = DOM.timelinePanel.querySelector(`.scrub-line-group[data-id="${targetScrubId}"]`);
        if (group) {
          const lineEl = group.querySelector(".scrub-line");
          const handleEl = group.querySelector(".scrub-handle");
          if (lineEl) lineEl.classList.add("is-dragging");
          if (handleEl) handleEl.classList.add("is-dragging");
        }

        // Update selected offset hours & night area
        if (fraction !== null) {
          const nowFraction = TimelineUtils.getNowFraction();
          State.selectedOffsetHours = (fraction - nowFraction) * 24;
          Renderer.renderNightArea(State.selectedOffsetHours);
        }

        e.preventDefault();
      }
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging || !activeDragScrubId) return;

      const panelRect = DOM.timelinePanel.getBoundingClientRect();
      const pxLeft = e.clientX - panelRect.left;
      const fraction = TimelineUtils.leftToFraction(pxLeft);

      // Update fraction in state
      const scrub = State.scrubs.find(s => s.id === activeDragScrubId);
      if (scrub) {
        scrub.fraction = fraction;
      }

      // Update position of group element directly for performance
      const group = DOM.timelinePanel.querySelector(`.scrub-line-group[data-id="${activeDragScrubId}"]`);
      if (group) {
        const left = TimelineUtils.fractionToLeft(fraction);
        group.style.left = `${left}px`;
      }

      // Live-update map timeline and ref lines
      const nowFraction = TimelineUtils.getNowFraction();
      State.selectedOffsetHours = (fraction - nowFraction) * 24;
      Renderer.renderNightArea(State.selectedOffsetHours);
    });

    document.addEventListener("mouseup", () => {
      if (!isDragging) return;
      isDragging = false;
      activeDragScrubId = null;
    });

    // --- Interaction 3: Click [x] to remove scrub-line (Event Delegation) ---
    DOM.timelinePanel.addEventListener("click", (e) => {
      const btn = e.target.closest(".scrub-reset-btn");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();

      const group = btn.closest(".scrub-line-group");
      if (!group) return;

      const scrubId = group.dataset.id;

      // Remove from State
      State.scrubs = State.scrubs.filter(s => s.id !== scrubId);

      // Re-assign activeScrubId if the removed one was active
      if (State.activeScrubId === scrubId) {
        if (State.scrubs.length > 0) {
          State.activeScrubId = State.scrubs[State.scrubs.length - 1].id;
        } else {
          State.activeScrubId = null;
        }
      }

      // Recalculate selectedOffsetHours
      const activeFraction = State.getActiveScrubFraction();
      if (activeFraction !== null) {
        const nowFraction = TimelineUtils.getNowFraction();
        State.selectedOffsetHours = (activeFraction - nowFraction) * 24;
      } else {
        State.selectedOffsetHours = 0;
      }

      // Redraw UI
      Renderer.renderScrubLine();
      Renderer.renderNightArea(State.selectedOffsetHours);
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
          const offsetHours = State.selectedOffsetHours || 0;
          time.setTime(time.getTime() + offsetHours * 60 * 60 * 1000);
          const subsolarLng = -(time.getUTCHours() + time.getUTCMinutes() / 60 - 12) * 15;

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

  wirePeriodSettings() {
    State.timePeriods.forEach((period, idx) => {
      const row = document.querySelector(`.period-setting-row[data-period="${idx}"]`);
      if (!row) return;

      row.querySelector(".period-start").addEventListener("change", (e) => {
        State.timePeriods[idx].start = Number(e.target.value);
        State.saveTimePeriods();
        Renderer.render();
      });

      row.querySelector(".period-end").addEventListener("change", (e) => {
        State.timePeriods[idx].end = Number(e.target.value);
        State.saveTimePeriods();
        Renderer.render();
      });

      row.querySelector(".period-bg-color").addEventListener("change", (e) => {
        State.timePeriods[idx].color = e.target.value;
        State.saveTimePeriods();
        Renderer.render();
      });

      row.querySelector(".period-text-color").addEventListener("change", (e) => {
        State.timePeriods[idx].fontColor = e.target.value;
        State.saveTimePeriods();
        Renderer.render();
      });
    });
  },

  init() {
    State.init();

    if (DOM.mapPanel) {
      DOM.mapPanel.open = !State.mapSettings.mapCollapsed;
      DOM.mapPanel.addEventListener("toggle", () => {
        State.mapSettings.mapCollapsed = !DOM.mapPanel.open;
        State.saveMapSettings();
      });
    }

    this.wireSettings();
    this.wireScrubLine();
    this.wireMapTimezoneHover();
    Renderer.renderSettingsControls();

    DOM.langButtons.forEach((btn) => {
      if (btn.dataset.lang === State.currentLang) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
      btn.addEventListener("click", () => {
        DOM.langButtons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        State.saveLanguage(btn.dataset.lang);
        Renderer.applyLanguage();
        Renderer.render();
      });
    });

    // Now-line reference mode toggle
    if (DOM.nowLineModeSelect) {
      DOM.nowLineModeSelect.value = State.nowLineMode;
      DOM.nowLineModeSelect.addEventListener("change", (e) => {
        State.saveNowLineMode(e.target.value);
        State.scrubs = [];
        State.activeScrubId = null;
        State.selectedOffsetHours = 0;
        Renderer.render();
      });
    }

    DOM.resetButton.addEventListener("click", () => {
      State.selectedIds = [...CONFIG.defaultSelection].slice(0, State.cityLimit);
      State.scrubs = [];
      State.activeScrubId = null;
      State.selectedOffsetHours = 0;
      State.saveSelection();
      Renderer.render();
    });

    DOM.clearAllButton.addEventListener("click", () => {
      State.selectedIds = [];
      State.customCities = [];
      State.scrubs = [];
      State.activeScrubId = null;
      State.selectedOffsetHours = 0;
      State.saveSelection();
      State.saveCustomCities();
      Renderer.render();
    });

    Renderer.populatePeriodSelectors();
    this.wirePeriodSettings();
    Renderer.applyLanguage();
    Renderer.render();

    setInterval(() => Renderer.render(), 60 * 1000);
  }
};

AppController.init();
