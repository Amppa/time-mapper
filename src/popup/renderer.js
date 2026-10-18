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
    // Render lines after layout is established, share single grid geometry measure
    const timelineRefs = TimelinePreview.collectRefs(document);
    const geo = TimelineUtils.gridGeometry(timelineRefs.timelinePanel);
    this.renderNowLine(geo);
    this.renderScrubLine(geo);
    this.renderNightArea(State.selectedOffsetHours);
    this.applyVisibilitySettings();
  },

  renderNowLine(geo = null) {
    TimelinePreview.renderNowLine(TimelinePreview.collectRefs(document), geo);
  },

  renderScrubLine(geo = null) {
    TimelinePreview.renderScrubLine(TimelinePreview.collectRefs(document), geo);
  },

  renderIntervals(geo = null) {
    TimelinePreview.renderIntervals(TimelinePreview.collectRefs(document), geo);
  }
};
