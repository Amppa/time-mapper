/**
 * TimeMapper - Map Projection Constants
 *
 * Linear conversion from geographic coordinates to base map percentages (0-100):
 *   x = lngX * longitude + lngXOffset
 *   y = latY * latitude  + latYOffset
 */
const PROJECTION = {
  lngX: 0.2816,
  lngXOffset: 46.2357,
  latY: -0.5257,
  latYOffset: 63.3239
};

/**
 * TimeMapper - Configuration Module
 */
const CONFIG = {
  defaultSelection: ["local", "tokyo", "new-york", "los-angeles"],
  maxCities: 6,
  maxScrubs: 4,
  storageKey: "worldTimeAlignerCities",
  mapSettingsKey: "worldTimeAlignerMapSettings_v4",
  customCitiesKey: "worldTimeAlignerCustomCities",
  timePeriodsKey: "worldTimeAlignerTimePeriods",
  languageKey: "worldTimeAlignerLanguage",
  /** Internal UI language codes offered in the options page. */
  supportedLanguages: ["zh", "en", "es"],
  /** Maps an internal UI language code to the BCP-47 locale used for date/time formatting. */
  localeMap: { zh: "zh-TW", en: "en-US", es: "es-ES" },
  nowLineModeKey: "worldTimeAlignerNowLineMode",
  cityLimitKey: "worldTimeAlignerCityLimit",
  defaultMapSettings: {
    lngOffset: 1.0,
    latOffset: 20.7,
    widthScale: 1.0,
    heightScale: 1.39,
    mapYOffset: 30,
    showNightArea: true,
    showHourLines: true,
    showCityTimes: true
  },
  defaultTimePeriods: [
    { name: "period1", start: 8, end: 17, color: "rgba(255, 231, 163, 1)", fontColor: "#000000ff" },
    { name: "period2", start: 18, end: 23, color: "rgba(249, 190, 108, 1)", fontColor: "#000000ff" },
    { name: "period3", start: 0, end: 7, color: "rgba(133, 108, 96, 1)", fontColor: "#ffffff" }
  ]
};
