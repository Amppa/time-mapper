// src/shared/version.js
(() => {
  function render(el) {
    if (!el) return;
    try {
      const version = chrome.runtime.getManifest().version;
      el.textContent = `TimeMapper v${version}`;
    } catch {
      el.textContent = `TimeMapper`;
    }
  }

  globalThis.TimeMapperVersion = { render };
})();
