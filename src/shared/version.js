// src/shared/version.js
export const TimeMapperVersion = {
  render(el) {
    if (!el) return;
    try {
      const version = chrome.runtime.getManifest().version;
      el.textContent = `TimeMapper v${version}`;
    } catch {
      el.textContent = `TimeMapper`;
    }
  }
};

if (typeof globalThis !== "undefined") {
  globalThis.TimeMapperVersion = TimeMapperVersion;
}
