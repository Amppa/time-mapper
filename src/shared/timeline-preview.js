/**
 * TimeMapper - Shared Timeline Rendering Module
 *
 * City hour rows, now-line marker and scrub-line interaction, shared by
 * the popup (Renderer / AppController delegate to it) and by the
 * options-page live preview. All DOM access goes through the `refs`
 * object; rerendering is done through the `api` callbacks so each page
 * keeps its own render loop.
 *
 * Expects State / PeriodUtils / TimeUtils / I18nUtils / EscapeUtils /
 * TimelineUtils / CONFIG loaded.
 */

const TimelinePreview = {
  /**
   * Collect the nodes this module renders into. `root` is `document`
   * in the popup or the mount element built by buildPreview().
   */
  collectRefs(root) {
    const q = (sel) => root.querySelector(sel);
    return {
      timelinePanel: q(".timeline-panel"),
      timelineRows: q("#timelineRows"),
      nowLine: q("#nowLine"),
      scrubLinesContainer: q("#scrubLinesContainer"),
    };
  },

  /**
   * Build a standalone timeline (rows + now-line + scrub layer) into `mount`.
   */
  buildPreview(mount) {
    mount.innerHTML = "";

    const panel = document.createElement("div");
    panel.className = "timeline-panel";

    const rows = document.createElement("div");
    rows.id = "timelineRows";
    rows.className = "timeline-rows";
    panel.append(rows);

    const nowLine = document.createElement("div");
    nowLine.id = "nowLine";
    nowLine.className = "timeline-vline now-line";
    nowLine.setAttribute("aria-hidden", "true");
    panel.append(nowLine);

    const scrubs = document.createElement("div");
    scrubs.id = "scrubLinesContainer";
    panel.append(scrubs);

    mount.append(panel);
    return this.collectRefs(mount);
  },

  renderRows(refs) {
    if (!refs.timelineRows) return;
    refs.timelineRows.innerHTML = "";
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
      labelText.innerHTML = `<span class="city-name">${EscapeUtils.html(cityName)}</span><span class="city-time">${TimeUtils.utcOffsetText(new Date(), city.zone)} · ${TimeUtils.formatTime(new Date(), city.zone)}${dstSuffix}</span>`;

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
      refs.timelineRows.append(row);
    });
  },

  renderNowLine(refs) {
    if (!refs.nowLine) return;
    const fraction = TimelineUtils.getNowFraction();
    const left = TimelineUtils.fractionToLeft(fraction, refs.timelinePanel);
    if (left === 0) {
      refs.nowLine.style.display = "none";
      return;
    }
    refs.nowLine.style.display = "";
    refs.nowLine.style.left = `${left}px`;
  },

  renderScrubLine(refs) {
    if (!refs.scrubLinesContainer) return;

    // Clear dynamic scrub lines
    refs.scrubLinesContainer.innerHTML = "";

    State.scrubs.forEach((scrub) => {
      const left = TimelineUtils.fractionToLeft(scrub.fraction, refs.timelinePanel);
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

      refs.scrubLinesContainer.appendChild(group);
    });
  },

  /**
   * Click-to-add / drag / remove scrub lines.
   * `api.renderScrubLine()` repaints scrub markers,
   * `api.renderNightArea(offsetHours)` follows with the night ref curve.
   */
  wireScrub(refs, api) {
    if (!refs.scrubLinesContainer || !refs.timelinePanel) return;
    let isDragging = false;
    let activeDragScrubId = null;

    // --- Interaction 1 & 2: Click/Drag timeline to add or drag scrub-line ---
    refs.timelinePanel.addEventListener("mousedown", (e) => {
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
        if (State.scrubs && State.scrubs.length >= CONFIG.maxScrubs) {
          return;
        }

        const panelRect = refs.timelinePanel.getBoundingClientRect();
        const pxLeft = e.clientX - panelRect.left;
        fraction = TimelineUtils.leftToFraction(pxLeft, refs.timelinePanel);

        const newScrub = {
          id: `scrub_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          fraction: fraction
        };
        State.scrubs.push(newScrub);
        targetScrubId = newScrub.id;

        // Render the newly created scrub line
        State.activeScrubId = targetScrubId;
        api.renderScrubLine();
      }

      if (targetScrubId) {
        activeDragScrubId = targetScrubId;
        State.activeScrubId = targetScrubId;
        isDragging = true;

        // Apply dragging visual styles
        refs.scrubLinesContainer.querySelectorAll(".scrub-line, .scrub-handle").forEach((el) => {
          el.classList.remove("is-dragging");
        });

        const group = refs.timelinePanel.querySelector(`.scrub-line-group[data-id="${targetScrubId}"]`);
        if (group) {
          const lineEl = group.querySelector(".scrub-line");
          const handleEl = group.querySelector(".scrub-handle");
          if (lineEl) lineEl.classList.add("is-dragging");
          if (handleEl) handleEl.classList.add("is-dragging");
        }

        e.preventDefault();
      }
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging || !activeDragScrubId) return;

      const panelRect = refs.timelinePanel.getBoundingClientRect();
      const pxLeft = e.clientX - panelRect.left;
      const fraction = TimelineUtils.leftToFraction(pxLeft, refs.timelinePanel);

      // Update fraction in state
      const scrub = State.scrubs.find(s => s.id === activeDragScrubId);
      if (scrub) {
        scrub.fraction = fraction;
      }

      // Update position of group element directly for performance
      const group = refs.timelinePanel.querySelector(`.scrub-line-group[data-id="${activeDragScrubId}"]`);
      if (group) {
        const left = TimelineUtils.fractionToLeft(fraction, refs.timelinePanel);
        group.style.left = `${left}px`;
      }

      // Live-update map timeline and ref lines
      api.renderNightArea(State.selectedOffsetHours);
    });

    document.addEventListener("mouseup", () => {
      if (!isDragging) return;
      isDragging = false;
      activeDragScrubId = null;
    });

    // --- Interaction 3: Click [x] to remove scrub-line (Event Delegation) ---
    refs.timelinePanel.addEventListener("click", (e) => {
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

      // Redraw UI
      api.renderScrubLine();
      api.renderNightArea(State.selectedOffsetHours);
    });
  },

  /** Full repaint: rows + now-line + scrub markers. */
  renderAll(refs) {
    this.renderRows(refs);
    this.renderNowLine(refs);
    this.renderScrubLine(refs);
  },
};
