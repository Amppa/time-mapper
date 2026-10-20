/**
 * TimeMapper - Tests: tiered storage scenarios
 *
 * Scenario-level coverage matching the acceptance list in
 * docs/migration-tiered-storage.md (items that are verifiable without a
 * browser): end-to-end legacy migration through State.init, cross-context
 * sync reload, and the DECIDED-1 rule that language "auto" never travels.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/shared/config.js";
import { State, sanitizeCustomCity } from "../src/shared/state.js";
import { Storage } from "../src/shared/storage.js";
import { installMockStorage, uninstallMockStorage } from "./helpers/mock-storage.js";
import { installMockChrome } from "./helpers/mock-chrome-storage.js";

let storage;
let chromeMock;

beforeEach(() => {
  storage = installMockStorage();
});

afterEach(() => {
  if (chromeMock) { chromeMock.restore(); chromeMock = null; }
  uninstallMockStorage(storage);
});

/* ------------------------------------------------------------------ *
 * Acceptance 5: legacy user upgrades in one painless pass
 * ------------------------------------------------------------------ */

describe("scenario: legacy migration end to end", () => {
  beforeEach(() => {
    chromeMock = installMockChrome({});
    const custom = { id: "custom-1", name: "Test City", zone: "Europe/Oslo", x: 55.4, y: 30.2, lng: 10.75, lat: 59.91 };
    storage.setItem(CONFIG.storageKey, JSON.stringify(["custom-1", "tokyo"]));
    storage.setItem(CONFIG.customCitiesKey, JSON.stringify([custom]));
    storage.setItem(CONFIG.timePeriodsKey, JSON.stringify([
      { name: "day", start: 9, end: 18 },
      { name: "night", start: 19, end: 8 }
    ]));
    storage.setItem(CONFIG.nowLineModeKey, JSON.stringify("firstCity"));
  });

  it("loads legacy settings into State and seeds sync exactly once", async () => {
    await State.init();
    assert.deepEqual(State.selectedIds, ["custom-1", "tokyo"]);
    assert.equal(State.customCities.length, 1);
    assert.equal(State.customCities[0].zone, "Europe/Oslo");
    assert.equal(State.timePeriods.length, 2);
    assert.equal(State.nowLineMode, "firstCity");

    // One migration write containing every legacy value plus the sentinel.
    const writes = chromeMock.setCalls();
    assert.equal(writes.length, 1);
    const seeded = writes[0][1];
    assert.deepEqual(seeded[CONFIG.syncKeys.cities], ["custom-1", "tokyo"]);
    assert.equal(seeded[CONFIG.syncKeys.nowLineMode], "firstCity");
    assert.ok(seeded[CONFIG.syncKeys.migratedAt]);
  });

  it("second launch reads from sync alone without any write", async () => {
    await State.init();
    // Simulate a clean-slate profile: the localStorage mirror is gone and the
    // data only lives in the (already migrated) sync store.
    const seededStore = { ...chromeMock.data };
    uninstallMockStorage(storage);
    storage = installMockStorage();
    chromeMock.restore();
    chromeMock = installMockChrome(seededStore);

    await State.init();
    assert.deepEqual(State.selectedIds, ["custom-1", "tokyo"]);
    assert.equal(chromeMock.setCalls().length, 0, "no re-migration, no redundant writes");
  });
});

/* ------------------------------------------------------------------ *
 * Acceptance 6: popup and options stay in step (onChanged reload path)
 * ------------------------------------------------------------------ */

