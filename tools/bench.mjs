/**
 * TimeMapper - Hot Path Benchmarks
 *
 * Guards the pure computation paths that run on every render: night-area
 * geometry, map projection, state lookup and innerHTML templating. No browser
 * and no dependency - this measures arithmetic and object churn, which is what
 * a refactor is most likely to regress silently.
 *
 * What it deliberately does NOT cover: DOM insertion, style recalculation and
 * paint. Those need tools/profile-popup.mjs.
 *
 * A threshold breach means an algorithmic change, not a slow machine. Each
 * limit sits roughly two orders of magnitude above the measured cost so that
 * ordinary CPU variance never trips the gate.
 */

import os from "node:os";
import { State } from "../src/shared/state.js";
import { MapPreview } from "../src/shared/map-preview.js";
import { EscapeUtils, MapUtils, TimeUtils, TimelineUtils } from "../src/shared/utils.js";

/* ------------------------------------------------------------------ *
 * Minimal environment: State.init() reads localStorage.
 * ------------------------------------------------------------------ */
function installStorageStub() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
}

const MS = (n) => n.toFixed(4);

/**
 * @param {string} label
 * @param {Function} fn            measured workload, run `iters` times per sample
 * @param {object} opts
 * @param {number} opts.iters      calls per sample
 * @param {number} opts.budgetMs   per-call budget; this is the gate
 * @param {number} [opts.samples]  samples to take the median of
 */
function bench(label, fn, { iters, budgetMs, samples = 7 }) {
  // Warm up so JIT tiering and formatter caches stay out of the measurement.
  for (let i = 0; i < Math.min(iters, 200); i++) fn();

  const timings = [];
  for (let s = 0; s < samples; s++) {
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < iters; i++) fn();
    timings.push(Number(process.hrtime.bigint() - t0) / 1e6 / iters);
  }
  timings.sort((a, b) => a - b);

  const median = timings[timings.length >> 1];
  return { label, median, worst: timings[timings.length - 1], budgetMs, ok: median <= budgetMs };
}

function run() {
  installStorageStub();
  State.init();

  const cities = State.allCities();
  const N = cities.length;
  const now = new Date();
  const subsolar = MapUtils.subsolarLng(now);
  const htmlSamples = [
    '<span class="city">Taipei</span>',
    "a & b < c > d \" e ' f",
    "x".repeat(256)
  ];

  const suites = {
    State: [
      bench("init() full state reload", () => State.init(), { iters: 200, budgetMs: 10 }),
      bench("allCities() list build", () => State.allCities(), { iters: 5000, budgetMs: 0.2 }),
      bench(`findCity() x${N} linear lookup`, () => {
        for (const c of cities) State.findCity(c.id);
      }, { iters: 200, budgetMs: 5 })
    ],

    "Night area": [
      bench("calcNightPoints() terminator polyline", () => MapPreview.calcNightPoints(0), { iters: 1000, budgetMs: 2 }),
      bench(`isCityInNight() x${N} per pin`, () => {
        for (const c of cities) MapPreview.isCityInNight(c, 0, subsolar);
      }, { iters: 200, budgetMs: 5 })
    ],

    "Map projection": [
      // mapPosition memoises _cx/_cy onto the city object, so the cold path has
      // to build throwaway cities to be measured at all.
      bench(`mapPosition() x${N} cold`, () => {
        for (const c of cities) MapUtils.mapPosition({ lng: c.lng, lat: c.lat });
      }, { iters: 200, budgetMs: 5 }),
      bench(`mapPosition() x${N} memoised`, () => {
        for (const c of cities) MapUtils.mapPosition(c);
      }, { iters: 200, budgetMs: 2 }),
      bench("calibrateX/Y round trip x1000", () => {
        for (let i = 0; i < 1000; i++) {
          MapUtils.uncalibrateX(MapUtils.calibrateX(i % 101));
          MapUtils.uncalibrateY(MapUtils.calibrateY(i % 101));
        }
      }, { iters: 20, budgetMs: 5 }),
      bench("subsolarLng()", () => MapUtils.subsolarLng(now), { iters: 20000, budgetMs: 0.05 })
    ],

    Formatting: [
      bench("html() escape x1000", () => {
        for (let i = 0; i < 1000; i++) EscapeUtils.html(htmlSamples[i % htmlSamples.length]);
      }, { iters: 20, budgetMs: 5 }),
      bench("getNowFraction() day fraction", () => TimelineUtils.getNowFraction(), { iters: 2000, budgetMs: 1 }),
      bench("resolveZone() cached", () => TimeUtils.resolveZone("Asia/Taipei"), { iters: 20000, budgetMs: 0.05 })
    ]
  };

  const rows = [];
  for (const [group, benches] of Object.entries(suites)) {
    for (const b of benches) rows.push({ group, ...b });
  }

  console.log("\n=== TimeMapper hot path benchmarks ===");
  console.log(`catalog: ${N} cities | ${process.version} | ${os.cpus().length} cpus\n`);

  console.table(rows.map((r) => ({
    group: r.group,
    benchmark: r.label,
    "ms/call": MS(r.median),
    worst: MS(r.worst),
    budget: MS(r.budgetMs),
    result: r.ok ? "ok" : "OVER BUDGET"
  })));

  const failures = rows.filter((r) => !r.ok);
  console.log("======================================");
  if (failures.length) {
    for (const f of failures) {
      console.log(`  OVER  ${f.label}: ${MS(f.median)} ms/call exceeds the ${MS(f.budgetMs)} ms budget`);
    }
    console.log(`FAILED (${failures.length} of ${rows.length} over budget)\n`);
    process.exitCode = 1;
  } else {
    const slowest = rows.reduce((a, b) => (a.median > b.median ? a : b));
    console.log(`PASSED (${rows.length} benchmarks, slowest ${slowest.label} at ${MS(slowest.median)} ms/call)\n`);
  }
  console.log("======================================\n");
}

run();