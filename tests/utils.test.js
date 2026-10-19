/**
 * TimeMapper - Tests: shared utils
 *
 * Covers MathUtils, EscapeUtils, TimeUtils, PeriodUtils, MapUtils,
 * TimelineUtils and I18nUtils. The DOM-touching helpers are exercised with
 * minimal hand-rolled stubs so the suite stays dependency-free.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { CONFIG, PROJECTION } from "../src/shared/config.js";
import { State } from "../src/shared/state.js";
import {
  MathUtils,
  EscapeUtils,
  TimeUtils,
  PeriodUtils,
  MapUtils,
  TimelineUtils,
  I18nUtils
} from "../src/shared/utils.js";
import { i18nTranslations, i18nCityNames } from "../src/shared/i18n.js";

const EPSILON = 1e-9;

/** Floating point safe equality for round-trip assertions. */
function assertClose(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < EPSILON, `${message}: expected ${expected}, got ${actual}`);
}

const JAN = new Date("2024-01-15T00:00:00Z");
const JUN = new Date("2024-06-15T00:00:00Z");

/* ------------------------------------------------------------------ *
 * Minimal DOM stubs
 * ------------------------------------------------------------------ */

function makeElement(dataset = {}, textContent = "") {
  const attributes = {};
  return {
    dataset,
    textContent,
    placeholder: "",
    title: "",
    attributes,
    setAttribute(key, value) { attributes[key] = value; }
  };
}

function makeDocumentElement(theme = "light") {
  return { dataset: { theme }, lang: "" };
}

/**
 * Install a fake `document`. Returns a restore function.
 * `matchesBySelector` maps a CSS selector onto the elements querySelectorAll
 * should yield for it.
 */
function installFakeDocument(matchesBySelector = {}) {
  const previous = globalThis.document;
  globalThis.document = {
    documentElement: makeDocumentElement(),
    querySelectorAll(selector) { return matchesBySelector[selector] || []; }
  };
  return () => {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  };
}

function makeRoot(matchesBySelector = {}) {
  return {
    querySelectorAll(selector) {
      const value = matchesBySelector[selector] || [];
      return Array.isArray(value) ? value : [value];
    }
  };
}

/** Run `fn` with console.warn captured; returns the collected messages. */
function captureWarnings(fn) {
  const original = console.warn;
  const warnings = [];
  console.warn = (...args) => { warnings.push(args.join(" ")); };
  try {
    fn();
  } finally {
    console.warn = original;
  }
  return warnings;
}

beforeEach(() => {
  installFakeDocument();
  State.mapSettings = { ...CONFIG.defaultMapSettings };
  State.timePeriods = CONFIG.defaultTimePeriods.map((p) => ({ ...p }));
  State.currentLang = "zh";
  State.selectedIds = [];
  State.nowLineMode = "local";
  State.scrubs = [];
  State.activeScrubId = null;
});

afterEach(() => {
  delete globalThis.document;
  delete globalThis.TimeMapperTheme;
});

/* ------------------------------------------------------------------ *
 * MathUtils
 * ------------------------------------------------------------------ */

describe("MathUtils.clamp", () => {
  it("returns the value unchanged inside the range", () => {
    assert.equal(MathUtils.clamp(50, 0, 100), 50);
    assert.equal(MathUtils.clamp(-3.5, -10, 10), -3.5);
  });

  it("clamps values below min", () => {
    assert.equal(MathUtils.clamp(-1, 0, 100), 0);
    assert.equal(MathUtils.clamp(-999, -10, -1), -10);
  });

  it("clamps values above max", () => {
    assert.equal(MathUtils.clamp(101, 0, 100), 100);
    assert.equal(MathUtils.clamp(1e9, 0, 1), 1);
  });

  it("keeps exact boundary values", () => {
    assert.equal(MathUtils.clamp(0, 0, 100), 0);
    assert.equal(MathUtils.clamp(100, 0, 100), 100);
  });
});

/* ------------------------------------------------------------------ *
 * EscapeUtils
 * ------------------------------------------------------------------ */

