/**
 * World Time Aligner - Application State Management Module
 */

const State = {
  selectedIds: [],
  customCities: [],
  mapSettings: {},
  timePeriods: [],
  currentLang: "zh",
  baseHours: [],
  selectedOffsetHours: null,
  nowLineMode: "local",   // 'local' | 'firstCity'
  scrubs: [],             // array of { id, fraction } objects
  activeScrubId: null,    // id of the active scrub line
  draggingId: null,
  cityLimit: 6,
  lastActiveCard: null,
  _localCity: null,

  init() {
    this._localCity = null;
    this.currentLang = this.loadLanguage();
    this.timePeriods = this.loadTimePeriods();
    this.mapSettings = this.loadMapSettings();
    this.customCities = this.loadCustomCities();
    this.cityLimit = this.loadCityLimit();
    this.selectedIds = this.loadSelection();
    this.nowLineMode = this.loadNowLineMode();
    this.selectedOffsetHours = 0;
    this.scrubs = [];
    this.activeScrubId = null;
    this.draggingId = null;
    this.lastActiveCard = null;
    this.makeBaseHours();
  },

  loadLanguage() {
    try {
      const saved = localStorage.getItem(CONFIG.languageKey);
      if (saved === "zh" || saved === "en") return saved;
    } catch { }
    const navLang = navigator.language || navigator.userLanguage || "zh";
    return navLang.toLowerCase().startsWith("en") ? "en" : "zh";
  },

  saveLanguage(lang) {
    this.currentLang = lang;
    try {
      localStorage.setItem(CONFIG.languageKey, lang);
    } catch { }
  },

  loadTimePeriods() {
    try {
      const saved = JSON.parse(localStorage.getItem(CONFIG.timePeriodsKey));
      if (Array.isArray(saved) && saved.length === 3) {
        return saved;
      }
    } catch { }
    return JSON.parse(JSON.stringify(CONFIG.defaultTimePeriods));
  },

  saveTimePeriods() {
    try {
      localStorage.setItem(CONFIG.timePeriodsKey, JSON.stringify(this.timePeriods));
    } catch { }
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
          showCityTimes: saved.showCityTimes !== undefined ? !!saved.showCityTimes : CONFIG.defaultMapSettings.showCityTimes,
          mapCollapsed: saved.mapCollapsed !== undefined ? !!saved.mapCollapsed : CONFIG.defaultMapSettings.mapCollapsed
        };
      }
    } catch {
      localStorage.removeItem(CONFIG.mapSettingsKey);
    }
    return { ...CONFIG.defaultMapSettings };
  },

  saveMapSettings() {
    localStorage.setItem(CONFIG.mapSettingsKey, JSON.stringify(this.mapSettings));
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
    localStorage.setItem(CONFIG.customCitiesKey, JSON.stringify(this.customCities));
    if (typeof Renderer !== "undefined") {
      Renderer._cachedZoneDetails = null;
    }
  },

  loadSelection() {
    try {
      const saved = JSON.parse(localStorage.getItem(CONFIG.storageKey));
      if (Array.isArray(saved)) {
        return saved.filter((id) => this.allCities().some((city) => city.id === id)).slice(0, this.cityLimit);
      }
    } catch {
      localStorage.removeItem(CONFIG.storageKey);
    }
    return [...CONFIG.defaultSelection].slice(0, this.cityLimit);
  },

  saveSelection() {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(this.selectedIds));
    if (typeof Renderer !== "undefined") {
      Renderer._cachedZoneDetails = null;
    }
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
    return [this._localCity, ...cityCatalog, ...this.customCities];
  },

  findCity(id) {
    return this.allCities().find((city) => city.id === id);
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
    try {
      localStorage.setItem(CONFIG.nowLineModeKey, mode);
    } catch { }
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
      if (id.startsWith("custom-")) {
        this.customCities = this.customCities.filter((city) => city.id !== id);
        this.saveCustomCities();
      }
    } else {
      if (this.selectedIds.length >= this.cityLimit) {
        this.selectedIds = [...this.selectedIds.slice(-(this.cityLimit - 1)), id];
      } else {
        this.selectedIds = [...this.selectedIds, id];
      }
    }
    this.saveSelection();
    Renderer.render();
  },

  loadCityLimit() {
    try {
      const saved = localStorage.getItem("worldTimeAlignerCityLimit");
      if (saved !== null) {
        const val = parseInt(saved, 10);
        if (val > 0) return val;
      }
    } catch { }
    return CONFIG.maxCities;
  },

  saveCityLimit(val) {
    const limit = parseInt(val, 10);
    if (isNaN(limit) || limit <= 0) return;
    this.cityLimit = limit;
    try {
      localStorage.setItem("worldTimeAlignerCityLimit", String(limit));
    } catch { }

    if (this.selectedIds.length > this.cityLimit) {
      this.selectedIds = this.selectedIds.slice(0, this.cityLimit);
      this.saveSelection();
      Renderer.render();
    }
  }
};
