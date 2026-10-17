/**
 * TimeMapper - DOM Element Caching Module
 *
 * The popup is read-only, so it only caches the few nodes its controller
 * wires directly; everything the shared preview modules touch is resolved by
 * their own collectRefs().
 */
const DOM = {
  nowText: document.querySelector("#nowText"),
  topbarOptionsButton: document.querySelector("#topbarOptionsButton"),
  mapShell: document.querySelector(".map-shell"),
  timezoneHoverBar: document.querySelector("#timezoneHoverBar"),
  cityLayer: document.querySelector("#cityLayer")
};