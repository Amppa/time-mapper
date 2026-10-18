/**
 * TimeMapper - DOM Element Caching Module
 *
 * The popup is read-only, so it only caches the few nodes its controller
 * wires directly; everything the shared preview modules touch is resolved by
 * their own collectRefs().
 */
export const DOM = {
  nowText: document.querySelector("#nowText"),
  topbarOptionsButton: document.querySelector("#topbarOptionsButton"),
  mapShell: document.querySelector(".map-shell"),
  cityLayer: document.querySelector("#cityLayer")
};

if (typeof globalThis !== "undefined") {
  globalThis.DOM = DOM;
}