describe("EscapeUtils.html", () => {
  it("neutralises a script payload", () => {
    assert.equal(
      EscapeUtils.html('<script>alert("xss")</script>'),
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"
    );
  });

  it("escapes every HTML-significant character", () => {
    assert.equal(EscapeUtils.html("&"), "&amp;");
    assert.equal(EscapeUtils.html("<"), "&lt;");
    assert.equal(EscapeUtils.html(">"), "&gt;");
    assert.equal(EscapeUtils.html('"'), "&quot;");
    assert.equal(EscapeUtils.html("'"), "&#39;");
  });

  it("escapes in a single pass (no double escaping)", () => {
    assert.equal(EscapeUtils.html("&lt;"), "&amp;lt;");
    assert.equal(EscapeUtils.html("AT&T <b>"), "AT&amp;T &lt;b&gt;");
  });

  it("returns an empty string for null, undefined and empty input", () => {
    assert.equal(EscapeUtils.html(null), "");
    assert.equal(EscapeUtils.html(undefined), "");
    assert.equal(EscapeUtils.html(""), "");
  });

  it("stringifies non-string values", () => {
    assert.equal(EscapeUtils.html(0), "0");
    assert.equal(EscapeUtils.html(false), "false");
  });
});

/* ------------------------------------------------------------------ *
 * TimeUtils — zone resolution
 * ------------------------------------------------------------------ */

describe("TimeUtils.resolveZone", () => {
  it("returns a canonical IANA zone unchanged", () => {
    assert.equal(TimeUtils.resolveZone("Asia/Taipei"), "Asia/Taipei");
    assert.equal(TimeUtils.resolveZone("America/New_York"), "America/New_York");
    assert.equal(TimeUtils.resolveZone("UTC"), "UTC");
  });

  it("tolerates casing", () => {
    assert.equal(TimeUtils.resolveZone("asia/taipei"), "Asia/Taipei");
    assert.equal(TimeUtils.resolveZone("ASIA/TAIPEI"), "Asia/Taipei");
  });

  it("tolerates surrounding whitespace", () => {
    assert.equal(TimeUtils.resolveZone("  Asia/Taipei  "), "Asia/Taipei");
  });

  it("tolerates hyphens and underscores in shorthand input", () => {
    assert.equal(TimeUtils.resolveZone("new-york"), "America/New_York");
    assert.equal(TimeUtils.resolveZone("new_york"), "America/New_York");
    assert.equal(TimeUtils.resolveZone("taipei"), "Asia/Taipei");
  });

  it("falls back to UTC for an unknown zone", () => {
    assert.equal(TimeUtils.resolveZone("Invalid/Zone"), "UTC");
    assert.equal(TimeUtils.resolveZone("Mars/Olympus"), "UTC");
  });

  it("falls back to UTC for non-string input", () => {
    assert.equal(TimeUtils.resolveZone(null), "UTC");
    assert.equal(TimeUtils.resolveZone(undefined), "UTC");
    assert.equal(TimeUtils.resolveZone(42), "UTC");
  });
});

describe("TimeUtils.isValidZone", () => {
  it("accepts real zones", () => {
    assert.equal(TimeUtils.isValidZone("Asia/Taipei"), true);
    assert.equal(TimeUtils.isValidZone("Europe/London"), true);
    assert.equal(TimeUtils.isValidZone("UTC"), true);
  });

  it("rejects unknown zones even though they resolve to UTC", () => {
    assert.equal(TimeUtils.isValidZone("Invalid/Zone"), false);
  });

  it("rejects blank and non-string input", () => {
    assert.equal(TimeUtils.isValidZone(""), false);
    assert.equal(TimeUtils.isValidZone("   "), false);
    assert.equal(TimeUtils.isValidZone(null), false);
    assert.equal(TimeUtils.isValidZone(undefined), false);
    assert.equal(TimeUtils.isValidZone(7), false);
  });
});

/* ------------------------------------------------------------------ *
 * TimeUtils — offsets & formatting
 * ------------------------------------------------------------------ */

