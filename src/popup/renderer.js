/**
 * World Time Aligner - UI Renderer Module
 */

const Renderer = {
  applyLanguage() {
    document.querySelectorAll("[data-i18n]").forEach((elem) => {
      const key = elem.dataset.i18n;
      if (i18nTranslations[State.currentLang]?.[key]) {
        elem.textContent = i18nTranslations[State.currentLang][key];
      }
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach((elem) => {
      const key = elem.dataset.i18nPlaceholder;
      if (i18nTranslations[State.currentLang]?.[key]) {
        elem.placeholder = i18nTranslations[State.currentLang][key];
      }
    });

    document.querySelectorAll("[data-i18n-title]").forEach((elem) => {
      const key = elem.dataset.i18nTitle;
      if (i18nTranslations[State.currentLang]?.[key]) {
        elem.title = i18nTranslations[State.currentLang][key];
      }
    });

    document.querySelectorAll("[data-i18n-aria-label]").forEach((elem) => {
      const key = elem.dataset.i18nAriaLabel;
      if (i18nTranslations[State.currentLang]?.[key]) {
        elem.setAttribute("aria-label", i18nTranslations[State.currentLang][key]);
      }
    });
  },

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
    if (DOM.mapImg) {
      DOM.mapImg.style.transform = `translateY(calc(-50% + ${State.mapSettings.mapYOffset || 0}px))`;
    }
    if (DOM.cityLayer) {
      DOM.cityLayer.style.transform = `translateY(${State.mapSettings.mapYOffset || 0}px)`;
    }
    DOM.cityLayer.innerHTML = "";

    if (DOM.mapTimeLabelLayer) {
      DOM.mapTimeLabelLayer.style.transform = `translateY(${State.mapSettings.mapYOffset || 0}px)`;
      DOM.mapTimeLabelLayer.innerHTML = "";
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
      button.addEventListener("click", () => State.toggleCity(city.id));
      DOM.cityLayer.append(button);

      if (isSelected && DOM.mapTimeLabelLayer) {
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

        DOM.mapTimeLabelLayer.append(label);
      }
    });
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
    DOM.timelineRows.innerHTML = "";
    State.selectedIds.forEach((id) => {
      const city = State.findCity(id);
      if (!city) return;
      const row = document.createElement("article");
      row.className = "timeline-row";

      const label = document.createElement("div");
      label.className = "city-label";

      const cityName = I18nUtils.getCityName(city);
      const labelText = document.createElement("div");
      labelText.className = "city-label-text";
      const dstSuffix = TimeUtils.isCurrentlyDST(city.zone)
        ? ` <span title="${I18nUtils.getTranslation("dstTooltip")}">${I18nUtils.getTranslation("dstLabel")}</span>`
        : "";
      labelText.innerHTML = `<span class="city-name">${cityName}</span><span class="city-time">${TimeUtils.utcOffsetText(new Date(), city.zone)} · ${TimeUtils.formatTime(new Date(), city.zone)}${dstSuffix}</span>`;

      label.append(labelText);

      const hours = document.createElement("div");
      hours.className = "hours";

      // Calculate offset difference in hours relative to the first (reference) city
      const firstCity = State.selectedIds.length > 0 ? State.findCity(State.selectedIds[0]) : null;
      const refZone = firstCity ? firstCity.zone : Intl.DateTimeFormat().resolvedOptions().timeZone;
      const refOffset = TimeUtils.getOffsetMinutes(State.baseHours[0], refZone);
      const cityOffset = TimeUtils.getOffsetMinutes(State.baseHours[0], city.zone);
      const diffHours = (cityOffset - refOffset) / 60;
      const I = Math.floor(diffHours);
      const F = diffHours - I;

      // Render 25 cells if there's a fractional hour offset, otherwise 24
      const numCells = F > 0 ? 25 : 24;
      for (let index = 0; index < numCells; index++) {
        const cellDate = new Date(State.baseHours[0].getTime() + (index - F) * 3600000);
        const cityHour = TimeUtils.hourInZone(cellDate, city.zone);
        const cell = document.createElement("div");
        cell.className = "hour-cell";
        cell.dataset.index = String(index);
        cell.textContent = String(cityHour).padStart(2, "0");
        cell.title = `${cityName} ${TimeUtils.formatTime(cellDate, city.zone)}`;

        // Show date badge at the transition of the day (00:00) OR at the very first cell (index 0)
        if (cityHour === 0 || index === 0) {
          const dateStr = TimeUtils.dateInZone(cellDate, city.zone);
          const dateBadge = document.createElement("span");
          dateBadge.className = "date-badge";
          dateBadge.textContent = dateStr;
          cell.appendChild(dateBadge);
        }

        const styleInfo = PeriodUtils.getHourStyle(cityHour);
        cell.style.backgroundColor = styleInfo.color;
        cell.style.color = styleInfo.fontColor;

        if (index === 0) {
          cell.style.marginLeft = `calc(-${F} * 100% / 24)`;
        }

        hours.append(cell);
      }

      row.append(label, hours);
      DOM.timelineRows.append(row);
    });
  },

  renderCurrentCitiesList() {
    if (!DOM.currentCitiesList) return;
    DOM.currentCitiesList.innerHTML = "";

    if (!this._cachedZoneDetails) {
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
        return `<option value="${detail.zone}">${detail.label}</option>`;
      }).join('');
    }

    const zoneDetails = this._cachedZoneDetails;
    const timezoneOptionsHTML = this._cachedTimezoneOptionsHTML;

    State.selectedIds.forEach((id) => {
      const city = State.findCity(id);
      if (!city) return;

      const cityName = I18nUtils.getCityName(city);
      let lng = city.lng;
      let lat = city.lat;
      if (typeof lng !== "number" || typeof lat !== "number") {
        lng = (city.x - 46.2357) / 0.2816;
        lat = (city.y - 63.3239) / -0.5257;
      }

      const card = document.createElement("div");
      card.className = "current-city-card";
      card.setAttribute("draggable", "false");
      card.dataset.id = id;

      const currentZone = city.zone || "UTC";

      card.innerHTML = `
        <div class="drag-handle">⋮⋮</div>
        <input class="city-name-input" type="text" value="${cityName.replaceAll('"', "&quot;")}" placeholder="Name">
        <select class="city-zone-select">
          ${timezoneOptionsHTML}
        </select>
        <input class="city-lng-input" type="number" step="any" value="${lng.toFixed(2)}" placeholder="Lng">
        <input class="city-lat-input" type="number" step="any" value="${lat.toFixed(2)}" placeholder="Lat">
        <button type="button" class="remove-city-card-btn" aria-label="${I18nUtils.getTranslation("removeCity", { name: cityName })}">×</button>
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

        const cx = 0.2816 * nextLng + 46.2357;
        const cy = -0.5257 * nextLat + 63.3239;
        const x = MathUtils.clamp(cx, 0, 100);
        const y = MathUtils.clamp(cy, 0, 100);

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
          Renderer.renderNightArea(State.selectedOffsetHours || 0);
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
      });

      DOM.currentCitiesList.append(card);
    });
  },

  populatePeriodSelectors() {
    document.querySelectorAll(".period-start, .period-end").forEach((select) => {
      select.innerHTML = "";
      for (let h = 0; h < 24; h++) {
        const opt = document.createElement("option");
        opt.value = h;
        opt.textContent = String(h).padStart(2, "0");
        select.appendChild(opt);
      }
    });
  },

  renderPeriodSettings() {
    State.timePeriods.forEach((period, idx) => {
      const row = document.querySelector(`.period-setting-row[data-period="${idx}"]`);
      if (!row) return;
      row.querySelector(".period-start").value = period.start;
      row.querySelector(".period-end").value = period.end;
      row.querySelector(".period-bg-color").value = ColorUtils.toHex7(period.color);
      row.querySelector(".period-text-color").value = ColorUtils.toHex7(period.fontColor);
    });
  },

  renderHourLines(offsetHours = 0) {
    if (!DOM.hourLines) return;
    DOM.hourLines.innerHTML = "";
    DOM.hourLines.style.backgroundImage = "none";

    const time = new Date();
    time.setTime(time.getTime() + offsetHours * 60 * 60 * 1000);

    const subsolarLng = -(time.getUTCHours() + time.getUTCMinutes() / 60 - 12) * 15;
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
      DOM.hourLines.append(line);
    }
  },

  _calcNightAreaBoundaryPoints(offsetHours) {
    const time = new Date();
    time.setTime(time.getTime() + offsetHours * 60 * 60 * 1000);

    const DECLINATION_DEG = 35.0;
    const tanDec = Math.tan(DECLINATION_DEG * Math.PI / 180);
    const Y_SHIFT = 10;

    const subsolarLng = -(time.getUTCHours() + time.getUTCMinutes() / 60 - 12) * 15;

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

  renderMapTimeline(offsetHours = 0) {
    if (!DOM.mapTimeline) return;
    DOM.mapTimeline.innerHTML = "";

    const time = new Date();
    time.setTime(time.getTime() + offsetHours * 60 * 60 * 1000);

    const subsolarLng = -(time.getUTCHours() + time.getUTCMinutes() / 60 - 12) * 15;
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

        DOM.mapTimeline.append(tick, label);
      }
    }
  },

  renderNightArea(offsetHours = 0) {
    if (!DOM.nightPath) return;

    this.renderMapTimeline(offsetHours);
    this.renderHourLines(offsetHours);

    if (DOM.nightAreaOverlay) {
      DOM.nightAreaOverlay.style.transform = `translateY(${State.mapSettings.mapYOffset || 0}px)`;
    }

    // Filled night area — always at the true "now" position (offset = 0)
    const realNowPts = this._calcNightAreaBoundaryPoints(0);
    DOM.nightPath.setAttribute("d", `M 0,100 L ${realNowPts.join(" L ")} L 100,100 Z`);

    // Dynamic reference curve — follows the active scrub line offset
    if (DOM.nightPathRef) {
      const activePts = this._calcNightAreaBoundaryPoints(offsetHours);
      DOM.nightPathRef.setAttribute("d", `M ${activePts.join(" L ")}`);
    }

    // Live update local times for selected cities on the map
    const activeFraction = State.getActiveScrubFraction();
    this.updateMapCityTimes(activeFraction);
  },

  updateMapCityTimes(activeFraction) {
    if (!DOM.mapTimeLabelLayer) return;

    const useFraction = activeFraction !== null ? activeFraction : TimelineUtils.getNowFraction();

    if (useFraction === null || !State.baseHours || !State.baseHours[0]) {
      DOM.mapTimeLabelLayer.querySelectorAll(".map-time-label").forEach((label) => {
        label.style.display = "none";
        label.textContent = "";
      });
      return;
    }

    const targetDate = new Date(State.baseHours[0].getTime() + useFraction * 24 * 3600000);

    DOM.mapTimeLabelLayer.querySelectorAll(".map-time-label").forEach((label) => {
      const zone = label.dataset.zone;
      if (zone) {
        label.textContent = TimeUtils.formatTime(targetDate, zone);
        label.style.display = "";
      }
    });
  },

  applyVisibilitySettings() {
    if (DOM.nightAreaOverlay) {
      DOM.nightAreaOverlay.style.display = State.mapSettings.showNightArea ? "" : "none";
    }
    if (DOM.hourLines) {
      DOM.hourLines.style.display = State.mapSettings.showHourLines ? "" : "none";
    }
    if (DOM.mapTimeLabelLayer) {
      DOM.mapTimeLabelLayer.style.display = State.mapSettings.showCityTimes ? "" : "none";
    }
  },

  render() {
    State.makeBaseHours();
    this.renderNowText();
    this.renderMap();
    this.renderRows();
    this.renderCurrentCitiesList();
    this.renderPeriodSettings();
    // Render lines after layout is established
    this.renderNowLine();
    this.renderScrubLine();
    this.renderNightArea(State.selectedOffsetHours || 0);
    this.applyVisibilitySettings();
  },

  renderNowLine() {
    if (!DOM.nowLine) return;
    const fraction = TimelineUtils.getNowFraction();
    const left = TimelineUtils.fractionToLeft(fraction);
    if (left === 0) {
      DOM.nowLine.style.display = "none";
      return;
    }
    DOM.nowLine.style.display = "";
    DOM.nowLine.style.left = `${left}px`;
  },

  renderScrubLine() {
    if (!DOM.scrubLinesContainer) return;

    // Clear dynamic scrub lines
    DOM.scrubLinesContainer.innerHTML = "";

    // Sync selectedOffsetHours based on active scrub
    const activeFraction = State.getActiveScrubFraction();
    const nowFraction = TimelineUtils.getNowFraction();
    if (activeFraction !== null) {
      State.selectedOffsetHours = (activeFraction - nowFraction) * 24;
    } else {
      State.selectedOffsetHours = 0;
    }

    State.scrubs.forEach((scrub) => {
      const left = TimelineUtils.fractionToLeft(scrub.fraction);
      if (left === 0) return;

      const isActive = (scrub.id === State.activeScrubId);

      // Create line group
      const group = document.createElement("div");
      group.className = "scrub-line-group";
      group.dataset.id = scrub.id;
      group.style.left = `${left}px`;

      // Create dashed vertical line
      const line = document.createElement("div");
      line.className = "timeline-vline scrub-line";
      if (isActive) {
        line.classList.add("is-dragging");
      }

      // Create drag handle
      const handle = document.createElement("div");
      handle.className = "scrub-handle";
      if (isActive) {
        handle.classList.add("is-dragging");
      }
      handle.setAttribute("aria-label", "Drag to shift night area view");

      // Create remove button
      const removeTitle = (typeof I18nUtils !== "undefined" && typeof I18nUtils.getTranslation === "function")
        ? I18nUtils.getTranslation("removeScrubLine")
        : "Remove";

      const resetBtn = document.createElement("button");
      resetBtn.className = "scrub-reset-btn is-visible";
      resetBtn.type = "button";
      resetBtn.title = removeTitle;
      resetBtn.setAttribute("aria-label", removeTitle);
      resetBtn.textContent = "×";

      group.appendChild(line);
      group.appendChild(handle);
      group.appendChild(resetBtn);

      DOM.scrubLinesContainer.appendChild(group);
    });
  }
};
