/**
 * World Time Aligner - Configuration Module
 */
const CONFIG = {
  defaultSelection: ["local", "tokyo", "new-york", "los-angeles"],
  maxCities: 6,
  storageKey: "worldTimeAlignerCities",
  mapSettingsKey: "worldTimeAlignerMapSettings_v4",
  customCitiesKey: "worldTimeAlignerCustomCities",
  timePeriodsKey: "worldTimeAlignerTimePeriods",
  languageKey: "worldTimeAlignerLanguage",
  nowLineModeKey: "worldTimeAlignerNowLineMode",
  defaultMapSettings: {
    lngOffset: 1.0,
    latOffset: 20.7,
    widthScale: 1.0,
    heightScale: 1.39,
    mapYOffset: 30,
    showNightArea: true,
    showHourLines: true,
    showCityTimes: true,
    mapCollapsed: false
  },
  defaultTimePeriods: [
    { name: "period1", start: 8, end: 17, color: "rgba(255, 231, 163, 1)", fontColor: "#000000ff" },
    { name: "period2", start: 18, end: 23, color: "rgba(249, 190, 108, 1)", fontColor: "#000000ff" },
    { name: "period3", start: 0, end: 7, color: "rgba(133, 108, 96, 1)", fontColor: "#ffffff" }
  ]
};
