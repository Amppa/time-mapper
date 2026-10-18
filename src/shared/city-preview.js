/**
 * TimeMapper - Shared City List Preview Module
 */

import { State } from "./state.js";
import { CONFIG } from "./config.js";
import { MapUtils, TimeUtils, I18nUtils, EscapeUtils } from "./utils.js";

export const CityPreview = {
  /**
   * Collect the nodes this module renders into. `root` is `document` in the
   * popup or the mount element built by each page.
   */
  collectRefs(root) {
    const q = (sel) => root.querySelector(sel);
    return {
      currentCitiesList: q("#currentCitiesList"),
      searchCityInput: q("#searchCityInput"),
      searchCityBtn: q("#searchCityBtn"),
      searchResultsList: q("#searchResultsList"),
      clearAllButton: q("#clearAllButton"),
      resetButton: q("#resetButton"),
    };
  },

  /** Clear drag state on every city card. */
  clearCardDragState(refs) {
    if (refs.currentCitiesList) {
      refs.currentCitiesList.classList.remove("is-dragging-active");
    }
    document.querySelectorAll(".current-city-card").forEach((c) => {
      c.classList.remove("drag-over-top", "drag-over-bottom");
      c._cachedRect = null;
    });
    State.draggingId = null;
    State.lastActiveCard = null;
  },

  /**
   * Render the current-cities list from State.
   * `onReorder` is invoked after a drag-reorder so the page can repaint
   * dependent UI (timeline rows, map previews, ...).
   */
  renderCurrentCitiesList(refs, onReorder) {
    if (!refs.currentCitiesList) return;
    refs.currentCitiesList.innerHTML = "";

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
        <select class="city-zone-select"></select>
        <input class="city-lng-input" type="number" step="any" value="${lng.toFixed(2)}" placeholder="Lng">
        <input class="city-lat-input" type="number" step="any" value="${lat.toFixed(2)}" placeholder="Lat">
        <button type="button" class="remove-city-card-btn" aria-label="${EscapeUtils.html(I18nUtils.getTranslation("removeCity", { name: cityName }))}">×</button>
      `;

      const nameInput = card.querySelector(".city-name-input");
      const zoneSelect = card.querySelector(".city-zone-select");
      const lngInput = card.querySelector(".city-lng-input");
      const latInput = card.querySelector(".city-lat-input");
      const removeBtn = card.querySelector(".remove-city-card-btn");
      const dragHandle = card.querySelector(".drag-handle");

      // Timezone options: browser-supported zones + zones of selected cities,
      // sorted by UTC offset.
      const supportedZones = (typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function")
        ? Intl.supportedValuesOf("timeZone")
        : ["UTC", "Asia/Taipei", "Asia/Hong_Kong", "Asia/Tokyo", "Asia/Singapore", "Europe/London", "America/New_York", "America/Los_Angeles"];

      const uniqueZonesSet = new Set(supportedZones);
      State.selectedIds.forEach((sid) => {
        const c = State.findCity(sid);
        if (c && c.zone) uniqueZonesSet.add(c.zone);
      });

      const now = new Date();
      const zoneDetails = Array.from(uniqueZonesSet).map((zone) => {
        const offsetMins = TimeUtils.getOffsetMinutes(now, zone);
        const sign = offsetMins >= 0 ? "+" : "-";
        const absMins = Math.abs(offsetMins);
        const hours = Math.floor(absMins / 60);
        const mins = absMins % 60;
        const offsetStr = `UTC${sign}${hours}${mins > 0 ? ":" + String(mins).padStart(2, "0") : ""}`;
        return { zone, offsetMins, label: `${zone} (${offsetStr})` };
      });

      zoneDetails.sort((a, b) => {
        if (a.offsetMins !== b.offsetMins) return a.offsetMins - b.offsetMins;
        return a.zone.localeCompare(b.zone);
      });

      zoneDetails.forEach((detail) => {
        const opt = document.createElement("option");
        opt.value = detail.zone;
        opt.textContent = detail.label;
        zoneSelect.appendChild(opt);
      });
      zoneSelect.value = currentZone;

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
        if (refs.currentCitiesList) {
          refs.currentCitiesList.classList.add("is-dragging-active");
        }
      });

      card.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";

        if (State.draggingId && State.draggingId !== id) {
          if (State.lastActiveCard && State.lastActiveCard !== card) {
            State.lastActiveCard.classList.remove("drag-over-top", "drag-over-bottom");
            State.lastActiveCard._cachedRect = null;
          }
          State.lastActiveCard = card;

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
        CityPreview.clearCardDragState(refs);
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

            // Repaint the list so the new order is visible immediately.
            CityPreview.renderCurrentCitiesList(refs);
            // Notify the page to repaint dependent UI (timeline rows, map previews).
            if (typeof onReorder === "function") {
              onReorder();
            }
          }
        }
        CityPreview.clearCardDragState(refs);
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
          State.selectedIds = State.selectedIds.map((selectedId) => (selectedId === city.id ? targetId : selectedId));
          State.saveCustomCities();
          State.saveSelection();
        } else {
          State.customCities = State.customCities.map((existing) => (existing.id === city.id ? updatedCity : existing));
          State.saveCustomCities();
          State.saveSelection();
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

      refs.currentCitiesList.append(card);
    });
  },

  /**
   * Wire the add-city search (Open-Meteo geocoding API).
   * `onCityAdded` is called after a city is added so the page can repaint.
   */
  wireCitySearch(refs, onCityAdded) {
    if (!refs.searchCityBtn) return;

    document.addEventListener("click", (e) => {
      if (refs.searchResultsList && !refs.searchResultsList.contains(e.target) && e.target !== refs.searchCityInput && e.target !== refs.searchCityBtn) {
        refs.searchResultsList.hidden = true;
      }
    });

    const triggerSearch = () => {
      const query = refs.searchCityInput.value.trim();
      if (!query) return;

      refs.searchCityBtn.textContent = "⏳";
      refs.searchCityBtn.style.pointerEvents = "none";
      refs.searchResultsList.hidden = true;
      refs.searchResultsList.innerHTML = "";

      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
      fetch(url)
        .then((res) => res.json())
        .then((data) => {
          if (data && data.results && data.results.length > 0) {
            refs.searchResultsList.innerHTML = "";
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
                    <span class="search-result-name">${EscapeUtils.html(result.name)}</span>
                    <span class="search-result-country">${EscapeUtils.html(subtitleText)}</span>
                  </div>
                  <div class="search-result-details">${EscapeUtils.html(result.timezone || "UTC")} (Lng: ${lng.toFixed(1)}, Lat: ${lat.toFixed(1)})</div>
                </div>
              `;

              card.addEventListener("click", (evt) => {
                evt.stopPropagation();

                if (State.selectedIds.length >= State.cityLimit) {
                  alert(I18nUtils.getTranslation("cityLimitReached") || `最多顯示${State.cityLimit}個城市。`);
                  return;
                }

                const newCity = {
                  id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  name: result.name,
                  zone: result.timezone || "UTC",
                  x: MathUtils.clamp(MapUtils.lngToX(lng), 0, 100),
                  y: MathUtils.clamp(MapUtils.latToY(lat), 0, 100),
                  lng: lng,
                  lat: lat
                };

                State.customCities = [...State.customCities, newCity];
                State.saveCustomCities();
                State.toggleCity(newCity.id);
                if (onCityAdded) onCityAdded();

                refs.searchCityInput.value = "";
                refs.searchResultsList.hidden = true;
                refs.searchResultsList.innerHTML = "";
              });

              refs.searchResultsList.append(card);
            });
            refs.searchResultsList.hidden = false;
          } else {
            alert(I18nUtils.getTranslation("cityNotFound") || "City not found");
          }
        })
        .catch((err) => {
          console.error(err);
          alert("Network error. Please try again.");
        })
        .finally(() => {
          refs.searchCityBtn.textContent = I18nUtils.getTranslation("searchBtn") || "Search";
          refs.searchCityBtn.style.pointerEvents = "auto";
        });
    };

    refs.searchCityBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      triggerSearch();
    });

    refs.searchCityInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        triggerSearch();
      }
    });
  },

  /**
   * Wire clear / reset buttons.
   * `onReset` is called after the selection is reset.
   */
  wireResetButtons(refs, onReset) {
    if (refs.clearAllButton) {
      refs.clearAllButton.addEventListener("click", () => {
        State.selectedIds = [];
        State.customCities = [];
        State.saveSelection();
        State.saveCustomCities();
        if (onReset) onReset();
      });
    }

    if (refs.resetButton) {
      refs.resetButton.addEventListener("click", () => {
        State.selectedIds = [...CONFIG.defaultSelection].slice(0, State.cityLimit);
        State.saveSelection();
        if (onReset) onReset();
      });
    }
  },
};

if (typeof globalThis !== "undefined") {
  globalThis.CityPreview = CityPreview;
}
