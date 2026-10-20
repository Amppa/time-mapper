/**
 * TimeMapper - Application State Management Module
 */

import { CONFIG } from "./config.js";
import { cityCatalog } from "./cities.js";
import { Storage, SYNC_TO_LOCAL } from "./storage.js";
import { TimeUtils, TimelineUtils, I18nUtils } from "./utils.js";

/** localStorage can throw (quota exceeded, blocked storage); a failed write must not break the UI. */
function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch { }
}

/** Mirror to the local snapshot (synchronously) and push to chrome.storage.sync. */
function persist(syncKey, value) {
  Storage.persist(SYNC_TO_LOCAL[syncKey], syncKey, value);
}

/** Tolerate JSON strings (localStorage mirrors) and real values (sync store). */
function asValue(raw) {
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw;
}

/** Map placement percentages: non-numeric falls back to 50, values clamp to 0-100. */
function clampMapPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.min(100, Math.max(0, n));
}

/**
 * Whitelist normalization for custom cities (schema: id, name, zone, x, y, lng, lat).
 * Returns null for entries that cannot be repaired.
 */
export function sanitizeCustomCity(city) {
  if (!city || typeof city !== "object") return null;
  if (typeof city.id !== "string" || !city.id) return null;
  if (typeof city.name !== "string" || !city.name.trim()) return null;
  if (typeof city.zone !== "string" || !city.zone) return null;
  const x = clampMapPercent(city.x);
  const y = clampMapPercent(city.y);
  const lng = Number(city.lng);
  const lat = Number(city.lat);
  return {
    id: city.id,
    name: city.name.trim().slice(0, 50),
    zone: city.zone,
    x,
    y,
    lng: Number.isFinite(lng) ? Number(lng.toFixed(4)) : undefined,
    lat: Number.isFinite(lat) ? Number(lat.toFixed(4)) : undefined
  };
}

export const State = {
  selectedIds: [],
  customCities: [],
  mapSettings: {},
  timePeriods: [],
  _currentLang: "zh",
  /** "auto" | "zh" | "en" | "es"; device-local, never synced (DECIDED-1). */
  _languagePreference: "auto",
  /** Last explicit language received from the sync store. */
  _syncedLanguage: null,
  /** Assigning here is the one way the language changes; it pushes to I18nUtils so no consumer can go stale. */
  get currentLang() {
    return this._currentLang;
  },
  set currentLang(lang) {
    this._currentLang = lang;
    I18nUtils.setLang(lang);
  },
  baseHours: [],
  nowLineMode: "local",   // 'local' | 'firstCity'
  scrubs: [],             // array of { id, fraction } objects
  activeScrubId: null,    // id of the active scrub line
  draggingId: null,
  cityLimit: 10,
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

  async init() {
    this._localCity = null;
    this._cachedCityList = null;
    this._cachedCityIndex = null;
    this._cachedCustomCities = null;
    const loaded = await Storage.loadSyncData();
    const v = loaded.values;
    this._languagePreference = loaded.languagePreference;
    this._syncedLanguage = v[CONFIG.syncKeys.language];
    this.currentLang = this.resolveLanguage();
    this.timePeriods = this.resolveTimePeriods(asValue(v[CONFIG.syncKeys.timePeriods]));
    this.mapSettings = this.loadMapSettings();
    this.customCities = this.resolveCustomCities(asValue(v[CONFIG.syncKeys.customCities]));
    this.cityLimit = CONFIG.maxCities;
    this.selectedIds = this.resolveSelection(asValue(v[CONFIG.syncKeys.cities]));
    this.nowLineMode = this.resolveNowLineMode(asValue(v[CONFIG.syncKeys.nowLineMode]));
    this.scrubs = [];
    this.activeScrubId = null;
    this.draggingId = null;
    this.makeBaseHours();
  },

  /**
   * Preference wins when explicit; "auto" resolves from this device's
   * navigator. The synced `language` value is a plain explicit fallback.
   */
  resolveLanguage() {
    const pref = this._languagePreference;
    if (pref && pref !== "auto" && CONFIG.supportedLanguages.includes(pref)) return pref;
    if (pref === "auto" || pref) return this.detectNavigatorLanguage();
    // Fresh device with no local preference: follow the synced explicit choice.
    const synced = asValue(this._syncedLanguage);
    if (synced && CONFIG.supportedLanguages.includes(synced)) return synced;
    return this.detectNavigatorLanguage();
  },

  detectNavigatorLanguage() {
    const navLang = (navigator.language || navigator.userLanguage || "zh").toLowerCase();
    if (navLang.startsWith("en")) return "en";
    if (navLang.startsWith("es")) return "es";
    return "zh";
  },

  /** Stored preference for the options-page dropdown: "auto" when unset. */
  getLanguagePreference() {
    return this._languagePreference || "auto";
  },

  saveLanguage(lang) {
    if (lang !== "auto" && !CONFIG.supportedLanguages.includes(lang)) return;
    this._languagePreference = lang;
    safeSetItem(CONFIG.languagePreferenceKey, lang);
    if (lang === "auto") {
      // "auto" is device-local; the synced value stays as the last explicit choice.
      this.currentLang = this.detectNavigatorLanguage();
      return;
    }
    this.currentLang = lang;
    // The mirror stays a raw string (historical format); sync takes the plain value.
    safeSetItem(CONFIG.languageKey, lang);
    Storage.persist(null, CONFIG.syncKeys.language, lang);
  },

  resolveTimePeriods(saved) {
    const fallback = () => JSON.parse(JSON.stringify(CONFIG.defaultTimePeriods));
    // Colors were user-customizable before hardcode; keep ranges only.
    if (Array.isArray(saved) && saved.length >= 2 && saved.length <= 4 &&
      saved.every((p) => p && Number.isFinite(Number(p.start)) && Number.isFinite(Number(p.end)))) {
      return saved.map((p, i) => ({
        name: p.name || `period${i + 1}`,
        start: Number(p.start),
        end: Number(p.end)
      }));
    }
    return fallback();
  },

  saveTimePeriods() {
    persist(CONFIG.syncKeys.timePeriods, this.timePeriods);
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

  resolveCustomCities(saved) {
    if (Array.isArray(saved)) {
      return saved.map(sanitizeCustomCity).filter((c) => c !== null);
    }
    return [];
  },

  saveCustomCities() {
    persist(CONFIG.syncKeys.customCities, this.customCities);
  },

  resolveSelection(saved) {
    const limit = this.cityLimit || CONFIG.maxCities;
    if (Array.isArray(saved)) {
      // Storage is user-writable; keep the first occurrence of each id only.
      return [...new Set(saved)].filter((id) => this.findCity(id)).slice(0, limit);
    }
    return [...CONFIG.defaultSelection].slice(0, limit);
  },

  saveSelection() {
    persist(CONFIG.syncKeys.cities, this.selectedIds);
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

  resolveNowLineMode(saved) {
    if (saved === "local" || saved === "firstCity") return saved;
    return "local";
  },

  saveNowLineMode(mode) {
    this.nowLineMode = mode;
    persist(CONFIG.syncKeys.nowLineMode, mode);
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
