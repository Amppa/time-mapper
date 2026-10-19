/**
 * TimeMapper - Application State Management Module
 */

import { CONFIG } from "./config.js";
import { cityCatalog } from "./cities.js";
import { TimeUtils, TimelineUtils } from "./utils.js";

/** localStorage can throw (quota exceeded, blocked storage); a failed write must not break the UI. */
function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch { }
}

export const State = {
  selectedIds: [],
  customCities: [],
  mapSettings: {},
  timePeriods: [],
  currentLang: "zh",
  baseHours: [],
  nowLineMode: "local",   // 'local' | 'firstCity'
  scrubs: [],             // array of { id, fraction } objects
  activeScrubId: null,    // id of the active scrub line
  draggingId: null,
  cityLimit: 10,
  lastActiveCard: null,
  _localCity: null,
  _cachedCityList: null,
  _cachedCityIndex: null,
  _cachedCustomCities: null,

  /**
   * Derived from the active scrub line; never assigned directly.
   * Hours to shift "now" by so that it lines up with the active scrub.
   */
  get selectedOffsetHours() {
    const activeFraction = this.getActiveScrubFraction();
    if (activeFraction === null) return 0;
    return (activeFraction - TimelineUtils.getNowFraction()) * 24;
  },

  init() {
    this._localCity = null;
    this._cachedCityList = null;
    this._cachedCityIndex = null;
    this._cachedCustomCities = null;
    this.currentLang = this.loadLanguage();
    this.timePeriods = this.loadTimePeriods();
    this.mapSettings = this.loadMapSettings();
    this.customCities = this.loadCustomCities();
    this.cityLimit = CONFIG.maxCities;
    this.selectedIds = this.loadSelection();
    this.nowLineMode = this.loadNowLineMode();
    this.scrubs = [];
    this.activeScrubId = null;
    this.draggingId = null;
    this.lastActiveCard = null;
    this.makeBaseHours();
  },

  loadLanguage() {
    try {
      const saved = localStorage.getItem(CONFIG.languageKey);
      if (saved && CONFIG.supportedLanguages.includes(saved)) return saved;
    } catch { }
    const navLang = (navigator.language || navigator.userLanguage || "zh").toLowerCase();
    if (navLang.startsWith("en")) return "en";
    if (navLang.startsWith("es")) return "es";
    return "zh";
  },

  /** Stored preference for the options-page dropdown: "auto" when unset. */
  getLanguagePreference() {
    try {
      const saved = localStorage.getItem(CONFIG.languageKey);
      if (saved === "auto") return "auto";
      if (saved && CONFIG.supportedLanguages.includes(saved)) return saved;
    } catch { }
    return "auto";
  },

  saveLanguage(lang) {
    if (lang === "auto") {
      safeSetItem(CONFIG.languageKey, "auto");
      this.currentLang = this.loadLanguage();
      return;
    }
    if (!CONFIG.supportedLanguages.includes(lang)) return;
    this.currentLang = lang;
    safeSetItem(CONFIG.languageKey, lang);
  },

  loadTimePeriods() {
    const fallback = () => JSON.parse(JSON.stringify(CONFIG.defaultTimePeriods));
    try {
      const saved = JSON.parse(localStorage.getItem(CONFIG.timePeriodsKey));
      // Colors were user-customizable before hardcode; keep ranges only.
      if (Array.isArray(saved) && saved.length >= 2 && saved.length <= 4 &&
        saved.every((p) => p && Number.isFinite(Number(p.start)) && Number.isFinite(Number(p.end)))) {
        return saved.map((p, i) => ({
          name: p.name || `period${i + 1}`,
          start: Number(p.start),
          end: Number(p.end)
        }));
      }
    } catch { }
    return fallback();
  },

  saveTimePeriods() {
    safeSetItem(CONFIG.timePeriodsKey, JSON.stringify(this.timePeriods));
  },

  loadMapSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(CONFIG.mapSettingsKey));
      if (saved && typeof saved === "object") {
        return {
          ...CONFIG.defaultMapSettings,
          lngOffset: Number.isFinite(Number(saved.lngOffset)) ? Number(saved.lngOffset) : CONFIG.defaultMapSettings.lngOffset,
          latOffset: Number.isFinite(Number(saved.latOffset)) ? Number(saved.latOffset) : CONFIG.defaultMapSettings.latOffset,
          widthScale: Number.isFinite(Number(saved.widthScale)) ? Number(saved.widthScale) : CONFIG.defaultMapSettings.widthScale,
          heightScale: Number.isFinite(Number(saved.heightScale)) ? Number(saved.heightScale) : CONFIG.defaultMapSettings.heightScale,
          mapYOffset: Number.isFinite(Number(saved.mapYOffset)) ? Number(saved.mapYOffset) : CONFIG.defaultMapSettings.mapYOffset,
          showNightArea: saved.showNightArea !== undefined ? !!saved.showNightArea : CONFIG.defaultMapSettings.showNightArea,
          showHourLines: saved.showHourLines !== undefined ? !!saved.showHourLines : CONFIG.defaultMapSettings.showHourLines,
          showCityTimes: saved.showCityTimes !== undefined ? !!saved.showCityTimes : CONFIG.defaultMapSettings.showCityTimes
        };
      }
    } catch {
      localStorage.removeItem(CONFIG.mapSettingsKey);
    }
    return { ...CONFIG.defaultMapSettings };
  },

  saveMapSettings() {
    safeSetItem(CONFIG.mapSettingsKey, JSON.stringify(this.mapSettings));
  },

  loadCustomCities() {
    try {
      const saved = JSON.parse(localStorage.getItem(CONFIG.customCitiesKey));
      if (Array.isArray(saved)) {
        return saved
          .filter((city) => city && typeof city.id === "string" && typeof city.name === "string" && typeof city.zone === "string")
          .map((city) => ({
            id: city.id,
            name: city.name,
            zone: city.zone,
            x: Number.isFinite(Number(city.x)) ? Number(city.x) : 50,
            y: Number.isFinite(Number(city.y)) ? Number(city.y) : 50,
            lng: Number.isFinite(Number(city.lng)) ? Number(city.lng) : undefined,
            lat: Number.isFinite(Number(city.lat)) ? Number(city.lat) : undefined
          }));
      }
    } catch {
      localStorage.removeItem(CONFIG.customCitiesKey);
    }
    return [];
  },

  saveCustomCities() {
    safeSetItem(CONFIG.customCitiesKey, JSON.stringify(this.customCities));
  },

  loadSelection() {
    try {
      const saved = JSON.parse(localStorage.getItem(CONFIG.storageKey));
      if (Array.isArray(saved)) {
        // Storage is user-writable; keep the first occurrence of each id only.
        return [...new Set(saved)].filter((id) => this.findCity(id)).slice(0, this.cityLimit);
      }
    } catch {
      localStorage.removeItem(CONFIG.storageKey);
    }
    return [...CONFIG.defaultSelection].slice(0, this.cityLimit);
  },

  saveSelection() {
    safeSetItem(CONFIG.storageKey, JSON.stringify(this.selectedIds));
  },

  getActiveScrubFraction() {
    if (!this.activeScrubId || !this.scrubs || this.scrubs.length === 0) return null;
    const active = this.scrubs.find(s => s.id === this.activeScrubId);
    return active ? active.fraction : null;
  },

  allCities() {
    if (!this._localCity) {
      const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const matchingCity = cityCatalog.find((c) => c.zone === localZone);
      let lng = 114.15; // default fallback Hong Kong longitude
      let lat = 22.3;   // default fallback Hong Kong latitude

      if (matchingCity) {
        lng = matchingCity.lng;
        lat = matchingCity.lat;
      } else {
        try {
          const now = new Date();
          const offsetMins = TimeUtils.getOffsetMinutes(now, localZone);
          lng = offsetMins * 0.25;
          lat = 20.0;
        } catch (e) {
          lng = 114.15;
          lat = 22.3;
        }
      }

      this._localCity = {
        id: "local",
        zone: localZone,
        lng: lng,
        lat: lat,
        matchingId: matchingCity ? matchingCity.id : null
      };
    }
    // Catalog is static; only rebuild when local/custom content changes.
    // customCities is reassigned (never mutated) on every edit, so a
    // reference check is a reliable invalidation signal.
    if (!this._cachedCityList || this._cachedCustomCities !== this.customCities) {
      this._cachedCityList = [this._localCity, ...cityCatalog, ...this.customCities];
      this._cachedCityIndex = new Map(this._cachedCityList.map((c) => [c.id, c]));
      this._cachedCustomCities = this.customCities;
    }
    return this._cachedCityList;
  },

  findCity(id) {
    if (!this._cachedCityIndex || this._cachedCustomCities !== this.customCities) {
      this.allCities();
    }
    return this._cachedCityIndex.get(id);
  },

  loadNowLineMode() {
    try {
      const saved = localStorage.getItem(CONFIG.nowLineModeKey);
      if (saved === "local" || saved === "firstCity") return saved;
    } catch { }
    return "local";
  },

  saveNowLineMode(mode) {
    this.nowLineMode = mode;
    safeSetItem(CONFIG.nowLineModeKey, mode);
  },

  makeBaseHours() {
    const now = new Date();
    const firstCity = this.selectedIds.length > 0 ? this.findCity(this.selectedIds[0]) : null;

    if (firstCity && firstCity.zone) {
      const zone = TimeUtils.resolveZone(firstCity.zone);
      // Get today's date string in first city's timezone (YYYY-MM-DD via en-CA locale)
      const formatter = TimeUtils.getFormatter("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      });
      const dateStr = formatter.format(now);
      const [year, month, day] = dateStr.split("-").map(Number);
      // Use UTC offset at noon to avoid DST edge-cases within a single day
      const noonUTC = new Date(Date.UTC(year, month - 1, day, 12));
      const offsetMins = TimeUtils.getOffsetMinutes(noonUTC, zone);
      const midnightUTC = Date.UTC(year, month - 1, day, 0) - offsetMins * 60000;
      this.baseHours = Array.from({ length: 24 }, (_, i) => new Date(midnightUTC + i * 3600000));
    } else {
      // Fallback: browser local midnight
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      this.baseHours = Array.from({ length: 24 }, (_, i) => new Date(start.getTime() + i * 3600000));
    }
  },

  toggleCity(id) {
    if (this.selectedIds.includes(id)) {
      this.selectedIds = this.selectedIds.filter((item) => item !== id);
      if (id.startsWith("custom-") || this.customCities.some((city) => city.id === id)) {
        this.customCities = this.customCities.filter((city) => city.id !== id);
        this.saveCustomCities();
      }
    } else {
      if (this.selectedIds.length >= this.cityLimit) {
        return false;
      }
      this.selectedIds = [...this.selectedIds, id];
    }
    this.saveSelection();
    return true;
  }
};

if (typeof globalThis !== "undefined") {
  globalThis.State = State;
}
