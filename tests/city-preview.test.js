/**
 * TimeMapper - Tests: city search status line
 *
 * The search feedback is a single quiet line, not a dialog: it must hide
 * itself when there is nothing to report and mark failures distinctly.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { State } from "../src/shared/state.js";
import { CityPreview } from "../src/shared/city-preview.js";
import { installMockStorage, uninstallMockStorage } from "./helpers/mock-storage.js";

function makeStatusElement() {
  const classes = new Set();
  return {
    textContent: "",
    hidden: true,
    classList: {
      toggle: (name, on) => { if (on) classes.add(name); else classes.delete(name); },
      contains: (name) => classes.has(name)
    }
  };
}

let storage;

beforeEach(() => {
  storage = installMockStorage();
  State.init();
});

afterEach(() => {
  uninstallMockStorage(storage);
});

describe("CityPreview.setSearchStatus", () => {
  it("hides the line when there is no message", () => {
    const refs = { searchStatus: makeStatusElement() };
    CityPreview.setSearchStatus(refs, "boom", true);
    CityPreview.setSearchStatus(refs, "");
    assert.equal(refs.searchStatus.hidden, true);
    assert.equal(refs.searchStatus.textContent, "");
    assert.equal(refs.searchStatus.classList.contains("is-error"), false);
  });

  it("shows a failure message with the error style", () => {
    const refs = { searchStatus: makeStatusElement() };
    CityPreview.setSearchStatus(refs, "City not found", true);
    assert.equal(refs.searchStatus.hidden, false);
    assert.equal(refs.searchStatus.classList.contains("is-error"), true);
  });

  it("leaves a non-error message unstylised", () => {
    const refs = { searchStatus: makeStatusElement() };
    CityPreview.setSearchStatus(refs, "hello", false);
    assert.equal(refs.searchStatus.hidden, false);
    assert.equal(refs.searchStatus.classList.contains("is-error"), false);
  });

  it("does nothing when the page has no status element", () => {
    assert.doesNotThrow(() => CityPreview.setSearchStatus({}, "boom", true));
  });
});
