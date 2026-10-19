import { DOM } from "./dom.js";
import { State } from "../shared/state.js";
import { Renderer } from "./renderer.js";
import { I18nUtils } from "../shared/utils.js";
import { TimelinePreview } from "../shared/timeline-preview.js";
import { MapPreview } from "../shared/map-preview.js";

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

  init() {
    State.init();

    this.wireOptionsButton();
    this.wireScrubLine();
    this.wireMapClick();

    I18nUtils.applyAttributes();
    Renderer.render();

    // Listen to settings changes from Options page
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
