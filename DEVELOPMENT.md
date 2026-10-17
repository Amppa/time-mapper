# DEVELOPMENT.md — Engineering Workflows & Runbook

## 1. Quick Runbook

```bash
# Verify i18n and dictionary consistency (must pass before commit)
node tools/check-i18n.mjs
```

### Local Extension Loading
- Chrome: `chrome://extensions/` → Enable **Developer mode** → **Load unpacked** (select root).
- Reload extension after code changes.

---

## 2. Core Architectural Rules

- **Zero-Build Architecture**: Runs plain browser scripts via `<script>` tags in `popup.html` and `options.html`. No bundler. Respect script loading order.
- **State & Limits**:
  - `CONFIG` (`src/shared/config.js`) holds single source of truth for defaults.
  - City limit is fixed at 10 (`CONFIG.maxCities = 10`), non-FIFO (blocks further additions when full).
  - Synchronous preference cache in `localStorage` prevents theme/language flashes.
- **UI & Design Tokens**:
  - Settings rows strictly follow `.control-group` (`.control-label` 16px / font-weight 500, `.control-desc` 14px).
  - Explicit `<div class="divider"></div>` maintains 12px (`var(--space-md)`) margin above and below.
- **i18n Integrity**:
  - Supported: `zh` (zh-TW), `en` (en-US), `es` (es-ES).
  - HTML `data-i18n*` keys must exist across all 3 languages in `src/shared/i18n.js`.
- **MV3 Security**:
  - No inline HTML handlers (`onclick="..."`). Use `addEventListener`.
  - No unescaped `innerHTML`. Use `EscapeUtils.html` or `textContent`.

---

## 3. Feature Checklist

When adding a new setting or feature:
1. [ ] **Config / State**: Register key & default in `src/shared/config.js`, handle persistence in `state.js`.
2. [ ] **i18n**: Add strings for `zh`, `en`, and `es` in `src/shared/i18n.js`.
3. [ ] **UI**: Add `.control-group` row in `options.html` (and `popup.html` if exposed).
4. [ ] **Verification**: Run `node tools/check-i18n.mjs` (0 failures).

---

## 4. Known Issues & Tech Debt
- *(None currently)*
