/**
 * TimeMapper - Tests: tiered storage module
 *
 * Pins the three behaviours the migration depends on: the localStorage
 * mirror fallback when sync is unavailable, the sentinel-guarded legacy
 * migration (including the DECIDED-1 rule that "auto" never reaches sync),
 * and the fire-and-forget error hook on quota failures.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/shared/config.js";
import { Storage } from "../src/shared/storage.js";
import { installMockStorage, uninstallMockStorage } from "./helpers/mock-storage.js";

/** Minimal chrome.storage.sync double. */
function installMockChrome(initial = {}) {
  const data = { ...initial };
  const calls = [];
  globalThis.chrome = {
    storage: {
      sync: {
        async get(keys) {
          calls.push(["get", keys]);
          const list = Array.isArray(keys) ? keys : [keys];
          const out = {};
          for (const k of list) if (data[k] !== undefined) out[k] = data[k];
          return out;
        },
        async set(items) {
          calls.push(["set", { ...items }]);
          Object.assign(data, items);
        }
      }
    }
  };
  return {
    data,
    calls,
    restore() { delete globalThis.chrome; }
  };
}

let storage;
let chromeMock;
let errorHookCalls;

beforeEach(() => {
  storage = installMockStorage();
  errorHookCalls = [];
  Storage.setWriteErrorHook((keys, err) => errorHookCalls.push({ keys, err }));
});

afterEach(() => {
  Storage.setWriteErrorHook(() => { });
  if (chromeMock) { chromeMock.restore(); chromeMock = null; }
  uninstallMockStorage(storage);
});

/* ------------------------------------------------------------------ *
 * Mirror fallback (no chrome available: Node / ungranted permission)
 * ------------------------------------------------------------------ */

describe("Storage without chrome.storage.sync", () => {
  it("falls back to the localStorage mirror", async () => {
    storage.setItem(CONFIG.storageKey, JSON.stringify(["tokyo", "local"]));
    storage.setItem(CONFIG.timePeriodsKey, JSON.stringify([{ start: 1, end: 5 }, { start: 6, end: 24 }]));
    const { values } = await Storage.loadSyncData();
    assert.deepEqual(values[CONFIG.syncKeys.cities], ["tokyo", "local"]);
    assert.equal(values[CONFIG.syncKeys.timePeriods].length, 2);
    assert.equal(values[CONFIG.syncKeys.nowLineMode], undefined);
  });

  it("normalises the raw-string language mirror", async () => {
    storage.setItem(CONFIG.languageKey, "es");
    const { values } = await Storage.loadSyncData();
    assert.equal(values[CONFIG.syncKeys.language], "es");
  });

  it("passes corrupt mirror values through for the state layer to reject", async () => {
    storage.setItem(CONFIG.customCitiesKey, "{{{ not json");
    const { values } = await Storage.loadSyncData();
    // Storage does not interpret; State.resolveCustomCities drops non-arrays.
    assert.equal(values[CONFIG.syncKeys.customCities], "{{{ not json");
  });

  it("reads the device-local language preference", async () => {
    storage.setItem(CONFIG.languagePreferenceKey, "auto");
    const { languagePreference } = await Storage.loadSyncData();
    assert.equal(languagePreference, "auto");
  });

  it("persist writes the mirror and stays quiet without sync", () => {
    assert.doesNotThrow(() => Storage.persist(CONFIG.storageKey, CONFIG.syncKeys.cities, ["tokyo"]));
    assert.deepEqual(JSON.parse(storage.getItem(CONFIG.storageKey)), ["tokyo"]);
  });
});

/* ------------------------------------------------------------------ *
 * Sentinel-guarded legacy migration
 * ------------------------------------------------------------------ */

