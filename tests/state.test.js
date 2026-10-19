/**
 * TimeMapper - Tests: application state
 *
 * State owns persistence and the derived selection/scrub values, so these
 * tests pin down the defaults, the 10-city cap, scrub bookkeeping and the
 * recovery paths for corrupted localStorage entries.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/shared/config.js";
import { State } from "../src/shared/state.js";
import { TimeUtils, TimelineUtils, I18nUtils } from "../src/shared/utils.js";
import { installMockStorage, uninstallMockStorage } from "./helpers/mock-storage.js";

const EPSILON = 1e-9;

/** Floating point safe equality. */
function assertClose(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < EPSILON, `${message}: expected ${expected}, got ${actual}`);
}

/** Build a storage stub pre-loaded with raw (possibly corrupt) values. */
function seedStorage(entries) {
  const storage = installMockStorage();
  for (const [key, value] of Object.entries(entries)) {
    storage.setItem(key, value);
  }
  return storage;
}

let storage;

beforeEach(() => {
  storage = seedStorage({});
});

afterEach(() => {
  uninstallMockStorage(storage);
});

/* ------------------------------------------------------------------ *
 * Initialization
 * ------------------------------------------------------------------ */

describe("State.init", () => {
  it("applies the configured defaults", () => {
    State.init();
    assert.equal(State.cityLimit, CONFIG.maxCities);
    assert.equal(State.cityLimit, 10);
    assert.deepEqual(State.selectedIds, CONFIG.defaultSelection);
    assert.deepEqual(State.timePeriods, CONFIG.defaultTimePeriods);
    assert.deepEqual(State.customCities, []);
    assert.equal(State.nowLineMode, "local");
    assert.equal(State.activeScrubId, null);
    assert.equal(State.draggingId, null);
    assert.equal(State.lastActiveCard, null);
    assert.equal(State.baseHours.length, 24);
  });

  it("fills map settings from the defaults", () => {
    State.init();
    assert.deepEqual(State.mapSettings, CONFIG.defaultMapSettings);
  });

  it("does not mutate the shared default period objects", () => {
    State.timePeriods[0].name = "mutated";
    State.init();
    assert.equal(CONFIG.defaultTimePeriods[0].name, "period1");
  });

  it("is repeatable and restores the persisted selection", () => {
    State.init();
    State.toggleCity("paris");
    State.scrubs = [{ id: "scrub_1", fraction: 0.25 }];
    State.activeScrubId = "scrub_1";
    State.init();
    assert.deepEqual(State.selectedIds, [...CONFIG.defaultSelection, "paris"]);
    assert.deepEqual(State.scrubs, []);
    assert.equal(State.activeScrubId, null);
  });

  it("builds 24 hourly base hours one hour apart", () => {
    State.init();
    for (let i = 1; i < State.baseHours.length; i++) {
      const gap = State.baseHours[i].getTime() - State.baseHours[i - 1].getTime();
      assert.equal(gap, 3600000, `gap at index ${i}`);
    }
  });

  it("anchors base hours to local midnight of the first city's zone", () => {
    State.init();
    const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    assert.equal(TimeUtils.hourInZone(State.baseHours[0], localZone), 0);
    assert.equal(State.baseHours[0].getMinutes(), 0);
  });

  it("anchors base hours to the first selected city's midnight", () => {
    State.selectedIds = ["new-york"];
    State.cityLimit = CONFIG.maxCities;
    State.makeBaseHours();
    assert.equal(State.baseHours.length, 24);
    assert.equal(TimeUtils.hourInZone(State.baseHours[0], "America/New_York"), 0);
    assert.equal(State.baseHours[23].getTime() - State.baseHours[0].getTime(), 23 * 3600000);
  });
});

/* ------------------------------------------------------------------ *
 * Selection & the 10-city cap
 * ------------------------------------------------------------------ */

