import { DOM } from "./dom.js";
import { State } from "../shared/state.js";
import { Renderer } from "./renderer.js";
import { MathUtils, MapUtils, I18nUtils } from "../shared/utils.js";
import { TimelinePreview } from "../shared/timeline-preview.js";

export const AppController = {
  addGeneratedTimezone(offset, clickX, clickY) {
    const offsetText = offset >= 0 ? `+${offset}` : `${offset}`;
    const name = `UTC${offsetText}`;

    let zone;
    if (offset === 0) {
      zone = "Etc/GMT";
    } else if (offset > 0) {
      zone = `Etc/GMT-${offset}`;
    } else {
      zone = `Etc/GMT+${Math.abs(offset)}`;
    }

    const x = MathUtils.clamp(MapUtils.uncalibrateX(clickX), 0, 100);
    const y = MathUtils.clamp(MapUtils.uncalibrateY(clickY), 0, 100);

    const newCity = {
      id: `custom-utc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      zone,
      x,
      y
    };

    State.customCities = [...State.customCities, newCity];
    State.saveCustomCities();
    State.toggleCity(newCity.id);
    Renderer.render();
  },

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
    const handleMapClick = (targetContainer, e) => {
      if (e.target.closest(".city-pin")) return;
      const rect = targetContainer.getBoundingClientRect();
      const clickX = ((e.clientX - rect.left) / rect.width) * 100;
      const clickY = ((e.clientY - rect.top) / rect.height) * 100;

      const lng = MapUtils.getXLongitude(clickX);
      const offset = MathUtils.clamp(Math.round(lng / 15), -12, 12);

      this.addGeneratedTimezone(offset, clickX, clickY);
    };

    if (DOM.cityLayer) {
      DOM.cityLayer.addEventListener("click", (e) => {
        if (e.target === DOM.cityLayer) {
          handleMapClick(DOM.cityLayer, e);
        }
      });
    }

    const hoverBands = DOM.mapShell?.querySelector(".timezone-hover-bands");
    if (hoverBands) {
      hoverBands.addEventListener("click", (e) => {
        handleMapClick(hoverBands, e);
      });
    }
  },

  init() {
    State.init();

    this.wireOptionsButton();
    this.wireScrubLine();
    this.wireMapClick();

    I18nUtils.applyAttributes();
    requestAnimationFrame(() => {
      Renderer.render();
    });

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
