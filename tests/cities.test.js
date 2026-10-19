/**
 * TimeMapper - Tests: city catalog integrity
 *
 * The catalog is hand-maintained data, so these tests are the guard against
 * typos, out-of-range coordinates, dead IANA zones and missing translations.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/shared/config.js";
import { cityCatalog } from "../src/shared/cities.js";
import { i18nCityNames } from "../src/shared/i18n.js";
import { TimeUtils } from "../src/shared/utils.js";

const RESERVED_IDS = new Set(["local"]);
const CUSTOM_ID_PREFIX = "custom-";

describe("cityCatalog schema", () => {
  it("is a non-empty array", () => {
    assert.ok(Array.isArray(cityCatalog));
    assert.ok(cityCatalog.length > 0);
  });

  it("gives every entry a non-empty string id", () => {
    for (const city of cityCatalog) {
      assert.equal(typeof city.id, "string", `id must be a string: ${JSON.stringify(city)}`);
      assert.notEqual(city.id.trim(), "", `id must not be blank: ${JSON.stringify(city)}`);
    }
  });

  it("gives every entry a non-empty string zone", () => {
    for (const city of cityCatalog) {
      assert.equal(typeof city.zone, "string", `zone must be a string: ${city.id}`);
      assert.notEqual(city.zone.trim(), "", `zone must not be blank: ${city.id}`);
    }
  });

  it("gives every entry numeric lng/lat", () => {
    for (const city of cityCatalog) {
      assert.equal(typeof city.lng, "number", `lng must be a number: ${city.id}`);
      assert.equal(typeof city.lat, "number", `lat must be a number: ${city.id}`);
      assert.ok(Number.isFinite(city.lng), `lng must be finite: ${city.id}`);
      assert.ok(Number.isFinite(city.lat), `lat must be finite: ${city.id}`);
    }
  });
});

describe("cityCatalog coordinates", () => {
  it("keeps longitude within [-180, 180]", () => {
    for (const city of cityCatalog) {
      assert.ok(city.lng >= -180 && city.lng <= 180, `lng out of range: ${city.id} = ${city.lng}`);
    }
  });

  it("keeps latitude within [-90, 90]", () => {
    for (const city of cityCatalog) {
      assert.ok(city.lat >= -90 && city.lat <= 90, `lat out of range: ${city.id} = ${city.lat}`);
    }
  });

  it("does not place any city exactly on a pole", () => {
    for (const city of cityCatalog) {
      assert.ok(Math.abs(city.lat) !== 90, `city sits on a pole: ${city.id}`);
    }
  });
});

describe("cityCatalog timezones", () => {
  it("only uses zones the runtime can format", () => {
    for (const city of cityCatalog) {
      assert.doesNotThrow(
        () => new Intl.DateTimeFormat("en-US", { timeZone: city.zone }),
        `unknown IANA time zone: ${city.id} -> ${city.zone}`
      );
    }
  });

  it("uses the Area/Location shape", () => {
    for (const city of cityCatalog) {
      assert.match(city.zone, /^[A-Za-z_]+\/[A-Za-z_]+(\/[A-Za-z_]+)?$/, `unexpected zone shape: ${city.id} -> ${city.zone}`);
    }
  });

  it("is accepted by TimeUtils.isValidZone", () => {
    for (const city of cityCatalog) {
      assert.equal(TimeUtils.isValidZone(city.zone), true, `zone rejected by TimeUtils: ${city.id}`);
    }
  });
});

describe("cityCatalog identifiers", () => {
  it("has no duplicate ids", () => {
    const seen = new Set();
    const duplicates = [];
    for (const city of cityCatalog) {
      if (seen.has(city.id)) duplicates.push(city.id);
      seen.add(city.id);
    }
    assert.deepEqual(duplicates, [], `duplicate ids: ${duplicates.join(", ")}`);
  });

  it("keeps ids URL- and CSS-safe", () => {
    for (const city of cityCatalog) {
      assert.match(city.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `unusable id: ${city.id}`);
    }
  });

  it("never uses a reserved id", () => {
    for (const city of cityCatalog) {
      assert.equal(RESERVED_IDS.has(city.id), false, `reserved id in catalog: ${city.id}`);
      assert.equal(city.id.startsWith(CUSTOM_ID_PREFIX), false, `${CUSTOM_ID_PREFIX} is reserved for user cities: ${city.id}`);
    }
  });
});

describe("cityCatalog translations", () => {
  for (const lang of CONFIG.supportedLanguages) {
    it(`names every city in "${lang}"`, () => {
      const names = i18nCityNames[lang];
      assert.ok(names, `missing dictionary for "${lang}"`);
      const missing = cityCatalog
        .filter((city) => typeof names[city.id] !== "string" || names[city.id].trim() === "")
        .map((city) => city.id);
      assert.deepEqual(missing, [], `missing ${lang} names`);
    });
  }
});