describe("State.toggleCity", () => {
  beforeEach(() => {
    State.init();
  });

  it("adds a city and persists the selection", () => {
    assert.equal(State.toggleCity("paris"), true);
    assert.ok(State.selectedIds.includes("paris"));
    assert.deepEqual(JSON.parse(storage.getItem(CONFIG.storageKey)), State.selectedIds);
  });

  it("removes a city when toggled off", () => {
    State.toggleCity("paris");
    assert.equal(State.toggleCity("paris"), true);
    assert.equal(State.selectedIds.includes("paris"), false);
  });

  it("never produces a duplicate when toggling repeatedly", () => {
    for (let i = 0; i < 5; i++) {
      State.toggleCity("oslo");
      State.toggleCity("oslo");
    }
    assert.equal(State.selectedIds.filter((id) => id === "oslo").length, 0);
    State.toggleCity("oslo");
    assert.equal(State.selectedIds.filter((id) => id === "oslo").length, 1);
  });

  it("keeps existing cities untouched", () => {
    const before = [...State.selectedIds];
    State.toggleCity("paris");
    assert.deepEqual(State.selectedIds.slice(0, before.length), before);
  });

  it("removes a custom city from the catalog when toggled off", () => {
    State.customCities = [{ id: "custom-abc", name: "Mine", zone: "UTC", x: 50, y: 50 }];
    State.toggleCity("custom-abc");
    assert.ok(State.selectedIds.includes("custom-abc"));
    State.toggleCity("custom-abc");
    assert.equal(State.selectedIds.includes("custom-abc"), false);
    assert.deepEqual(State.customCities, []);
  });
});

describe("city limit", () => {
  beforeEach(() => {
    State.init();
  });

  function fillToLimit() {
    for (const id of ["paris", "berlin", "london", "sydney", "toronto", "moscow"]) {
      State.toggleCity(id);
    }
    assert.equal(State.selectedIds.length, CONFIG.maxCities);
  }

  it("refuses an 11th city", () => {
    fillToLimit();
    assert.equal(State.toggleCity("seoul"), false);
    assert.equal(State.selectedIds.length, CONFIG.maxCities);
    assert.equal(State.selectedIds.includes("seoul"), false);
  });

  it("is non-FIFO: a rejected add evicts nothing", () => {
    fillToLimit();
    const before = [...State.selectedIds];
    State.toggleCity("seoul");
    assert.deepEqual(State.selectedIds, before);
    assert.ok(State.selectedIds.includes(CONFIG.defaultSelection[0]));
  });

  it("frees a slot when a city is removed", () => {
    fillToLimit();
    State.toggleCity(CONFIG.defaultSelection[0]);
    assert.equal(State.selectedIds.length, CONFIG.maxCities - 1);
    assert.equal(State.toggleCity("seoul"), true);
    assert.equal(State.selectedIds.length, CONFIG.maxCities);
    assert.ok(State.selectedIds.includes("seoul"));
  });
});

describe("State.loadSelection", () => {
  it("falls back to the default selection when nothing is stored", () => {
    assert.deepEqual(State.loadSelection(), CONFIG.defaultSelection);
  });

  it("drops ids that are not in the catalog", () => {
    storage.setItem(CONFIG.storageKey, JSON.stringify(["tokyo", "not-a-city", "paris"]));
    assert.deepEqual(State.loadSelection(), ["tokyo", "paris"]);
  });

  it("collapses duplicated ids, keeping the first occurrence", () => {
    storage.setItem(CONFIG.storageKey, JSON.stringify(["tokyo", "paris", "tokyo", "paris", "oslo"]));
    assert.deepEqual(State.loadSelection(), ["tokyo", "paris", "oslo"]);
  });

  it("counts a city once towards the limit", () => {
    storage.setItem(CONFIG.storageKey, JSON.stringify([
      "tokyo", "tokyo", "tokyo", "paris", "paris", "berlin", "london",
      "sydney", "toronto", "moscow", "madrid", "rome", "oslo"
    ]));
    const selection = State.loadSelection();
    assert.equal(new Set(selection).size, selection.length);
    // 13 stored entries collapse to 10 distinct cities, which exactly fills the cap.
    assert.equal(selection.length, CONFIG.maxCities);
    assert.deepEqual(selection, [
      "tokyo", "paris", "berlin", "london", "sydney",
      "toronto", "moscow", "madrid", "rome", "oslo"
    ]);
  });

  it("never yields a duplicate through init", () => {
    storage.setItem(CONFIG.storageKey, JSON.stringify(["tokyo", "tokyo", "local", "local"]));
    State.init();
    assert.deepEqual(State.selectedIds, ["tokyo", "local"]);
    assert.equal(new Set(State.selectedIds).size, State.selectedIds.length);
  });

  it("ignores a stored value that is not an array", () => {
    storage.setItem(CONFIG.storageKey, JSON.stringify({ tokyo: true }));
    assert.deepEqual(State.loadSelection(), CONFIG.defaultSelection);
  });

  it("truncates an oversized stored selection to the city limit", () => {
    storage.setItem(CONFIG.storageKey, JSON.stringify([
      "tokyo", "paris", "berlin", "london", "sydney", "toronto", "moscow",
      "madrid", "rome", "vienna", "oslo", "dublin"
    ]));
    assert.equal(State.loadSelection().length, CONFIG.maxCities);
  });

  it("removes the corrupt entry so init() does not retry it", () => {
    storage.setItem(CONFIG.storageKey, "{not json");
    State.init();
    assert.equal(storage.getItem(CONFIG.storageKey), null);
  });
});

