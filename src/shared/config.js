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
    { name: "period1", start: 8, end: 17 },
    { name: "period2", start: 18, end: 23 },
    { name: "period3", start: 0, end: 7 }
  ],
  periodPresets: {
    2: [
      { name: "day", start: 8, end: 19 },
      { name: "night", start: 20, end: 7 }
    ],
    3: [
      { name: "period1", start: 8, end: 17 },
      { name: "period2", start: 18, end: 23 },
      { name: "period3", start: 0, end: 7 }
    ],
    4: [
      { name: "morning", start: 6, end: 8 },
      { name: "day", start: 9, end: 17 },
      { name: "evening", start: 18, end: 21 },
      { name: "night", start: 22, end: 5 }
    ]
  },
  periodColorsByCount: {
    2: {
      light: [
        { color: "#FFE7A3", fontColor: "#000000" },
        { color: "#856C60", fontColor: "#FFFFFF" }
      ],
      dark: [
        { color: "#EEB422", fontColor: "#000000" },
        { color: "#38302E", fontColor: "#D9C8C2" }
      ]
    },
    3: {
      light: [
        { color: "#FFE7A3", fontColor: "#000000" },
        { color: "#F9BE6C", fontColor: "#000000" },
        { color: "#856C60", fontColor: "#FFFFFF" }
      ],
      dark: [
        { color: "#EEB422", fontColor: "#000000" },
        { color: "#B8860B", fontColor: "#000000" },
        { color: "#38302E", fontColor: "#D9C8C2" }
      ]
    },
    4: {
      light: [
        { color: "#F9BE6C", fontColor: "#000000" },
        { color: "#FFE7A3", fontColor: "#000000" },
        { color: "#F9BE6C", fontColor: "#000000" },
        { color: "#856C60", fontColor: "#FFFFFF" }
      ],
      dark: [
        { color: "#B8860B", fontColor: "#000000" },
        { color: "#EEB422", fontColor: "#000000" },
        { color: "#B8860B", fontColor: "#000000" },
        { color: "#38302E", fontColor: "#D9C8C2" }
      ]
    }
  },
  /**
   * Fixed timeline cell palette per theme. Users customize ranges only;
   * light matches the pre-hardcode defaults.
   */
  periodColors: {
    light: [
      { color: "#FFE7A3", fontColor: "#000000" },
      { color: "#F9BE6C", fontColor: "#000000" },
      { color: "#856C60", fontColor: "#FFFFFF" }
    ],
    dark: [
      { color: "#EEB422", fontColor: "#000000" },
      { color: "#B8860B", fontColor: "#000000" },
      { color: "#38302E", fontColor: "#D9C8C2" }
    ]
  }
};
