/**
 * TimeMapper - Tiered Storage Module
 *
 * Wraps chrome.storage.sync for the five cross-device keys plus the
 * migratedAt sentinel. Writes are direct (no debounce): the rate quotas are
 * byte-based and this app's payloads are tiny. Every sync write is mirrored
 * into localStorage so the popup still works when sync is unavailable
 * (unit tests under Node, permission not yet granted, offline first run).
 *
 * See docs/migration-tiered-storage.md for the tier layout and migration flow.
 */

import { CONFIG } from "./config.js";

/** Sync key -> legacy localStorage key holding the same logical value. */
export const SYNC_TO_LOCAL = {
  [CONFIG.syncKeys.cities]: CONFIG.storageKey,
  [CONFIG.syncKeys.customCities]: CONFIG.customCitiesKey,
  [CONFIG.syncKeys.timePeriods]: CONFIG.timePeriodsKey,
  [CONFIG.syncKeys.language]: CONFIG.languageKey,
  [CONFIG.syncKeys.nowLineMode]: CONFIG.nowLineModeKey
};

function hasSync() {
  return !!(globalThis.chrome && globalThis.chrome.storage && globalThis.chrome.storage.sync);
}

/**
 * Surface quota / permission failures without breaking the UI. Consumers may
 * replace this hook to render an inline status line; the default is a warning.
 */
let onWriteError = (keys, err) => {
  console.warn("[TimeMapper] sync write failed for", Object.keys(keys || {}), err);
};

/** Synchronous localStorage read + JSON parse; null on missing/corrupt. */
function readLocalJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

export const Storage = {
  setWriteErrorHook(fn) {
    onWriteError = typeof fn === "function" ? fn : onWriteError;
  },

  isSyncAvailable() {
    return hasSync();
  },

  /**
   * Load the five synced values.
   * Resolution: sync store -> (one-time legacy migration, sentinel-guarded)
   * -> localStorage mirror -> undefined (caller applies defaults).
   * Returns { values, languagePreference }.
   */
  async loadSyncData() {
    const out = { values: {}, languagePreference: null };
    const keys = Object.values(CONFIG.syncKeys);
    let raw = {};
    if (hasSync()) {
      try {
        raw = (await chrome.storage.sync.get(keys)) || {};
      } catch (err) {
        onWriteError({}, err);
        raw = {};
      }
    }

    if (hasSync() && !raw[CONFIG.syncKeys.migratedAt]) {
      raw = await this._migrateLegacy(raw);
    }

    for (const syncKey of Object.keys(SYNC_TO_LOCAL)) {
      if (raw[syncKey] !== undefined) {
        out.values[syncKey] = raw[syncKey];
        continue;
      }
      const mirrored = readLocalJson(SYNC_TO_LOCAL[syncKey]);
      if (mirrored !== null) out.values[syncKey] = mirrored;
    }

    // "auto" is device-local and never synced; its marker lives only in localStorage.
    try {
      const pref = localStorage.getItem(CONFIG.languagePreferenceKey);
      if (pref && CONFIG.languagePreferenceValues.includes(pref)) {
        out.languagePreference = pref;
      }
    } catch { }
    return out;
  },

  /** Mirror to localStorage synchronously, queue the sync write. Fire-and-forget. */
  persist(localKey, syncKey, value) {
    try {
      localStorage.setItem(localKey, JSON.stringify(value));
    } catch { }
    if (syncKey && hasSync()) {
      chrome.storage.sync
        .set({ [syncKey]: value })
        .catch((err) => onWriteError({ [syncKey]: value }, err));
    }
  },

  /**
   * First run after upgrade: seed the sync store from legacy localStorage.
   * The sentinel is set even when nothing legacy exists, so this runs once.
   */
  async _migrateLegacy(raw) {
    const seeded = { [CONFIG.syncKeys.migratedAt]: Date.now() };
    const legacyPairs = [
      [CONFIG.syncKeys.cities, CONFIG.storageKey],
      [CONFIG.syncKeys.customCities, CONFIG.customCitiesKey],
      [CONFIG.syncKeys.timePeriods, CONFIG.timePeriodsKey],
      [CONFIG.syncKeys.nowLineMode, CONFIG.nowLineModeKey],
      [CONFIG.syncKeys.language, CONFIG.languageKey]
    ];
    for (const [syncKey, localKey] of legacyPairs) {
      if (raw[syncKey] !== undefined) continue;
      if (syncKey === CONFIG.syncKeys.language) {
        // Never seed "auto" into sync (DECIDED-1).
        const pref = (() => {
          try { return localStorage.getItem(CONFIG.languagePreferenceKey); } catch { return null; }
        })();
        if (pref === "auto") continue;
      }
      const value = readLocalJson(localKey);
      if (value !== null) seeded[syncKey] = value;
    }
    try {
      await chrome.storage.sync.set(seeded);
    } catch (err) {
      onWriteError(seeded, err);
    }
    return { ...raw, ...seeded };
  }
};

if (typeof globalThis !== "undefined") {
  globalThis.Storage = Storage;
}