describe("TimeUtils.utcOffsetText", () => {
  it("renders a positive whole-hour offset", () => {
    assert.equal(TimeUtils.utcOffsetText(JAN, "Asia/Taipei"), "UTC+8");
  });

  it("renders a negative whole-hour offset", () => {
    assert.equal(TimeUtils.utcOffsetText(JAN, "America/New_York"), "UTC-5");
  });

  it("renders a half-hour offset", () => {
    assert.equal(TimeUtils.utcOffsetText(JAN, "Asia/Kolkata"), "UTC+5:30");
  });

  it("renders a quarter-hour offset", () => {
    assert.equal(TimeUtils.utcOffsetText(JUN, "Pacific/Chatham"), "UTC+12:45");
  });

  it("renders a zero offset", () => {
    assert.equal(TimeUtils.utcOffsetText(JAN, "UTC"), "UTC+0");
  });

  it("degrades to UTC+0 for an invalid zone", () => {
    assert.equal(TimeUtils.utcOffsetText(JAN, "Invalid/Zone"), "UTC+0");
  });
});

describe("TimeUtils.getOffsetMinutes", () => {
  it("returns signed offset minutes", () => {
    assert.equal(TimeUtils.getOffsetMinutes(JAN, "Asia/Taipei"), 480);
    assert.equal(TimeUtils.getOffsetMinutes(JAN, "America/New_York"), -300);
    assert.equal(TimeUtils.getOffsetMinutes(JAN, "Asia/Kolkata"), 330);
    assert.equal(TimeUtils.getOffsetMinutes(JUN, "Pacific/Chatham"), 765);
    assert.equal(TimeUtils.getOffsetMinutes(JAN, "UTC"), 0);
  });

  it("accounts for DST", () => {
    assert.equal(TimeUtils.getOffsetMinutes(JUN, "America/New_York"), -240);
    assert.equal(TimeUtils.getOffsetMinutes(JUN, "Europe/London"), 60);
  });

  it("returns 0 for an invalid zone instead of throwing", () => {
    assert.equal(TimeUtils.getOffsetMinutes(JAN, "Invalid/Zone"), 0);
  });
});

describe("TimeUtils formatting", () => {
  it("formats clock time in a zone", () => {
    State.currentLang = "en";
    assert.equal(TimeUtils.formatTime(JAN, "Asia/Taipei"), "08:00");
  });

  it("returns the hour inside a zone", () => {
    assert.equal(TimeUtils.hourInZone(JAN, "Asia/Taipei"), 8);
    assert.equal(TimeUtils.hourInZone(JAN, "UTC"), 0);
  });

  it("returns the calendar date inside a zone", () => {
    assert.equal(TimeUtils.dateInZone(new Date("2024-01-01T23:00:00Z"), "Asia/Taipei"), "1/2");
  });

  it("never throws for an invalid zone", () => {
    assert.equal(typeof TimeUtils.formatTime(JAN, "Invalid/Zone"), "string");
    assert.equal(typeof TimeUtils.hourInZone(JAN, "Invalid/Zone"), "number");
    assert.equal(typeof TimeUtils.dateInZone(JAN, "Invalid/Zone"), "string");
  });
});

describe("TimeUtils.isCurrentlyDST", () => {
  it("returns a boolean for valid zones", () => {
    assert.equal(typeof TimeUtils.isCurrentlyDST("America/New_York"), "boolean");
    assert.equal(typeof TimeUtils.isCurrentlyDST("Europe/London"), "boolean");
  });

  it("reports false for a zone that never observes DST", () => {
    assert.equal(TimeUtils.isCurrentlyDST("Asia/Taipei"), false);
    assert.equal(TimeUtils.isCurrentlyDST("Asia/Kolkata"), false);
    assert.equal(TimeUtils.isCurrentlyDST("UTC"), false);
  });

  it("returns false instead of throwing for an invalid zone", () => {
    assert.equal(TimeUtils.isCurrentlyDST("Invalid/Zone"), false);
  });
});

/* ------------------------------------------------------------------ *
 * MapUtils
 * ------------------------------------------------------------------ */

