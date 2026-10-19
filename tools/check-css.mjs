/**
 * TimeMapper - CSS Integrity Checker
 *
 * Static counterpart to check-i18n.mjs. Three checks:
 *
 *   1. every var(--x) reference resolves inside the CSS a page actually loads
 *   2. CSS class/id selectors have a consumer in HTML or JS   (warning only)
 *   3. no verbatim duplicate rule blocks                     (warning only)
 *
 * Check 1 is page-aware on purpose. A repo-wide scan cannot see that
 * options.css uses --scroll-thumb while only popup/settings.css defines
 * it, because options.html never links settings.css. Scope every lookup to
 * the stylesheet set of the page that needs it.
 *
 * Checks 2 and 3 warn rather than fail: vendor pseudo-elements never appear
 * in markup, and classes can be built at runtime by string concatenation.
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const ROOT = path.dirname(path.dirname(url.fileURLToPath(import.meta.url)));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

let failures = 0;
let warnings = 0;
const fail = (m) => { failures++; console.log(`  FAIL  ${m}`); };
const warn = (m) => { warnings++; console.log(`  warn  ${m}`); };
const ok = (m) => console.log(`  ok    ${m}`);

/* ------------------------------------------------------------------ *
 * Minimal CSS parser: native nesting + @media, no dependencies.
 * ------------------------------------------------------------------ */
const SKIP_BODY_AT = new Set([
  "keyframes", "-webkit-keyframes", "font-face", "property", "page",
  "counter-style", "font-feature-values", "viewport", "charset", "import"
]);