describe("scenario: cross-context sync reload", () => {
  beforeEach(async () => {
    chromeMock = installMockChrome({ [CONFIG.syncKeys.migratedAt]: 1 });
    await State.init();
  });

  it("accepts plain string values stored directly in sync", async () => {
    // chrome.storage keeps strings as strings; mirrors use raw strings too.
    // A regression that treats them as corrupt JSON silently drops settings.
    chromeMock.data[CONFIG.syncKeys.nowLineMode] = "firstCity";
    await State.init();
    assert.equal(State.nowLineMode, "firstCity");
  });

  /** What the popup/options onChanged listeners do for synced-key changes. */
  function applyExternalSyncChange() {
    return State.init();
  }

  /** Another device wrote straight into the sync store (no local mirror here). */
  function externalSyncWrite(key, value) {
    chromeMock.data[key] = value;
  }

  it("picks up another page's city selection after onChanged", async () => {
    externalSyncWrite(CONFIG.syncKeys.cities, ["tokyo", "sydney"]);
    await applyExternalSyncChange();
    assert.deepEqual(State.selectedIds, ["tokyo", "sydney"]);
  });

  it("picks up another device's custom cities and re-sanitizes them", async () => {
    const hostile = {
      id: "custom-x", name: "N".repeat(120), zone: "Asia/Tokyo",
      x: 140, y: -20, lng: 139.75840912, lat: 35.68099999
    };
    externalSyncWrite(CONFIG.syncKeys.customCities, [hostile]);
    await applyExternalSyncChange();
    assert.equal(State.customCities.length, 1);
    assert.equal(State.customCities[0].name.length, 50);
    assert.equal(State.customCities[0].x, 100);
    assert.equal(State.customCities[0].y, 0);
    assert.equal(State.customCities[0].lng, 139.7584);
    assert.equal(State.customCities[0].lat, 35.681);
  });

  it("keeps local-only mapSettings untouched by sync reloads", async () => {
    State.mapSettings = { ...CONFIG.defaultMapSettings, lngOffset: 42 };
    State.saveMapSettings();
    externalSyncWrite(CONFIG.syncKeys.cities, ["berlin"]);

    await applyExternalSyncChange();
    assert.equal(State.mapSettings.lngOffset, 42, "local tier survives the reload");
    assert.deepEqual(State.selectedIds, ["berlin"]);
  });
});

/* ------------------------------------------------------------------ *
 * Acceptance 4 + DECIDED-1: sanitizer and the auto language firewall
 * ------------------------------------------------------------------ */

describe("scenario: language auto never leaves the device", () => {
  beforeEach(async () => {
    chromeMock = installMockChrome({ [CONFIG.syncKeys.migratedAt]: 1 });
    await State.init();
  });

  it("explicit choice writes to sync, switching back to auto does not", async () => {
    State.saveLanguage("es");
    await new Promise((r) => setImmediate(r));
    assert.equal(chromeMock.data[CONFIG.syncKeys.language], "es");

    State.saveLanguage("auto");
    await new Promise((r) => setImmediate(r));
    // The sync store keeps the last explicit value; "auto" never appears.
    assert.equal(chromeMock.data[CONFIG.syncKeys.language], "es");
    assert.equal(storage.getItem(CONFIG.languagePreferenceKey), "auto");
    const writes = chromeMock.setCalls();
    assert.ok(!writes.some(([, payload]) => payload[CONFIG.syncKeys.language] === "auto"));
  });

  it("a synced language does not override this device's auto resolution", async () => {
    // Remote device chose "en"; this device stays on auto.
    chromeMock.data[CONFIG.syncKeys.language] = "en";
    storage.setItem(CONFIG.languagePreferenceKey, "auto");

    await State.init();
    assert.equal(State.getLanguagePreference(), "auto");
    // Node has no navigator.language; auto must fall back to the zh default,
    // never to the synced "en".
    assert.equal(State.currentLang, "zh");
  });

  it("a fresh device without a local preference follows the synced choice", async () => {
    chromeMock.data[CONFIG.syncKeys.language] = "en";
    await State.init();
    assert.equal(State.currentLang, "en");
  });

  it("sanitizeCustomCity rejects junk batches without partial writes", () => {
    const batch = [
      { id: "ok", name: "Fine", zone: "UTC", x: 1, y: 2 },
      { id: "no-zone", name: "X", x: 1, y: 2 },
      { id: "", name: "X", zone: "UTC" },
      "not-an-object"
    ];
    const clean = batch.map(sanitizeCustomCity).filter((c) => c !== null);
    assert.deepEqual(clean.map((c) => c.id), ["ok"]);
  });
});