describe("MapUtils.subsolarLng", () => {
  it("is 180° at UTC midnight", () => {
    assert.equal(MapUtils.subsolarLng(new Date(Date.UTC(2024, 0, 1, 0, 0))), 180);
  });

  it("is 0° at UTC noon", () => {
    assertClose(MapUtils.subsolarLng(new Date(Date.UTC(2024, 0, 1, 12, 0))), 0, "subsolar noon");
  });

  it("is 90° at 06:00 UTC and -90° at 18:00 UTC", () => {
    assert.equal(MapUtils.subsolarLng(new Date(Date.UTC(2024, 0, 1, 6, 0))), 90);
    assertClose(MapUtils.subsolarLng(new Date(Date.UTC(2024, 0, 1, 18, 0))), -90, "subsolar 18:00");
  });

  it("moves 15° per hour", () => {
    const a = MapUtils.subsolarLng(new Date(Date.UTC(2024, 0, 1, 1, 0)));
    const b = MapUtils.subsolarLng(new Date(Date.UTC(2024, 0, 1, 2, 0)));
    assert.equal(a - b, 15);
  });
});

describe("MapUtils projection", () => {
  it("maps longitude onto the configured linear scale", () => {
    assertClose(MapUtils.lngToX(0), PROJECTION.lngXOffset, "lngToX(0)");
    assertClose(MapUtils.lngToX(180), PROJECTION.lngX * 180 + PROJECTION.lngXOffset, "lngToX(180)");
  });

  it("inverts longitude from screen x across the full range", () => {
    for (let lng = -180; lng <= 180; lng += 1) {
      assertClose(MapUtils.xToLng(MapUtils.lngToX(lng)), lng, `lng round-trip @ ${lng}`);
    }
  });

  it("inverts latitude from screen y across the full range", () => {
    for (let lat = -90; lat <= 90; lat += 1) {
      assertClose(MapUtils.yToLat(MapUtils.latToY(lat)), lat, `lat round-trip @ ${lat}`);
    }
  });

  it("prefers lng/lat over x/y in lngLatOf", () => {
    assert.deepEqual(MapUtils.lngLatOf({ lng: 121.5, lat: 25, x: 1, y: 2 }), { lng: 121.5, lat: 25 });
  });

  it("falls back to x/y in lngLatOf when lng/lat are absent", () => {
    const { lng, lat } = MapUtils.lngLatOf({ x: 50, y: 50 });
    assertClose(lng, MapUtils.xToLng(50), "derived lng");
    assertClose(lat, MapUtils.yToLat(50), "derived lat");
  });
});

describe("MapUtils calibration round-trips", () => {
  it("uncalibrateX inverts calibrateX exactly across 0-100", () => {
    for (let x = 0; x <= 100; x += 1) {
      assert.equal(MapUtils.uncalibrateX(MapUtils.calibrateX(x)), x, `x round-trip @ ${x}`);
    }
  });

  it("uncalibrateY inverts calibrateY across 0-100", () => {
    for (let y = 0; y <= 100; y += 1) {
      assertClose(MapUtils.uncalibrateY(MapUtils.calibrateY(y)), y, `y round-trip @ ${y}`);
    }
  });

  it("stays invertible under non-default calibration", () => {
    State.mapSettings = { ...CONFIG.defaultMapSettings, widthScale: 1.5, heightScale: 0.75, lngOffset: 3, latOffset: -8 };
    for (let x = 0; x <= 100; x += 5) {
      assertClose(MapUtils.uncalibrateX(MapUtils.calibrateX(x)), x, `scaled x @ ${x}`);
    }
    for (let y = 0; y <= 100; y += 5) {
      assertClose(MapUtils.uncalibrateY(MapUtils.calibrateY(y)), y, `scaled y @ ${y}`);
    }
  });

  it("getLongitudeX / getXLongitude are inverse", () => {
    for (const lng of [-179, -90, 0, 90, 121.5, 179]) {
      assertClose(MapUtils.getXLongitude(MapUtils.getLongitudeX(lng)), lng, `longitude x @ ${lng}`);
    }
  });
});

