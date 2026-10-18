/**
 * TimeMapper - i18n consistency check
 *
 * Usage:  node tools/check-i18n.mjs
 *
 * Run this after adding a UI string, a language, or a city. The dictionaries in
 * src/shared/i18n.js are hand-maintained parallel copies, and a gap in one of
 * them is invisible at runtime: I18nUtils.applyAttributes() logs a warning and
 * falls back to whatever text is hard-coded in the HTML, which is usually a
 * different language. This script turns that into a build-time failure.
 *
 * Exits non-zero if anything is missing or mismatched.
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const ROOT = path.dirname(path.dirname(url.fileURLToPath(import.meta.url)));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

import { cityCatalog } from "../src/shared/cities.js";
import { CONFIG } from "../src/shared/config.js";
import { i18nTranslations, i18nCityNames } from "../src/shared/i18n.js";

let failures = 0;
let warnings = 0;
const fail = (m) => { failures++; console.log(`  FAIL  ${m}`); };
const warn = (m) => { warnings++; console.log(`  warn  ${m}`); };
const ok = (m) => console.log(`  ok    ${m}`);

const keys = (o) => Object.keys(o).sort();
const missingFrom = (a, b) => a.filter((x) => !b.includes(x));
const symDiff = (a, b) => [...missingFrom(a, b), ...missingFrom(b, a)];

const uiLangs = keys(i18nTranslations);
const cityLangs = keys(i18nCityNames);
const catalogs = ["src/popup/popup.html", "src/options/options.html"];

console.log(`\n=== 1. every language covers every UI string (${uiLangs.join(", ")}) ===`);
const refKeys = keys(i18nTranslations[uiLangs[0]]);
for (const lang of uiLangs) {
  const gap = symDiff(refKeys, keys(i18nTranslations[lang]));
  if (gap.length) fail(`${lang} differs from ${uiLangs[0]} on ${gap.length} key(s): ${gap.join(", ")}`);
  else ok(`${lang}: ${refKeys.length} keys`);
}
for (const [lang, dict] of Object.entries(i18nTranslations)) {
  const empty = Object.entries(dict).filter(([, v]) => typeof v !== "string" || !v.trim()).map(([k]) => k);
  if (empty.length) fail(`${lang} has empty values: ${empty.join(", ")}`);
}

console.log("\n=== 2. every key used in HTML exists in every dictionary ===");
const usedKeys = new Set();
for (const file of catalogs) {
  const found = [...read(file).matchAll(/data-i18n[a-z-]*="([^"]+)"/g)].map((m) => m[1]);
  found.forEach((k) => usedKeys.add(k));
}
for (const lang of uiLangs) {
  const absent = [...usedKeys].filter((k) => !(k in i18nTranslations[lang]));
  if (absent.length) fail(`${lang} cannot resolve ${absent.length} key(s) used in HTML: ${absent.join(", ")}`);
}
if (uiLangs.every((l) => [...usedKeys].every((k) => k in i18nTranslations[l]))) {
  ok(`${usedKeys.size} distinct keys used in HTML resolve in all ${uiLangs.length} languages`);
}
// {name} is interpolated by I18nUtils.getTranslation; a translation that drops it breaks the label.
for (const lang of uiLangs) {
  for (const key of ["removeCity", "selectCity"]) {
    const v = i18nTranslations[lang][key];
    if (typeof v === "string" && !v.includes("{name}")) fail(`${lang}.${key} lost the {name} placeholder: "${v}"`);
  }
}
ok("{name} placeholder intact");

console.log("\n=== 3. city names cover cityCatalog ===");
const catalogIds = cityCatalog.map((c) => c.id);
for (const lang of cityLangs) {
  const gap = symDiff(catalogIds, keys(i18nCityNames[lang]));
  const empty = Object.entries(i18nCityNames[lang]).filter(([, v]) => typeof v !== "string" || !v.trim()).map(([k]) => k);
  if (gap.length) fail(`${lang} mismatched against cityCatalog (${catalogIds.length} ids): ${gap.join(", ")}`);
  if (empty.length) fail(`${lang} has empty city names: ${empty.join(", ")}`);
  if (!gap.length && !empty.length) ok(`${lang}: ${catalogIds.length} names`);
}
if (uiLangs.join() !== cityLangs.join()) fail(`UI languages [${uiLangs}] and city-name languages [${cityLangs}] disagree`);

console.log("\n=== 4. language plumbing agrees across config, dictionaries and options page ===");
const buttons = [...read("src/options/options.html").matchAll(/data-lang-value="([^"]+)"/g)].map((m) => m[1]).filter((v) => v !== "auto");
const want = [
  ["CONFIG.supportedLanguages", CONFIG.supportedLanguages],
  ["i18nTranslations blocks", uiLangs],
  ["i18nCityNames blocks", cityLangs],
  ["options.html language options (auto excluded)", buttons],
  ["CONFIG.localeMap keys", Object.keys(CONFIG.localeMap).sort()]
];
const norm = (a) => [...new Set(a)].sort().join(",");
for (const [name, list] of want) {
  if (!Array.isArray(list) || !list.length) { fail(`${name} is missing or empty`); continue; }
  if (norm(list) === norm(CONFIG.supportedLanguages)) ok(`${name}: ${norm(list).replace(/,/g, ", ")}`);
  else fail(`${name} is [${norm(list)}] but supportedLanguages is [${norm(CONFIG.supportedLanguages)}]`);
}
for (const lang of CONFIG.supportedLanguages) {
  if (!CONFIG.localeMap[lang]) { fail(`localeMap has no entry for "${lang}"`); continue; }
  try {
    new Intl.DateTimeFormat(CONFIG.localeMap[lang], { hour: "2-digit", hour12: false }).format(new Date());
    ok(`${lang} -> ${CONFIG.localeMap[lang]} is a usable Intl locale`);
  } catch (e) { fail(`localeMap["${lang}"] = "${CONFIG.localeMap[lang]}" invalid: ${e.message}`); }
}

console.log("\n=== 5. _locales catalogs back the manifest placeholders ===");
const manifest = JSON.parse(read("manifest.json"));
const folders = fs.readdirSync(path.join(ROOT, "_locales")).sort();
if (!folders.includes(manifest.default_locale)) {
  fail(`manifest default_locale "${manifest.default_locale}" has no _locales/${manifest.default_locale} folder`);
}
const msgKeys = {};
for (const folder of folders) {
  const file = `_locales/${folder}/messages.json`;
  if (!fs.existsSync(path.join(ROOT, file))) { fail(`${folder}: no messages.json`); continue; }
  let json;
  try { json = JSON.parse(read(file)); } catch (e) { fail(`${folder}: invalid JSON - ${e.message}`); continue; }
  msgKeys[folder] = keys(json);
  for (const [k, v] of Object.entries(json)) {
    if (!v || typeof v.message !== "string" || !v.message.trim()) fail(`${folder}.${k}: missing or empty "message"`);
  }
}
const msgRef = msgKeys[manifest.default_locale] || [];
for (const [folder, ks] of Object.entries(msgKeys)) {
  const gap = symDiff(msgRef, ks);
  if (gap.length) fail(`${folder} differs from ${manifest.default_locale} on: ${gap.join(", ")}`);
  else ok(`${folder}: ${ks.length} message(s)`);
}
for (const value of Object.values(manifest)) {
  const m = /__MSG_(\w+)__/.exec(String(value));
  if (m && !msgRef.includes(m[1])) fail(`manifest references __MSG_${m[1]}__ but ${manifest.default_locale} does not define it`);
}
ok("manifest __MSG_*__ placeholders resolve");

console.log("\n=== 6. dictionary keys still referenced somewhere ===");
// Keys with no consumer are how stale entries survive; reported, not fatal,
// because a key can also be read dynamically via I18nUtils.getTranslation(expr).
const jsSources = ["src/popup/controller.js", "src/popup/renderer.js", "src/options/options.js", "src/shared/utils.js", "src/shared/map-preview.js", "src/shared/timeline-preview.js", "src/shared/city-preview.js"];
const literalUses = new Set(usedKeys);
for (const f of jsSources) {
  for (const m of read(f).matchAll(/getTranslation\(\s*"([^"]+)"/g)) literalUses.add(m[1]);
}
for (const lang of uiLangs) {
  const unused = keys(i18nTranslations[lang]).filter((k) => !literalUses.has(k));
  if (unused.length) warn(`${lang} has ${unused.length} key(s) no HTML or literal JS reads: ${unused.join(", ")}`);
}
if (!warnings) ok("every dictionary key has a consumer");

console.log("\n=========================================");
if (failures) console.log(`${failures} FAILURE(S), ${warnings} warning(s)`);
else console.log(`PASSED (${warnings} warning(s))`);
console.log("=========================================\n");
process.exit(failures ? 1 : 0);
