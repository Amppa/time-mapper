/**
 * TimeMapper - DOM Element Caching Module
 *
 * Only nodes the popup controller wires directly are cached here; everything
 * the shared preview modules touch is resolved by their own collectRefs().
 */
const DOM = {
  nowText: document.querySelector("#nowText"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsPanel: document.querySelector("#settingsPanel"),
  openOptionsBtn: document.querySelector("#openOptionsBtn"),
  topbarOptionsButton: document.querySelector("#topbarOptionsButton"),
  resetMapButton: document.querySelector("#resetMapButton"),
  resetPeriodsButton: document.querySelector("#resetPeriodsButton"),
  currentCitiesList: document.querySelector("#currentCitiesList"),
  mapShell: document.querySelector(".map-shell"),
  timezoneHoverBar: document.querySelector("#timezoneHoverBar"),
  cityLayer: document.querySelector("#cityLayer")
};