describe("MapUtils.mapPosition", () => {
  it("places a city inside the 0-100 viewport", () => {
    const pos = MapUtils.mapPosition({ lng: 121.5, lat: 25.0 });
    assert.ok(pos.x >= 0 && pos.x <= 100, `x out of range: ${pos.x}`);
    assert.ok(pos.y >= 0 && pos.y <= 100, `y out of range: ${pos.y}`);
  });

  it("clamps an east-overflowing longitude to 100", () => {
    assert.equal(MapUtils.mapPosition({ lng: 200, lat: 0 }).x, 100);
  });

  it("clamps a north-overflowing latitude to 0", () => {
    assert.equal(MapUtils.mapPosition({ lng: 0, lat: 90 }).y, 0);
  });

  it("clamps a south-overflowing latitude to 100", () => {
    assert.equal(MapUtils.mapPosition({ lng: 0, lat: -90 }).y, 100);
  });

  it("supports the legacy x/y city shape", () => {
    const pos = MapUtils.mapPosition({ x: 50, y: 50 });
    assert.ok(pos.x >= 0 && pos.x <= 100);
    assert.ok(pos.y >= 0 && pos.y <= 100);
  });

  it("caches the computed base position on the city object", () => {
    const city = { lng: 121.5, lat: 25.0 };
    const first = MapUtils.mapPosition(city);
    assert.equal(typeof city._cx, "number");
    assert.equal(typeof city._cy, "number");
    assert.deepEqual(MapUtils.mapPosition(city), first);
  });
});

/* ------------------------------------------------------------------ *
 * PeriodUtils
 * ------------------------------------------------------------------ */

describe("PeriodUtils.getHourStyle", () => {
  beforeEach(() => {
    State.timePeriods = [
      { name: "day", start: 9, end: 18 },
      { name: "night", start: 22, end: 6 },
      { name: "evening", start: 7, end: 8 }
    ];
  });

  it("matches every hour of a standard daytime interval", () => {
    assert.equal(PeriodUtils.getHourStyle(9).name, "day");
    assert.equal(PeriodUtils.getHourStyle(14).name, "day");
    assert.equal(PeriodUtils.getHourStyle(18).name, "day");
  });

  it("matches a cross-midnight interval before and after midnight", () => {
    assert.equal(PeriodUtils.getHourStyle(23).name, "night");
    assert.equal(PeriodUtils.getHourStyle(0).name, "night");
    assert.equal(PeriodUtils.getHourStyle(5).name, "night");
  });

  it("falls into the following period outside a cross-midnight interval", () => {
    assert.equal(PeriodUtils.getHourStyle(7).name, "evening");
    assert.equal(PeriodUtils.getHourStyle(8).name, "evening");
  });

  it("falls back to the last period when no period matches", () => {
    assert.equal(PeriodUtils.getHourStyle(19).name, "evening");
    assert.equal(PeriodUtils.getHourStyle(21).name, "evening");
  });

  it("merges the palette entry into the returned style", () => {
    const style = PeriodUtils.getHourStyle(14);
    assert.equal(typeof style.color, "string");
    assert.equal(typeof style.fontColor, "string");
    assert.equal(style.start, 9);
    assert.equal(style.end, 18);
  });

  it("uses the built-in defaults when State has no periods", () => {
    State.timePeriods = undefined;
    assert.equal(PeriodUtils.getHourStyle(12).name, "period1");
  });
});

describe("PeriodUtils palette", () => {
  it("picks the palette sized for the active period count", () => {
    const restore = installFakeDocument();
    try {
      State.timePeriods = [
        { name: "a", start: 0, end: 11 },
        { name: "b", start: 12, end: 23 }
      ];
      assert.equal(PeriodUtils.getPeriodColors(0).color, CONFIG.periodColorsByCount[2].light[0].color);

      State.timePeriods = [
        { name: "a", start: 0, end: 8 },
        { name: "b", start: 9, end: 17 },
        { name: "c", start: 18, end: 23 }
      ];
      assert.equal(PeriodUtils.getPeriodColors(2).color, CONFIG.periodColorsByCount[3].light[2].color);
    } finally {
      restore();
    }
  });

  it("returns the last palette entry for an out-of-range index", () => {
    const restore = installFakeDocument();
    try {
      State.timePeriods = [
        { name: "a", start: 0, end: 11 },
        { name: "b", start: 12, end: 23 }
      ];
      assert.equal(PeriodUtils.getPeriodColors(99).color, CONFIG.periodColorsByCount[2].light[1].color);
    } finally {
      restore();
    }
  });

  it("resolves the theme through TimeMapperTheme when available", () => {
    globalThis.localStorage = { getItem: () => "dark" };
    globalThis.TimeMapperTheme = { resolve: () => "dark" };
    try {
      assert.equal(PeriodUtils.currentTheme(), "dark");
      assert.equal(PeriodUtils.getPeriodColors(0).color, CONFIG.periodColorsByCount[3].dark[0].color);
    } finally {
      delete globalThis.localStorage;
    }
  });

  it("falls back to the document dataset when no theme module is loaded", () => {
    globalThis.document = { documentElement: makeDocumentElement("dark") };
    assert.equal(PeriodUtils.currentTheme(), "dark");
  });

  it("defaults to the light theme", () => {
    globalThis.document = { documentElement: makeDocumentElement("light") };
    assert.equal(PeriodUtils.currentTheme(), "light");
  });
});

