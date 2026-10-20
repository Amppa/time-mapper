/**
 * TimeMapper - Tests: chrome.storage.sync double
 *
 * Shared by the storage and scenario suites. Records every get/set so tests
 * can assert write counts (e.g. the migration must issue exactly one write).
 */

export function installMockChrome(initial = {}) {
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
      },
      onChanged: { addListener() { } }
    }
  };
  return {
    data,
    calls,
    setCalls: () => calls.filter(([op]) => op === "set"),
    restore() { delete globalThis.chrome; }
  };
}