function parseCss(text) {
  const rules = [];
  let i = 0;
  const n = text.length;

  const skipWs = () => {
    for (;;) {
      const c = text[i];
      if (c === " " || c === "\n" || c === "\t" || c === "\r") i++;
      else if (c === "/" && text[i + 1] === "*") {
        i += 2;
        while (i < n && !(text[i] === "*" && text[i + 1] === "/")) i++;
        i += 2;
      } else break;
    }
  };

  // Reads up to the first `stops` character at paren/bracket depth 0.
  const readPrelude = (stops) => {
    let out = "";
    let depth = 0;
    while (i < n) {
      const c = text[i];
      if (c === "/" && text[i + 1] === "*") {
        i += 2;
        while (i < n && !(text[i] === "*" && text[i + 1] === "/")) i++;
        i += 2;
        continue;
      }
      if (c === '"' || c === "'") {
        const quote = c;
        out += c;
        i++;
        while (i < n && text[i] !== quote) {
          if (text[i] === "\\") { out += text[i]; i++; }
          out += text[i];
          i++;
        }
        out += text[i];
        i++;
        continue;
      }
      if (c === "(" || c === "[") depth++;
      if (c === ")" || c === "]") depth--;
      if (depth === 0 && stops.includes(c)) break;
      out += c;
      i++;
    }
    return out;
  };

  function parseBody(atStack, parentSel, sink) {
    const decls = sink || [];
    for (;;) {
      skipWs();
      if (i >= n) break;
      if (text[i] === "}") { i++; break; }
      const prelude = readPrelude("{};");
      const term = text[i];
      if (term === "{") {
        i++;
        const p = prelude.trim();
        if (p.startsWith("@")) {
          const name = (p.split(/[\s(]/)[1] || "").toLowerCase();
          if (SKIP_BODY_AT.has(name)) {
            readPrelude("}");
            i++;
          } else {
            parseBody(atStack.concat([p]), null, decls);
          }
          continue;
        }
        const resolved = parentSel
          ? (p.includes("&") ? p.replace(/&/g, parentSel) : `${parentSel} ${p}`)
          : p;
        const rule = { at: atStack.slice(), sel: resolved, decls: [], offset: i };
        rules.push(rule);
        const own = [];
        parseBody(atStack, resolved, own);
        rule.decls = own;
        continue;
      }
      if (term === ";") i++;
      const decl = prelude.trim();
      const colon = decl.indexOf(":");
      if (colon > 0) {
        decls.push({ prop: decl.slice(0, colon).trim(), value: decl.slice(colon + 1).trim() });
      }
    }
  }

  parseBody([], null, null);
  return rules;
}

/* ------------------------------------------------------------------ *
 * Selector keys
 * ------------------------------------------------------------------ */
// Functional pseudos whose arguments contain further selectors.
const FUNCTIONAL = new Set([
  "not", "is", "where", "has", "matches", "any",
  "nth-child", "nth-of-type", "nth-last-child", "nth-last-of-type", "dir", "lang"
]);
// Structural / state pseudos that need no markup counterpart.
const STATE = new Set([
  "hover", "focus", "focus-visible", "focus-within", "active", "checked", "indeterminate",
  "disabled", "enabled", "required", "optional", "valid", "invalid", "in-range", "out-of-range",
  "read-only", "read-write", "placeholder-shown", "default", "target", "visited", "link",
  "first-child", "last-child", "only-child", "first-of-type", "last-of-type", "only-of-type",
  "empty", "root", "backdrop", "marker", "selection", "placeholder", "part", "slotted",
  "file-selector-button", "scroll-marker", "scroll-button", "view-transition",
  "fullscreen", "modal", "open", "popover-open", "defined", "host", "scope"
]);
// Tag names generic enough that a consumer is always assumed.
const GENERIC_TAGS = new Set([
  "html", "body", "a", "button", "input", "select", "option", "optgroup", "details",
  "summary", "svg", "path", "img", "label", "span", "div", "output", "fieldset",
  "legend", "meter", "progress", "dialog", "form", "table"
]);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function selectorKeys(sel, out = []) {
  // Recurse into functional pseudo arguments before stripping them.
  for (const fn of FUNCTIONAL) {
    const re = new RegExp(`:${fn}\\(([^()]|\\([^()]*\\))*\\)`, "g");
    let m;
    while ((m = re.exec(sel))) selectorKeys(m[1], out);
  }
  const bare = sel.replace(/:[a-zA-Z-]+\(([^()]|\\([^()]*\\))*\)/g, " ");
  const re = /\.(-?[_a-zA-Z][\w-]*)|#(-?[_a-zA-Z][\w-]*)|(-{0,2}[a-zA-Z][\w-]*)(?![\w-])|\[([\w-]+)|(^|[\s>+~,(])([a-zA-Z][\w-]*)/g;
  let m;
  while ((m = re.exec(bare))) {
    if (m[1]) out.push(["class", m[1]]);
    else if (m[2]) out.push(["id", m[2]]);
    else if (m[3]) {
      // Vendor pseudo-elements (::-webkit-*, ::-moz-*) are browser internals:
      // they never appear in markup and must not count against a rule.
      if (m[3].startsWith("-")) continue;
      if (STATE.has(m[3])) continue;
      out.push(["pseudo", m[3]]);
    } else if (m[4]) {
      if (STATE.has(m[4])) continue;
      out.push(["attr", m[4]]);
    } else if (m[6]) {
      if (GENERIC_TAGS.has(m[6])) continue;
      out.push(["tag", m[6]]);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Load every stylesheet and every HTML page
 * ------------------------------------------------------------------ */
const cssFiles = [];
const htmlFiles = [];
const jsFiles = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith(".css")) cssFiles.push(path.relative(ROOT, p).replace(/\\/g, "/"));
    else if (entry.name.endsWith(".html")) htmlFiles.push(path.relative(ROOT, p).replace(/\\/g, "/"));
    else if (entry.name.endsWith(".js")) jsFiles.push(path.relative(ROOT, p).replace(/\\/g, "/"));
  }
})(path.join(ROOT, "src"));

const parsed = new Map();
for (const f of cssFiles) {
  const text = read(f);
  parsed.set(f, { text, rules: parseCss(text) });
}

// Markup + script text, used as the consumer index for check 2.
const consumerBlob = [...htmlFiles, ...jsFiles].map((f) => read(f)).join("\n");
const consumerCache = new Map();
/** True when `name` appears as a class/id/tag name, a data-* attribute, or its
 *  dataset.* property. */
function hasConsumer(name) {
  if (consumerCache.has(name)) return consumerCache.get(name);
  const variants = [escapeRe(name)];
  if (name.startsWith("data-")) {
    variants.push(escapeRe(`dataset.${name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())}`));
  }
  const re = new RegExp(`(^|[^\\w-])(${variants.join("|")})([^\\w-]|$)`);
  const hit = re.test(consumerBlob);
  consumerCache.set(name, hit);
  return hit;
}

