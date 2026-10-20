# Migration Plan: Tiered Storage & Hardened Sync (rev.2)

> rev.3 records the developer's decisions on all three open items; ready for
> implementation.
> rev.2 corrects the technical errors found in review against the current
> codebase (schema mismatch, quota model, sync-permission prompt, async
> migration scope, migration trigger, language/auto conflict, listener split).

## 1. Core principle: tiered storage

Sync the personal core settings via `chrome.storage.sync`; keep appearance and
zero-latency settings in `localStorage`.

| Data | Layer | Reason |
|---|---|---|
| `cities` (selected id list) | ☁️ `chrome.storage.sync` | Core user setting; tiny payload (≤10 id strings) |
| `customCities` | ☁️ `chrome.storage.sync` | User-added search results; schema see §2-C |
| `timePeriods` | ☁️ `chrome.storage.sync` | Personal schedule split |
| `language` | ☁️ `chrome.storage.sync` | Explicit choices only; see DECIDED-1 below |
| `nowLineMode` | ☁️ `chrome.storage.sync` | Now-line reference preference |
| `theme` | 💻 `localStorage` | 0 ms synchronous read in `<head>`; no FOUC |
| `mapSettings` | 💻 `localStorage` | Local-only; map calibration is device-bound |

**DECIDED-1 (2026-10-20) `language = "auto"` is never synced.** `auto` stays a
device-local preference (localStorage remains the source of truth for the
dropdown). Only explicit `zh`/`en`/`es` selections are written to sync and
applied on other devices (when that device's local preference is not `auto`).

## 2. Runtime rules

### Rule A — No paint before data (Anti-Layout-Shift)
- `State.init()` today is **synchronous** (`state.js:51`); after migration the
  load path becomes async. Chrome serves `storage.sync.get` from the local
  LevelDB cache (1–3 ms cold start, no network wait).
- The popup must not render default cities (tokyo/new-york) before the synced
  data arrives. One-shot render after load.
- **New first-paint state:** async load means the very first frame has no data.
  Render a neutral skeleton (fixed-height timeline placeholders, no default
  city rows) instead of an empty or default-content flash. Define the skeleton
  in popup HTML/CSS.

### Rule B — Direct writes (debounce removed)
- ~~250 ms debounce + beforeunload/pagehide flush~~ **REMOVED.**
- Correct quota model for `chrome.storage.sync`:
  `quotaBytesPerItem = 8 KB`, `quotaBytesTotal = 100 KB`,
  `quotaBytesPerMinute = 128 KB`, `quotaCallsPerMinute = 120` *requests*, and
  the rate quotas are **byte-based in practice for this app**. A city toggle
  writes ≈200 bytes; hitting 128 KB/min requires ≈600 writes/min — not a real
  user pattern for this UI.
- Debounce + pagehide flush introduced a genuine lost-update race (an `await`ed
  `set` started in `pagehide` is not guaranteed to complete before the popup
  tears down) to protect against a near-nonexistent risk.
- New rule: every mutation calls `chrome.storage.sync.set` immediately. Chrome
  merges sync traffic natively. Write failures (quota exceeded) must be caught
  and surfaced via the existing inline status line, never thrown.

### Rule C — Custom-city normalization (corrected schema)
- The stored custom-city schema in this codebase is
  `{ id, name, zone, x, y, lng, lat }` (`city-preview.js:404-412`), consumed by
  `State.loadCustomCities` (`state.js:148-168`), which **drops any entry whose
  `zone` is not a string** and uses `x`/`y` for map placement.
- Normalizer whitelist: keep all seven fields.
  - `name`: trim, truncate to 50 chars.
  - `lat`/`lng`: round to 4 decimals (<10 m error).
  - `x`/`y`: clamp to 0–100 (already produced by `MapUtils` callers, re-check on load).
  - `zone`: IANA string as returned by Open-Meteo (`result.timezone`), no rename.
- Size reality check: max 10 selected cities, but **definitions are never
  pruned today** — `toggleCity` deletes a definition only when re-toggle removes
  it. Long-term accumulation is the real risk, not 8 KB per-item overflow.
  Pruning unused definitions: **DECIDED-2 (2026-10-20) — delete on deselect.**
  `toggleCity` removing a custom city from the selection also deletes its
  definition; no orphan definitions accumulate.

### Rule D — Cross-page sync (split listeners explicitly)
- Sync keys (`cities`, `customCities`, `timePeriods`, `language`, `nowLineMode`):
  listen to `chrome.storage.onChanged` (area `sync`) in both popup and options;
  update in-memory `State` and re-render. The old `await State.init()`-style
  full reset must not clobber a page that is mid-edit.
- Local keys (`theme`, `mapSettings`): the existing `window.addEventListener("storage")`
  (`controller.js:64`, `theme.js:36`) **stays** — localStorage events still fire
  for these. After migration it no longer covers the five sync keys, hence (a).
- `chrome.storage.onChanged` fires only in other views of the same profile — no
  echo loop for the writing page.

### Rule E — Offline behavior
- `storage.sync` writes resolve locally while offline (native queue, browser
  resyncs later). No app-level interception.

## 3. Migration of legacy data

- **Sentinel key required.** `if (!data.cities)` is ambiguous: `loadSelection`
  falls back to `defaultSelection` on an empty array, so "user cleared every
  city" reads identical to "never migrated".
  Use a one-time flag: `migratedAt` in `chrome.storage.sync`, set atomically
  with the first migrated write. Skip migration when present.
- Flow: on first `loadSyncData()`, if `migratedAt` absent → read the five legacy
  localStorage keys (`worldTimeAligner*`, same names as today's `CONFIG.*Key`),
  normalize, `sync.set(migrated + { migratedAt: <timestamp> })`.
- Keep legacy localStorage keys for one release as rollback fuel; delete in a
  follow-up release, not in this migration.
- Multi-device note: a second device with an empty sync store will also run
  migration once (its own legacy data) — last write wins. Acceptable; document it.

## 4. Manifest & permissions

- `manifest.json` currently declares **no `permissions`**. Adding
  `"storage"` is a new-permission declaration: the Chrome Web Store update will
  prompt existing users to accept new permissions, and the extension is
  disabled until accepted. **DECIDED-3 (2026-10-20) — Option A: normal release.**
  Ship `"storage"` together with the sync feature so the prompt is immediately
  explained by the new cross-device syncing; update notes call it out.
  (One-time cost per user; `storage` is the mildest permission class.)

## 5. Async refactor scope (larger than rev.1 claimed)

`State.init()` and all load/save methods become async or split into
load-async / save-fire-and-forget. Every consumer of synchronous
`localStorage` state must be audited:

| File | Touchpoints |
|---|---|
| `src/shared/config.js` | `syncKeys`, `localKeys`, `legacyKeys`, `migratedAt` |
| `src/shared/storage.js` (new) | sync wrapper, migration, error → inline status line |
| `src/shared/state.js` | all `load*`/`save*`; normalizer; `onChanged` listener |
| `src/popup/controller.js` | `await State.init()` gate before first render; skeleton; **remove** the old sync-init call order; keep `storage` listener for local keys |
| `src/popup/renderer.js` | verify no direct `State.save*()` sync assumptions |
| `src/shared/city-preview.js` | add-city path writes via new storage (was `State.saveCustomCities` + `toggleCity`) |
| `src/shared/map-preview.js` | reads `State.mapSettings` (stays localStorage — unchanged) |
| `src/shared/timeline-preview.js` | period drag writes — verify call sites |
| `src/options/options.js` | period/city/lang/now-line saves; `onChanged` re-render |
| `manifest.json` | `"permissions": ["storage"]` |

## 6. Acceptance criteria (corrected)

1. **Toggle storm:** rapidly toggle 10 pins → each produces one `set` call; no
   errors, sync completes. (No debounce-merge expectation — rev.1 item 1 retired.)
2. **Close timing:** add a city and close the popup 100 ms later; reopening
   shows the city. Passes because writes are issued immediately, not via flush.
3. **Cold restart, no layout shift:** custom city survives full Chrome restart;
   popup shows skeleton ≤1 frame, then final list — no default-city flash.
4. **Normalizer:** long-named search city stores `{id, name≤50, zone, x, y,
   lat/lng 4dp}` in sync; `zone` preserved; reload renders the city on map at
   correct `x, y`.
5. **Legacy migration:** seed `worldTimeAlignerCities` etc. in localStorage,
   clear sync; reopen → data appears in sync with `migratedAt` set; second
   launch does not re-migrate.
6. **Cross-page:** popup + options open simultaneously; change a period in
   options → popup re-renders via `onChanged` without reload.
7. **Quota guard:** simulate `quotaBytesPerItem` overflow → inline status
   message, no uncaught rejection, UI keeps working.