describe("Storage legacy migration", () => {
  it("seeds sync from legacy localStorage once and stamps the sentinel", async () => {
    chromeMock = installMockChrome({});
    storage.setItem(CONFIG.storageKey, JSON.stringify(["tokyo", "paris"]));
    storage.setItem(CONFIG.nowLineModeKey, JSON.stringify("firstCity"));

    const first = await Storage.loadSyncData();
    assert.deepEqual(first.values[CONFIG.syncKeys.cities], ["tokyo", "paris"]);
    assert.equal(first.values[CONFIG.syncKeys.nowLineMode], "firstCity");
    assert.ok(chromeMock.data[CONFIG.syncKeys.migratedAt], "sentinel written");

    const sent = chromeMock.calls.filter(([op]) => op === "set");
    assert.equal(sent.length, 1, "exactly one migration write");
  });

  it("never re-migrates once the sentinel exists", async () => {
    chromeMock = installMockChrome({ [CONFIG.syncKeys.migratedAt]: 1 });
    storage.setItem(CONFIG.storageKey, JSON.stringify(["stale-legacy"]));
    const { values } = await Storage.loadSyncData();
    // Sentinel present, sync store empty: the mirror serves the local fallback.
    assert.deepEqual(values[CONFIG.syncKeys.cities], ["stale-legacy"]);
    const sent = chromeMock.calls.filter(([op]) => op === "set");
    assert.equal(sent.length, 0);
  });

  it("does not seed an auto language into sync (DECIDED-1)", async () => {
    chromeMock = installMockChrome({});
    storage.setItem(CONFIG.languagePreferenceKey, "auto");
    storage.setItem(CONFIG.languageKey, JSON.stringify("auto"));
    await Storage.loadSyncData();
    assert.equal(chromeMock.data[CONFIG.syncKeys.language], undefined);
    assert.ok(chromeMock.data[CONFIG.syncKeys.migratedAt]);
  });

  it("seeds an explicit language when no auto preference is stored", async () => {
    chromeMock = installMockChrome({});
    storage.setItem(CONFIG.languageKey, JSON.stringify("en"));
    const { values } = await Storage.loadSyncData();
    assert.equal(chromeMock.data[CONFIG.syncKeys.language], "en");
    assert.equal(values[CONFIG.syncKeys.language], "en");
  });

  it("sync store wins over the mirror", async () => {
    chromeMock = installMockChrome({
      [CONFIG.syncKeys.migratedAt]: 1,
      [CONFIG.syncKeys.cities]: ["sydney"]
    });
    storage.setItem(CONFIG.storageKey, JSON.stringify(["tokyo"]));
    const { values } = await Storage.loadSyncData();
    assert.deepEqual(values[CONFIG.syncKeys.cities], ["sydney"]);
  });
});

/* ------------------------------------------------------------------ *
 * Write paths
 * ------------------------------------------------------------------ */

describe("Storage persist with sync available", () => {
  it("mirrors locally and pushes the value to sync", async () => {
    chromeMock = installMockChrome({ [CONFIG.syncKeys.migratedAt]: 1 });
    Storage.persist(CONFIG.storageKey, CONFIG.syncKeys.cities, ["tokyo", "paris"]);
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(JSON.parse(storage.getItem(CONFIG.storageKey)), ["tokyo", "paris"]);
    assert.deepEqual(chromeMock.data[CONFIG.syncKeys.cities], ["tokyo", "paris"]);
  });

  it("routes write rejections to the error hook instead of throwing", async () => {
    const boom = new Error("quota exceeded");
    globalThis.chrome = {
      storage: { sync: { get: async () => ({}), set: async () => { throw boom; } } }
    };
    chromeMock = { restore() { delete globalThis.chrome; }, data: {}, calls: [] };
    Storage.persist(CONFIG.storageKey, CONFIG.syncKeys.cities, ["tokyo"]);
    await new Promise((r) => setImmediate(r));
    assert.equal(errorHookCalls.length, 1);
    assert.equal(errorHookCalls[0].err, boom);
    // The local mirror still succeeds, so the UI never notices the failure.
    assert.deepEqual(JSON.parse(storage.getItem(CONFIG.storageKey)), ["tokyo"]);
  });
});
