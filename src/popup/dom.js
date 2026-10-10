/**
 * World Time Aligner - DOM Element Caching Module
 */
const DOM = {
  cityLayer: document.querySelector("#cityLayer"),
  mapTimeLabelLayer: document.querySelector("#mapTimeLabelLayer"),
  timelineRows: document.querySelector("#timelineRows"),
  nowLine: document.querySelector("#nowLine"),
  scrubLinesContainer: document.querySelector("#scrubLinesContainer"),
  timelinePanel: document.querySelector(".timeline-panel"),
  nowText: document.querySelector("#nowText"),
  resetButton: document.querySelector("#resetButton"),
  clearAllButton: document.querySelector("#clearAllButton"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsPanel: document.querySelector("#settingsPanel"),
  resetMapButton: document.querySelector("#resetMapButton"),
  resetPeriodsButton: document.querySelector("#resetPeriodsButton"),
  currentCitiesList: document.querySelector("#currentCitiesList"),
  searchCityInput: document.querySelector("#searchCityInput"),
  cityLimitInput: document.querySelector("#cityLimitInput"),
  searchCityBtn: document.querySelector("#searchCityBtn"),
  searchResultsList: document.querySelector("#searchResultsList"),
  langButtons: document.querySelectorAll(".lang-btn"),
  nowLineModeSelect: document.querySelector("#nowLineModeSelect"),
  mapImg: document.querySelector(".world-map"),
  mapShell: document.querySelector(".map-shell"),
  timezoneHoverBar: document.querySelector("#timezoneHoverBar"),
  hourLines: document.querySelector(".hour-lines"),
  nightAreaOverlay: document.querySelector("#nightAreaOverlay"),
  nightPath: document.querySelector("#nightPath"),
  nightPathRef: document.querySelector("#nightPathRef"),
  mapTimeline: document.querySelector("#mapTimeline"),
  mapPanel: document.querySelector(".map-panel")
};