/* ------------------------------------------------------------------ *
 * Time periods
 * ------------------------------------------------------------------ */

describe("State time periods", () => {
  it("returns the defaults when nothing is stored", () => {
    assert.deepEqual(State.loadTimePeriods(), CONFIG.defaultTimePeriods);
  });

  it("normalises stored periods and fills in missing names", () => {
    storage.setItem(CONFIG.timePeriodsKey, JSON.stringify([
      { start: "6", end: "11" },
      { name: "night", start: 20, end: 5 }
    ]));
    assert.deepEqual(State.loadTimePeriods(), [
      { name: "period1", start: 6, end: 11 },
      { name: "night", start: 20, end: 5 }
    ]);
  });

  it("rejects a stored list with too few entries", () => {
    storage.setItem(CONFIG.timePeriodsKey, JSON.stringify([{ name: "only", start: 0, end: 23 }]));
    assert.deepEqual(State.loadTimePeriods(), CONFIG.defaultTimePeriods);
  });

  it("rejects a stored list with too many entries", () => {
    storage.setItem(CONFIG.timePeriodsKey, JSON.stringify([
      { start: 0, end: 3 }, { start: 4, end: 7 }, { start: 8, end: 11 },
      { start: 12, end: 15 }, { start: 16, end: 23 }
    ]));
    assert.deepEqual(State.loadTimePeriods(), CONFIG.defaultTimePeriods);
  });

  it("rejects entries with non-numeric boundaries", () => {
    storage.setItem(CONFIG.timePeriodsKey, JSON.stringify([
      { start: 0, end: "morning" },
      { start: 12, end: 23 }
    ]));
    assert.deepEqual(State.loadTimePeriods(), CONFIG.defaultTimePeriods);
  });

  it("rejects a stored value that is not an array", () => {
    storage.setItem(CONFIG.timePeriodsKey, JSON.stringify({ a: 1 }));
    assert.deepEqual(State.loadTimePeriods(), CONFIG.defaultTimePeriods);
  });

  it("round-trips through saveTimePeriods", () => {
    const periods = [
      { name: "day", start: 9, end: 18 },
      { name: "night", start: 22, end: 6 }
    ];
    State.timePeriods = periods;
    State.saveTimePeriods();
    assert.deepEqual(State.loadTimePeriods(), periods);
  });
});

/* ------------------------------------------------------------------ *
 * Map settings
 * ------------------------------------------------------------------ */

