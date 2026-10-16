/**
 * TimeMapper - UI Renderer Module
 */

const Renderer = {
  renderNowText() {
    const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const dateStr = `${year}/${month}/${day}`;
    const timeStr = TimeUtils.formatTime(now, localZone);
    DOM.nowText.innerHTML = `<span class="now-time">${timeStr}</span><span class="now-date">${dateStr}</span><span class="now-brand">TimeMapper</span>`;
  },

  renderMap() {
    MapPreview.renderPins(MapPreview.collectRefs(document), () => Renderer.render());
  },

  formatSettingValue(key) {
    if (key.endsWith("Scale")) return State.mapSettings[key].toFixed(2);
    if (key === "mapYOffset") return String(Math.round(State.mapSettings[key]));
    return State.mapSettings[key].toFixed(1);
  },

  renderSettingsControls() {
    document.querySelectorAll("[data-setting]").forEach((input) => {
      const key = input.dataset.setting;
      if (input.type === "checkbox") {
        input.checked = !!State.mapSettings[key];
      } else {
        input.value = String(State.mapSettings[key]);
      }
    });

    document.querySelectorAll("[data-output]").forEach((output) => {
      const key = output.dataset.output;
      output.textContent = this.formatSettingValue(key);
    });

    const cityLimitInput = document.querySelector("#cityLimitInput");
    if (cityLimitInput) {
      cityLimitInput.value = String(State.cityLimit);
    }
  },

  renderRows() {
    TimelinePreview.renderRows(TimelinePreview.collectRefs(document));
  },

  /**
   * The timezone dropdown depends on the zones of the currently selected cities.
   * Derived here so the cache invalidates itself whenever selection or a custom
   * city's zone changes, instead of relying on every mutation site to clear it.
   */
  _computeZoneCacheSignature() {
    return State.selectedIds.join(",") + "|" + State.customCities.map((city) => city.zone).join(",");
  },

  renderCurrentCitiesList() {
    if (!DOM.currentCitiesList) return;
    DOM.currentCitiesList.innerHTML = "";

    if (this._zoneCacheSignature !== this._computeZoneCacheSignature()) {
      const supportedZones = (typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function")
        ? Intl.supportedValuesOf("timeZone")
        : ["UTC", "Asia/Taipei", "Asia/Hong_Kong", "Asia/Tokyo", "Asia/Singapore", "Europe/London", "America/New_York", "America/Los_Angeles"];

      const uniqueZonesSet = new Set(supportedZones);
      State.selectedIds.forEach((id) => {
        const city = State.findCity(id);
        if (city && city.zone) {
          uniqueZonesSet.add(city.zone);
        }
      });

      const now = new Date();
      const zoneDetails = Array.from(uniqueZonesSet).map((zone) => {
        const offsetMins = TimeUtils.getOffsetMinutes(now, zone);
        const sign = offsetMins >= 0 ? "+" : "-";
        const absMins = Math.abs(offsetMins);
        const hours = Math.floor(absMins / 60);
        const mins = absMins % 60;
        const offsetStr = `UTC${sign}${hours}${mins > 0 ? ":" + String(mins).padStart(2, "0") : ""}`;
        return {
          zone,
          offsetMins,
          label: `${zone} (${offsetStr})`
        };
      });

      zoneDetails.sort((a, b) => {
        if (a.offsetMins !== b.offsetMins) {
          return a.offsetMins - b.offsetMins;
        }
        return a.zone.localeCompare(b.zone);
      });

      this._cachedZoneDetails = zoneDetails;
      this._cachedTimezoneOptionsHTML = zoneDetails.map((detail) => {
        return `<option value="${EscapeUtils.html(detail.zone)}">${EscapeUtils.html(detail.label)}</option>`;
      }).join('');
      this._zoneCacheSignature = this._computeZoneCacheSignature();
    }

    const timezoneOptionsHTML = this._cachedTimezoneOptionsHTML;

    State.selectedIds.forEach((id) => {
      const city = State.findCity(id);
      if (!city) return;

      const cityName = I18nUtils.getCityName(city);
      const { lng, lat } = MapUtils.lngLatOf(city);

      const card = document.createElement("div");
      card.className = "current-city-card";
      card.setAttribute("draggable", "false");
      card.dataset.id = id;

      const currentZone = city.zone || "UTC";

      card.innerHTML = `
        <div class="drag-handle">⋮⋮</div>
        <input class="city-name-input" type="text" value="${EscapeUtils.html(cityName)}" placeholder="Name">
        <select class="city-zone-select">
          ${timezoneOptionsHTML}
        </select>
        <input class="city-lng-input" type="number" step="any" value="${lng.toFixed(2)}" placeholder="Lng">
        <input class="city-lat-input" type="number" step="any" value="${lat.toFixed(2)}" placeholder="Lat">
        <button type="button" class="remove-city-card-btn" aria-label="${EscapeUtils.html(I18nUtils.getTranslation("removeCity", { name: cityName }))}">×</button>
      `;

      const nameInput = card.querySelector(".city-name-input");
      const zoneSelect = card.querySelector(".city-zone-select");
      zoneSelect.value = currentZone;
      const lngInput = card.querySelector(".city-lng-input");
      const latInput = card.querySelector(".city-lat-input");
      const removeBtn = card.querySelector(".remove-city-card-btn");

      const dragHandle = card.querySelector(".drag-handle");
      dragHandle.addEventListener("mouseenter", () => {
        card.setAttribute("draggable", "true");
      });
      dragHandle.addEventListener("mouseleave", () => {
        card.setAttribute("draggable", "false");
      });

      card.addEventListener("dragstart", (e) => {
        State.draggingId = id;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", id);
        card.classList.add("is-dragging");
        if (DOM.currentCitiesList) {
          DOM.currentCitiesList.classList.add("is-dragging-active");
        }
      });

      card.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";

        if (State.draggingId && State.draggingId !== id) {
          // Optimize cleanup: clear indicators of the last active card without querySelector loop
          if (State.lastActiveCard && State.lastActiveCard !== card) {
            State.lastActiveCard.classList.remove("drag-over-top", "drag-over-bottom");
            State.lastActiveCard._cachedRect = null;
          }
          State.lastActiveCard = card;

          // Optimize layout thrashing: cache bounding rect
          if (!card._cachedRect) {
            card._cachedRect = card.getBoundingClientRect();
          }

          const relativeY = e.clientY - card._cachedRect.top;
          const middleY = card._cachedRect.height / 2;

          if (relativeY < middleY) {
            card.classList.add("drag-over-top");
            card.classList.remove("drag-over-bottom");
          } else {
            card.classList.add("drag-over-bottom");
            card.classList.remove("drag-over-top");
          }
        }
      });

      card.addEventListener("dragenter", (e) => {
        e.preventDefault();
      });

      card.addEventListener("dragleave", () => {
        card.classList.remove("drag-over-top", "drag-over-bottom");
        card._cachedRect = null;
        if (State.lastActiveCard === card) {
          State.lastActiveCard = null;
        }
      });

      card.addEventListener("dragend", () => {
        card.classList.remove("is-dragging");
        if (DOM.currentCitiesList) {
          DOM.currentCitiesList.classList.remove("is-dragging-active");
        }
        document.querySelectorAll(".current-city-card").forEach(c => {
          c.classList.remove("drag-over-top", "drag-over-bottom");
          c._cachedRect = null;
        });
        State.draggingId = null;
        State.lastActiveCard = null;
      });

      card.addEventListener("drop", (e) => {
        e.preventDefault();
        const draggedId = State.draggingId;
        if (draggedId && draggedId !== id) {
          const oldIndex = State.selectedIds.indexOf(draggedId);
          const newIndex = State.selectedIds.indexOf(id);
          if (oldIndex !== -1 && newIndex !== -1) {
            const dropTop = card.classList.contains("drag-over-top");
            let insertIndex;
            if (oldIndex < newIndex) {
              insertIndex = dropTop ? newIndex - 1 : newIndex;
            } else {
              insertIndex = dropTop ? newIndex : newIndex + 1;
            }

            const list = [...State.selectedIds];
            list.splice(oldIndex, 1);
            list.splice(insertIndex, 0, draggedId);
            State.selectedIds = list;
            State.saveSelection();
            Renderer.render();
          }
        }
        if (DOM.currentCitiesList) {
          DOM.currentCitiesList.classList.remove("is-dragging-active");
        }
        document.querySelectorAll(".current-city-card").forEach(c => {
          c.classList.remove("drag-over-top", "drag-over-bottom");
          c._cachedRect = null;
        });
        State.draggingId = null;
        State.lastActiveCard = null;
      });

      const handleAutoSave = () => {
        const nextName = nameInput.value.trim();
        const nextZone = zoneSelect.value.trim();
        const rawLng = lngInput.value.trim();
        const rawLat = latInput.value.trim();
        const nextLng = Number(rawLng);
        const nextLat = Number(rawLat);

        let isValid = true;

        if (!nextName) {
          nameInput.classList.add("invalid");
          isValid = false;
        } else {
          nameInput.classList.remove("invalid");
        }

        if (!nextZone || !TimeUtils.isValidZone(nextZone)) {
          zoneSelect.classList.add("invalid");
          isValid = false;
        } else {
          zoneSelect.classList.remove("invalid");
        }

        if (rawLng === "" || isNaN(nextLng)) {
          lngInput.classList.add("invalid");
          isValid = false;
        } else {
          lngInput.classList.remove("invalid");
        }

        if (rawLat === "" || isNaN(nextLat)) {
          latInput.classList.add("invalid");
          isValid = false;
        } else {
          latInput.classList.remove("invalid");
        }

        if (!isValid) return;

        const x = MathUtils.clamp(MapUtils.lngToX(nextLng), 0, 100);
        const y = MathUtils.clamp(MapUtils.latToY(nextLat), 0, 100);

        let targetId = city.id;
        let isNewCustom = false;
        if (!targetId.startsWith("custom-")) {
          targetId = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          isNewCustom = true;
        }

        const updatedCity = {
          id: targetId,
          name: nextName,
          zone: nextZone,
          x: x,
          y: y,
          lng: nextLng,
          lat: nextLat
        };

        if (isNewCustom) {
          State.customCities = [...State.customCities, updatedCity];
          State.selectedIds = State.selectedIds.map(selectedId => selectedId === city.id ? targetId : selectedId);
          State.saveCustomCities();
          State.saveSelection();
          Renderer.render();
        } else {
          State.customCities = State.customCities.map(existing => existing.id === city.id ? updatedCity : existing);
          State.saveCustomCities();
          State.saveSelection();

          // Update UI components partially to keep cursor/input focus
          State.makeBaseHours();
          Renderer.renderNowText();
          Renderer.renderMap();
          Renderer.renderRows();
          Renderer.renderNowLine();
          Renderer.renderScrubLine();
          Renderer.renderNightArea(State.selectedOffsetHours);
          Renderer.applyVisibilitySettings();
        }
      };

      nameInput.addEventListener("blur", handleAutoSave);
      nameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          nameInput.blur();
        }
      });

      zoneSelect.addEventListener("change", handleAutoSave);

      lngInput.addEventListener("blur", handleAutoSave);
      lngInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          lngInput.blur();
        }
      });

      latInput.addEventListener("blur", handleAutoSave);
      latInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          latInput.blur();
        }
      });

      removeBtn.addEventListener("click", () => {
        State.toggleCity(city.id);
        Renderer.render();
      });

      DOM.currentCitiesList.append(card);
    });
  },

  renderHourLines(offsetHours = 0) {
    MapPreview.renderHourLines(MapPreview.collectRefs(document), offsetHours);
  },

  _calcNightAreaBoundaryPoints(offsetHours) {
    return MapPreview.calcNightPoints(offsetHours);
  },

  renderMapTimeline(offsetHours = 0) {
    MapPreview.renderMapTimeline(MapPreview.collectRefs(document), offsetHours);
  },

  renderNightArea(offsetHours = 0) {
    MapPreview.renderNightArea(MapPreview.collectRefs(document), offsetHours);
  },

  updateMapCityTimes(activeFraction) {
    MapPreview.updateMapCityTimes(MapPreview.collectRefs(document), activeFraction);
  },

  applyVisibilitySettings() {
    MapPreview.applyVisibility(MapPreview.collectRefs(document));
  },

  render() {
    State.makeBaseHours();
    this.renderNowText();
    this.renderMap();
    this.renderRows();
    this.renderCurrentCitiesList();
    // Render lines after layout is established
    this.renderNowLine();
    this.renderScrubLine();
    this.renderNightArea(State.selectedOffsetHours);
    this.applyVisibilitySettings();
  },

  renderNowLine() {
    TimelinePreview.renderNowLine(TimelinePreview.collectRefs(document));
  },

  renderScrubLine() {
    TimelinePreview.renderScrubLine(TimelinePreview.collectRefs(document));
  }
};