/* ================================================================== *
 * 1. var() references resolve within the page's own stylesheet set
 * ================================================================== */
console.log("\n=== 1. every var() resolves in the page that uses it ===");

const pages = htmlFiles.map((page) => {
  const dir = path.posix.dirname(page);
  const links = [...read(page).matchAll(/<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"/g)]
    .map((m) => path.posix.normalize(path.posix.join(dir, m[1])))
    .filter((href) => cssFiles.includes(href));
  return { page, links };
});

for (const { page, links } of pages) {
  const defined = new Set();
  const referenced = new Map(); // var name -> [locations]

  for (const href of links) {
    const { text, rules } = parsed.get(href);
    for (const rule of rules) {
      for (const d of rule.decls) {
        const line = text.slice(0, rule.offset).split("\n").length;
        if (d.prop.startsWith("--")) defined.add(d.prop);
        for (const m of d.value.matchAll(/var\(\s*(--[\w-]+)(\s*,)?/g)) {
          // A fallback makes an unresolved reference degrade instead of break.
          if (m[2]) continue;
          if (!referenced.has(m[1])) referenced.set(m[1], []);
          referenced.get(m[1]).push(`${href}:${line}`);
        }
      }
    }
  }

  const unresolved = [...referenced].filter(([name]) => !defined.has(name));
  if (unresolved.length) {
    for (const [name, where] of unresolved) {
      fail(`${page}: var(${name}) is never defined by its stylesheets [${where.join(", ")}]`);
    }
  } else {
    ok(`${page}: ${referenced.size} var() reference(s) resolve across ${links.length} stylesheet(s)`);
  }
}

/* ================================================================== *
 * 2. CSS selectors have a consumer  (warning)
 * ================================================================== */
console.log("\n=== 2. CSS selectors with no HTML/JS consumer ===");

const orphanSelectors = [];
for (const f of cssFiles) {
  const { text, rules } = parsed.get(f);
  for (const rule of rules) {
    if (!rule.decls.length) continue;
    const keys = [...new Map(selectorKeys(rule.sel).map((k) => [k.join(":"), k])).values()];
    if (!keys.length) continue;
    // A descendant chain only matches when every compound part does, so all
    // keys must have a consumer. `.current-cities-container h4` is dead even
    // though `.current-cities-container` is very much alive.
    if (keys.every(([, name]) => hasConsumer(name))) continue;
    orphanSelectors.push(`${f}:${text.slice(0, rule.offset).split("\n").length}  ${rule.sel}`);
  }
}
if (orphanSelectors.length) {
  for (const s of orphanSelectors) warn(s);
  warn(`${orphanSelectors.length} selector(s) look unreachable; confirm before deleting`);
} else {
  ok("every CSS selector has a consumer in HTML or JS");
}

/* ================================================================== *
 * 3. Verbatim duplicate rule blocks  (warning)
 * ================================================================== */
console.log("\n=== 3. verbatim duplicate rule blocks ===");

const blocks = new Map();
for (const f of cssFiles) {
  const { text, rules } = parsed.get(f);
  for (const rule of rules) {
    if (!rule.decls.length) continue;
    const declText = rule.decls.map((d) => `${d.prop}:${d.value}`).join(";");
    if (!declText) continue;
    const sig = `${rule.at.join(" && ")}|${rule.sel}|${declText}`;
    if (!blocks.has(sig)) blocks.set(sig, []);
    blocks.get(sig).push(`${f}:${text.slice(0, rule.offset).split("\n").length}`);
  }
}
const duplicates = [...blocks].filter(([, hits]) => hits.length > 1);
if (duplicates.length) {
  for (const [sig, hits] of duplicates) {
    warn(`${hits.length}x ${sig.split("|").slice(0, -1).join(" | ")}`);
    hits.forEach((h) => warn(`      ${h}`));
  }
  warn(`${duplicates.length} duplicated block(s)`);
} else {
  ok("no verbatim duplicate rule blocks");
}

console.log("\n=========================================");
if (failures) console.log(`${failures} FAILURE(S), ${warnings} warning(s)`);
else console.log(`PASSED (${warnings} warning(s))`);
console.log("=========================================\n");
process.exit(failures ? 1 : 0);