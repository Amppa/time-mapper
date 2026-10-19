/**
 * TimeMapper - Tests: in-memory localStorage polyfill
 *
 * Implements just enough of the Web Storage API for the shared modules under
 * Node. Installing it replaces `globalThis.localStorage`; `uninstallMockStorage`
 * restores the previous value so test files stay isolated from one another.
 */

export function installMockStorage() {
  const store = new Map();
  const mock = {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
    clear() { store.clear(); },
    get length() { return store.size; },
    key(index) { return Array.from(store.keys())[index] ?? null; }
  };
  const previous = globalThis.localStorage;
  globalThis.localStorage = mock;
  mock.restore = () => {
    if (previous === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = previous;
    }
  };
  return mock;
}

export function uninstallMockStorage(mock) {
  if (mock && typeof mock.restore === "function") {
    mock.restore();
  } else {
    delete globalThis.localStorage;
  }
}