describe("State map settings", () => {
  it("returns the defaults when nothing is stored", () => {
    assert.deepEqual(State.loadMapSettings(), CONFIG.defaultMapSettings);
  });

  it("merges a partial stored object over the defaults", () => {
    storage.setItem(CONFIG.mapSettingsKey, JSON.stringify({ lngOffset: 4, showHourLines: false }));
    const settings = State.loadMapSettings();
    assert.equal(settings.lngOffset, 4);
    assert.equal(settings.showHourLines, false);
    assert.equal(settings.heightScale, CONFIG.defaultMapSettings.heightScale);
    assert.equal(settings.showNightArea, CONFIG.defaultMapSettings.showNightArea);
  });

  it("coerces string numbers and booleans", () => {
    storage.setItem(CONFIG.mapSettingsKey, JSON.stringify({
      lngOffset: "2.5", widthScale: "1.2", showCityTimes: 0
    }));
    const settings = State.loadMapSettings();
    assert.equal(settings.lngOffset, 2.5);
    assert.equal(settings.widthScale, 1.2);
    assert.equal(settings.showCityTimes, false);
  });

  it("replaces non-numeric offsets with the defaults", () => {
    storage.setItem(CONFIG.mapSettingsKey, JSON.stringify({ lngOffset: "left", latOffset: {}, widthScale: "wide" }));
    const settings = State.loadMapSettings();
    assert.equal(settings.lngOffset, CONFIG.defaultMapSettings.lngOffset);
    assert.equal(settings.latOffset, CONFIG.defaultMapSettings.latOffset);
    assert.equal(settings.widthScale, CONFIG.defaultMapSettings.widthScale);
  });

  it("ignores a stored value that is not an object", () => {
    storage.setItem(CONFIG.mapSettingsKey, JSON.stringify([1, 2, 3]));
    assert.deepEqual(State.loadMapSettings(), CONFIG.defaultMapSettings);
  });

  it("round-trips through saveMapSettings", () => {
    State.mapSettings = { ...CONFIG.defaultMapSettings, widthScale: 1.4 };
    State.saveMapSettings();
    assert.equal(State.loadMapSettings().widthScale, 1.4);
  });
});

/* ------------------------------------------------------------------ *
 * Custom cities
 * ------------------------------------------------------------------ */

describe("State custom cities", () => {
  it("returns an empty list when nothing is stored", () => {
    assert.deepEqual(State.loadCustomCities(), []);
  });

  it("keeps well-formed entries and fills missing coordinates", () => {
    storage.setItem(CONFIG.customCitiesKey, JSON.stringify([
      { id: "custom-a", name: "A", zone: "UTC", x: 12, y: 34, lng: 1, lat: 2 },
      { id: "custom-b", name: "B", zone: "Europe/Paris" }
    ]));
    assert.deepEqual(State.loadCustomCities(), [
      { id: "custom-a", name: "A", zone: "UTC", x: 12, y: 34, lng: 1, lat: 2 },
      { id: "custom-b", name: "B", zone: "Europe/Paris", x: 50, y: 50, lng: undefined, lat: undefined }
    ]);
  });

  it("drops entries missing id, name or zone", () => {
    storage.setItem(CONFIG.customCitiesKey, JSON.stringify([
      { id: "custom-a", name: "A", zone: "UTC" },
      { id: "custom-b", zone: "UTC" },
      { name: "C", zone: "UTC" },
      null
    ]));
    assert.deepEqual(State.loadCustomCities().map((c) => c.id), ["custom-a"]);
  });

  it("ignores a stored value that is not an array", () => {
    storage.setItem(CONFIG.customCitiesKey, JSON.stringify({ a: 1 }));
    assert.deepEqual(State.loadCustomCities(), []);
  });

  it("round-trips through saveCustomCities", () => {
    State.customCities = [{ id: "custom-a", name: "A", zone: "UTC", x: 10, y: 20 }];
    State.saveCustomCities();
    assert.deepEqual(State.loadCustomCities(), [
      { id: "custom-a", name: "A", zone: "UTC", x: 10, y: 20, lng: undefined, lat: undefined }
    ]);
  });
});

/* ------------------------------------------------------------------ *
 * Language & now-line mode
 * ------------------------------------------------------------------ */

