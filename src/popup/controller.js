import { DOM } from "./dom.js";
import { State } from "../shared/state.js";
import { Renderer } from "./renderer.js";
import { I18nUtils } from "../shared/utils.js";
import { TimelinePreview } from "../shared/timeline-preview.js";
import { MapPreview } from "../shared/map-preview.js";
import { CONFIG } from "../shared/config.js";

export const AppController = {
  /**
   * Wire the gear button that hands off to the options page. The popup itself
   * is read-only: cities are added, reordered and reset there.
   */
  wireOptionsButton() {
    const handleOpenOptions = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      const targetUrl = chrome.runtime?.getURL ? chrome.runtime.getURL("src/options/options.html") : "../options/options.html";
      try {
        if (chrome.tabs && chrome.tabs.create) {
          chrome.tabs.create({ url: targetUrl });
        } else if (chrome.runtime && chrome.runtime.openOptionsPage) {
          chrome.runtime.openOptionsPage(() => {
            if (chrome.runtime.lastError) {
              window.open(targetUrl, "_blank");
            }
          });
        } else {
          window.open(targetUrl, "_blank");
        }
      } catch (err) {
        window.open(targetUrl, "_blank");
      }
    };

    if (DOM.topbarOptionsButton) {
      DOM.topbarOptionsButton.addEventListener("click", handleOpenOptions);
    }
  },

  wireScrubLine() {
    TimelinePreview.wireScrub(TimelinePreview.collectRefs(document), {
      renderScrubLine: () => Renderer.renderScrubLine(),
      renderNightArea: (offsetHours) => Renderer.renderNightArea(offsetHours),
    });
  },

  wireMapClick() {
    MapPreview.wireMapClick(MapPreview.collectRefs(document), () => Renderer.render());
  },

  async init() {
    // One-shot first paint: never render default cities before the synced
    // settings arrive. The static "Loading current time..." headline and the
    // empty layers cover the local-cache read (1-3 ms).
    await State.init();

    this.wireOptionsButton();
    this.wireScrubLine();
    this.wireMapClick();

    I18nUtils.applyAttributes();
    Renderer.render();

    // Sync-key changes pushed from Options or other devices.
    const syncedKeys = new Set(Object.values(CONFIG.syncKeys));
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      if (!Object.keys(changes).some((key) => syncedKeys.has(key))) return;
      State.init().then(() => {
        I18nUtils.applyAttributes();
        Renderer.render();
      });
    });

    // Local-only keys (theme, mapSettings) still travel via localStorage
    // events from other extension pages.
    window.addEventListener("storage", () => {
      State.init();
      I18nUtils.applyAttributes();
      // resolve() only reads, so we never write localStorage back and cause a
      // second storage event in the options page.
      if (globalThis.TimeMapperTheme) {
        document.documentElement.dataset.theme =
          TimeMapperTheme.resolve(localStorage.getItem("theme") || "auto");
      }
      Renderer.render();
    });

    setInterval(() => Renderer.render(), 60 * 1000);
  }
};

if (typeof globalThis !== "undefined") {
  globalThis.AppController = AppController;
}

AppController.init();
