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
  },

  renderRows() {
    TimelinePreview.renderRows(TimelinePreview.collectRefs(document));
  },

  renderNightArea(offsetHours = 0) {
    MapPreview.renderNightArea(MapPreview.collectRefs(document), offsetHours);
  },

  applyVisibilitySettings() {
    MapPreview.applyVisibility(MapPreview.collectRefs(document));
  },

  render() {
    State.makeBaseHours();
    this.renderNowText();
    this.renderMap();
    this.renderRows();
    CityPreview.renderCurrentCitiesList(CityPreview.collectRefs(document), () => Renderer.render());
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