describe("State language", () => {
  it("restores a supported language", () => {
    storage.setItem(CONFIG.languageKey, "es");
    assert.equal(State.loadLanguage(), "es");
  });

  it("ignores an unsupported stored language", () => {
    storage.setItem(CONFIG.languageKey, "kr");
    assert.ok(CONFIG.supportedLanguages.includes(State.loadLanguage()));
  });

  it("defaults the preference to auto", () => {
    assert.equal(State.getLanguagePreference(), "auto");
  });

  it("round-trips the preference", () => {
    assert.equal(State.getLanguagePreference(), "auto");
    storage.setItem(CONFIG.languageKey, "auto");
    assert.equal(State.getLanguagePreference(), "auto");

    State.saveLanguage("en");
    assert.equal(State.currentLang, "en");
    assert.equal(State.getLanguagePreference(), "en");
    assert.equal(storage.getItem(CONFIG.languageKey), "en");

    State.saveLanguage("auto");
    assert.equal(storage.getItem(CONFIG.languageKey), "auto");
  });

  it("ignores an unsupported saveLanguage call", () => {
    State.currentLang = "en";
    State.saveLanguage("kr");
    assert.equal(State.currentLang, "en");
    assert.equal(storage.getItem(CONFIG.languageKey), null);
  });

  it("pushes every language change to I18nUtils", () => {
    State.currentLang = "es";
    assert.equal(I18nUtils.getLang(), "es");
    State.saveLanguage("en");
    assert.equal(I18nUtils.getLang(), "en");
    State.currentLang = "zh";
    assert.equal(I18nUtils.getLang(), "zh");
  });
});

describe("State now-line mode", () => {
  it("defaults to local", () => {
    assert.equal(State.loadNowLineMode(), "local");
  });

  it("round-trips a supported mode", () => {
    State.saveNowLineMode("firstCity");
    assert.equal(State.nowLineMode, "firstCity");
    assert.equal(State.loadNowLineMode(), "firstCity");
  });

  it("ignores an unsupported stored mode", () => {
    storage.setItem(CONFIG.nowLineModeKey, "moon-phase");
    assert.equal(State.loadNowLineMode(), "local");
  });
});

/* ------------------------------------------------------------------ *
 * City lookup
 * ------------------------------------------------------------------ */

describe("State.allCities / findCity", () => {
  beforeEach(() => {
    State.init();
  });

  it("puts the local city first", () => {
    const all = State.allCities();
    assert.equal(all[0].id, "local");
    assert.equal(typeof all[0].zone, "string");
    assert.equal(typeof all[0].lng, "number");
    assert.equal(typeof all[0].lat, "number");
  });

  it("exposes the local city's zone as its matchingId when catalogued", () => {
    const local = State.allCities()[0];
    assert.ok(local.matchingId === null || State.findCity(local.matchingId));
  });

  it("includes catalog and custom cities after the local city", () => {
    State.customCities = [{ id: "custom-a", name: "A", zone: "UTC", x: 50, y: 50 }];
    const ids = State.allCities().map((c) => c.id);
    assert.ok(ids.includes("tokyo"));
    assert.ok(ids.includes("custom-a"));
  });

  it("finds a city by id and returns undefined otherwise", () => {
    assert.equal(State.findCity("tokyo").zone, "Asia/Tokyo");
    assert.equal(State.findCity("nowhere"), undefined);
  });
});

/* ------------------------------------------------------------------ *
 * Scrub lines
 * ------------------------------------------------------------------ */