/* ------------------------------------------------------------------ *
 * TimelineUtils
 * ------------------------------------------------------------------ */

describe("TimelineUtils.getNowFraction", () => {
  it("returns a 0-1 day fraction in local mode", () => {
    const fraction = TimelineUtils.getNowFraction();
    assert.equal(typeof fraction, "number");
    assert.ok(fraction >= 0 && fraction < 1, `out of range: ${fraction}`);
  });

  it("uses the first selected city's zone in firstCity mode", () => {
    State.nowLineMode = "firstCity";
    State.selectedIds = ["tokyo"];
    const fraction = TimelineUtils.getNowFraction();
    assert.ok(fraction >= 0 && fraction < 1, `out of range: ${fraction}`);
  });

  it("falls back to local time when the first city is missing", () => {
    State.nowLineMode = "firstCity";
    State.selectedIds = ["does-not-exist"];
    const fraction = TimelineUtils.getNowFraction();
    assert.ok(fraction >= 0 && fraction < 1, `out of range: ${fraction}`);
  });
});

describe("TimelineUtils.formatFractionTime", () => {
  it("formats a day fraction as HH:MM", () => {
    assert.equal(TimelineUtils.formatFractionTime(0), "00:00");
    assert.equal(TimelineUtils.formatFractionTime(0.5), "12:00");
    assert.equal(TimelineUtils.formatFractionTime(0.25), "06:00");
  });

  it("wraps past midnight", () => {
    assert.equal(TimelineUtils.formatFractionTime(1), "00:00");
    assert.equal(TimelineUtils.formatFractionTime(1.25), "06:00");
  });

  it("returns a placeholder for non-numeric input", () => {
    assert.equal(TimelineUtils.formatFractionTime(NaN), "--:--");
    assert.equal(TimelineUtils.formatFractionTime("nope"), "--:--");
    assert.equal(TimelineUtils.formatFractionTime(undefined), "--:--");
  });
});

describe("TimelineUtils.snapToFiveMinutes", () => {
  it("leaves already-aligned fractions untouched", () => {
    assert.equal(TimelineUtils.snapToFiveMinutes(0), 0);
    assert.equal(TimelineUtils.snapToFiveMinutes(0.5), 0.5);
    assert.equal(TimelineUtils.snapToFiveMinutes(1), 1);
  });

  it("rounds to the nearest five minutes", () => {
    const snapped = TimelineUtils.snapToFiveMinutes(0.51);
    assert.equal(Math.round(snapped * 24 * 60), 735);
  });

  it("returns 0 for non-numeric input", () => {
    assert.equal(TimelineUtils.snapToFiveMinutes(NaN), 0);
    assert.equal(TimelineUtils.snapToFiveMinutes("nope"), 0);
  });
});

/* ------------------------------------------------------------------ *
 * I18nUtils
 * ------------------------------------------------------------------ */