describe("scrub lines", () => {
  beforeEach(() => {
    State.init();
  });

  it("starts with no scrubs", () => {
    assert.deepEqual(State.scrubs, []);
    assert.equal(State.getActiveScrubFraction(), null);
    assert.equal(State.selectedOffsetHours, 0);
  });

  it("returns the active fraction", () => {
    State.scrubs = [{ id: "scrub_1", fraction: 0.25 }, { id: "scrub_2", fraction: 0.75 }];
    State.activeScrubId = "scrub_2";
    assert.equal(State.getActiveScrubFraction(), 0.75);
  });

  it("returns null when no scrub is active", () => {
    State.scrubs = [{ id: "scrub_1", fraction: 0.25 }];
    assert.equal(State.getActiveScrubFraction(), null);
  });

  it("returns null when the active id is gone", () => {
    State.scrubs = [{ id: "scrub_1", fraction: 0.25 }];
    State.activeScrubId = "scrub_deleted";
    assert.equal(State.getActiveScrubFraction(), null);
    assert.equal(State.selectedOffsetHours, 0);
  });

  it("returns null when there are no scrubs at all", () => {
    State.activeScrubId = "scrub_1";
    assert.equal(State.getActiveScrubFraction(), null);
  });

  it("clears scrubs on init", () => {
    State.scrubs = [{ id: "scrub_1", fraction: 0.25 }];
    State.activeScrubId = "scrub_1";
    State.init();
    assert.deepEqual(State.scrubs, []);
    assert.equal(State.activeScrubId, null);
    assert.equal(State.selectedOffsetHours, 0);
  });

  it("caps the scrub count at CONFIG.maxScrubs", () => {
    assert.equal(CONFIG.maxScrubs, 4);
  });

  it("shifts now onto the active scrub", (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: new Date(2024, 0, 15, 20, 0, 0) });
    State.nowLineMode = "local";
    State.scrubs = [{ id: "scrub_1", fraction: 0.25 }];
    State.activeScrubId = "scrub_1";
    // Local time is 20:00 -> now fraction 20/24; the scrub sits at 06:00.
    assert.equal(TimelineUtils.getNowFraction(), 20 / 24);
    assert.equal(State.selectedOffsetHours, 6 - 20);
  });

  it("shifts by the difference between the scrub and the first city", (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: new Date(2024, 0, 15, 20, 0, 0) });
    State.nowLineMode = "firstCity";
    State.selectedIds = ["new-york"];
    State.scrubs = [{ id: "scrub_1", fraction: 0.25 }];
    State.activeScrubId = "scrub_1";
    // 20:00 in Asia/Taipei is 07:00 in New York -> now fraction 7/24.
    assert.equal(TimelineUtils.getNowFraction(), 7 / 24);
    assertClose(State.selectedOffsetHours, -1, "selectedOffsetHours");
  });
});

/* ------------------------------------------------------------------ *
 * Corrupted storage recovery
 * ------------------------------------------------------------------ */

describe("corrupted storage recovery", () => {
  const CORRUPT_KEYS = [
    CONFIG.timePeriodsKey,
    CONFIG.mapSettingsKey,
    CONFIG.customCitiesKey,
    CONFIG.storageKey
  ];

  for (const key of CORRUPT_KEYS) {
    it(`recovers from invalid JSON in ${key}`, () => {
      storage.setItem(key, "{{{ not json");
      assert.doesNotThrow(() => State.init());
      assert.equal(typeof State.currentLang, "string");
      assert.deepEqual(State.timePeriods, CONFIG.defaultTimePeriods);
      assert.deepEqual(State.mapSettings, CONFIG.defaultMapSettings);
      assert.deepEqual(State.customCities, []);
      assert.ok(State.selectedIds.length > 0);
    });
  }

  it("recovers when every key is corrupt", () => {
    for (const key of CORRUPT_KEYS) storage.setItem(key, "nope");
    assert.doesNotThrow(() => State.init());
    assert.deepEqual(State.selectedIds, CONFIG.defaultSelection);
  });

  it("recovers when the stored language is corrupt", () => {
    storage.setItem(CONFIG.languageKey, "");
    assert.doesNotThrow(() => State.init());
    assert.ok(CONFIG.supportedLanguages.includes(State.currentLang));
  });

  it("survives a storage backend that throws", () => {
    uninstallMockStorage(storage);
    const throwing = {
      getItem() { throw new Error("denied"); },
      setItem() { throw new Error("denied"); },
      removeItem() { throw new Error("denied"); }
    };
    globalThis.localStorage = throwing;
    try {
      assert.doesNotThrow(() => State.loadTimePeriods());
      assert.deepEqual(State.loadTimePeriods(), CONFIG.defaultTimePeriods);
      assert.doesNotThrow(() => State.loadNowLineMode());
      // Every save path goes through the same guard, so a quota error can never
      // abort an interaction (drag-reorder, map click, slider) mid-write.
      for (const save of [
        "saveTimePeriods", "saveMapSettings", "saveCustomCities",
        "saveSelection", "saveNowLineMode"
      ]) {
        assert.doesNotThrow(() => State[save](), `${save} threw`);
      }
    } finally {
      uninstallMockStorage();
    }
  });
});