describe("I18nUtils.getTranslation", () => {
  it("returns a known key for the active language", () => {
    State.currentLang = "zh";
    const zh = I18nUtils.getTranslation("mapSettings");
    State.currentLang = "en";
    const en = I18nUtils.getTranslation("mapSettings");
    assert.equal(typeof zh, "string");
    assert.notEqual(zh, "");
    assert.notEqual(en, "");
  });

  it("substitutes parameters", () => {
    State.currentLang = "en";
    const text = I18nUtils.getTranslation("removeCity", { name: "Tokyo" });
    assert.ok(text.includes("Tokyo"), `parameter not substituted: ${text}`);
  });

  it("returns an empty string for a missing key", () => {
    assert.equal(I18nUtils.getTranslation("__missing_key__"), "");
  });
});

describe("I18nUtils.getCityName", () => {
  it("returns an empty string for a missing city", () => {
    assert.equal(I18nUtils.getCityName(null), "");
  });

  it("uses the custom city's own name for custom- ids", () => {
    assert.equal(I18nUtils.getCityName({ id: "custom-123", name: "My Spot" }), "My Spot");
  });

  it("prefers the matched catalog name for the local city", () => {
    assert.equal(I18nUtils.getCityName({ id: "local", zone: "Asia/Tokyo", matchingId: "tokyo" }), i18nCityNames.zh.tokyo);
  });

  it("derives a name from the zone when the local city has no match", () => {
    assert.equal(I18nUtils.getCityName({ id: "local", zone: "America/New_York" }), "New York");
  });

  it("looks up catalog cities by id", () => {
    assert.equal(I18nUtils.getCityName({ id: "taipei" }), i18nCityNames.zh.taipei);
  });

  it("falls back to the id for an unknown city", () => {
    assert.equal(I18nUtils.getCityName({ id: "nowhere" }), "nowhere");
  });
});

describe("I18nUtils.applyAttributes", () => {
  const cases = {
    "[data-i18n]": makeElement({ i18n: "mapSettings" }),
    "[data-i18n-placeholder]": makeElement({ i18nPlaceholder: "longitude" }),
    "[data-i18n-title]": makeElement({ i18nTitle: "latitude" }),
    "[data-i18n-aria-label]": makeElement({ i18nAriaLabel: "dstTooltip" })
  };

  it("translates every supported attribute type", () => {
    State.currentLang = "en";
    try {
      I18nUtils.applyAttributes(makeRoot(cases));
      assert.equal(cases["[data-i18n]"].textContent, i18nTranslations.en.mapSettings);
      assert.equal(cases["[data-i18n-placeholder]"].placeholder, i18nTranslations.en.longitude);
      assert.equal(cases["[data-i18n-title]"].title, i18nTranslations.en.latitude);
      assert.equal(cases["[data-i18n-aria-label]"].attributes["aria-label"], i18nTranslations.en.dstTooltip);
    } finally {
      delete globalThis.document;
    }
  });

  it("defaults the root to document and sets the html lang attribute", () => {
    State.currentLang = "zh";
    installFakeDocument({ "[data-i18n]": [makeElement({ i18n: "mapSettings" })] });
    try {
      I18nUtils.applyAttributes();
      assert.equal(globalThis.document.documentElement.lang, CONFIG.localeMap.zh);
    } finally {
      delete globalThis.document;
    }
  });

  it("warns and leaves text untouched for a missing key", () => {
    State.currentLang = "en";
    installFakeDocument();
    try {
      const el = makeElement({ i18n: "__missing_key__" }, "Fallback");
      const warnings = captureWarnings(() => I18nUtils.applyAttributes(makeRoot({ "[data-i18n]": [el] })));
      assert.equal(el.textContent, "Fallback");
      assert.equal(warnings.length, 1);
      assert.ok(warnings[0].includes("__missing_key__"), warnings[0]);
    } finally {
      delete globalThis.document;
    }
  });

  it("warns once for an unsupported language", () => {
    State.currentLang = "xx";
    installFakeDocument();
    try {
      const warnings = captureWarnings(() => I18nUtils.applyAttributes(makeRoot({ "[data-i18n]": [makeElement({ i18n: "mapSettings" })] })));
      assert.equal(warnings.length, 1);
      assert.ok(warnings[0].includes('"xx"'), warnings[0]);
      assert.equal(globalThis.document.documentElement.lang, "xx");
    } finally {
      delete globalThis.document;
    }
  });
});