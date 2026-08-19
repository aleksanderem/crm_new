#!/usr/bin/env node
/**
 * CI gate: i18n key coverage check for error-handler objects.
 *
 * Extracts i18n key strings from formatActionError / GENERIC_ERROR_MAP style
 * objects — i.e. `{ key: "dotted.key", defaultValue: "..." }` and
 * `{ key: "dotted.key", fallback: "...", test: ... }` — and verifies each key
 * exists in all supported locale files under public/locales/.
 *
 * The TypeScript type-checker already enforces t("key") reference coverage for
 * the EN locale (via src/i18next.d.ts → CustomTypeOptions). The `key:` string
 * property in error-handler objects is NOT covered by the type-checker because
 * it is a plain string, not a t() call. This gate closes that gap.
 *
 * Detection rule: a `key: "dotted.value"` string on line N is treated as an
 * i18n key reference if any of lines N-3 … N+3 contains `defaultValue:` or
 * `fallback:`. This matches the two patterns used in this codebase:
 *   1. formatActionError(e, t, { key: "ns.action", defaultValue: "Fallback." })
 *   2. GENERIC_ERROR_MAP entries: { key: "ns.type", test: /…/, fallback: "…" }
 *
 * Keys without a dot are skipped (they are never i18n key paths by convention).
 *
 * KNOWN_MISSING — pre-existing violations present when this gate was introduced
 * (#5522). Keys in this set are skipped so the gate passes on the current
 * codebase; remove entries one-by-one as the matching translations are added to
 * both locale files (en/translation.json and pl/translation.json).
 *
 * Usage:
 *   node scripts/check-i18n-coverage.mjs
 *   npm run check:i18n-coverage
 *
 * See issue #5522 for context.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC_DIR = "src";
const LOCALES_DIR = "public/locales";
const LOCALE_IDS = ["en", "pl"];

// Lines before/after `key:` that are scanned for defaultValue: / fallback:
// when determining whether the key is an i18n error-handler key.
const CONTEXT_WINDOW = 3;

// ---------------------------------------------------------------------------
// KNOWN_MISSING — pre-existing keys that are referenced in error-handler
// objects but absent from one or more locale files.  These represent
// translation debt introduced before this gate existed (#5522). Each entry
// must have a comment explaining which module / component it belongs to and
// pointing to a tracking issue or PR where the translation will be added.
//
// To resolve an entry: add the key to ALL locale files, then remove it here.
// Do NOT add new entries to this list — fix the translation instead.
// ---------------------------------------------------------------------------
// All previously KNOWN_MISSING entries have been resolved in #5527.
// Do NOT add new entries here — fix the translation instead.
const KNOWN_MISSING = new Set([]);

// ---------------------------------------------------------------------------
// Flatten a nested JSON object into a Set of dot-separated key paths.
// E.g. { notes: { errors: { createFailed: "..." } } }
//   → Set { "notes.errors.createFailed" }
// ---------------------------------------------------------------------------
function flattenKeys(obj, prefix = "", result = new Set()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      flattenKeys(v, key, result);
    } else {
      result.add(key);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Extract i18n key references from a source file.
//
// A `key: "dotted.key.name"` string on line N is accepted as an i18n key
// reference only when any of lines N-CONTEXT_WINDOW … N+CONTEXT_WINDOW
// contains `defaultValue:` or `fallback:`, which indicates a
// formatActionError / GENERIC_ERROR_MAP usage rather than an unrelated
// property (e.g. `{ key: "address.city", label: "…" }`).
//
// Returns an array of { key, lineNum } objects.
// ---------------------------------------------------------------------------
function extractKeyRefs(content) {
  const lines = content.split("\n");
  const refs = [];

  const keyPropRe =
    /\bkey:\s*["']([a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9]*)*)["']/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip comment-only lines.
    const trimmed = line.trimStart();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

    const m = keyPropRe.exec(line);
    if (!m) continue;

    const key = m[1];
    if (!key.includes(".")) continue; // single-segment strings are not i18n keys

    // Check the surrounding window for the marker properties that indicate
    // an error-handler object (defaultValue or fallback).
    const winStart = Math.max(0, i - CONTEXT_WINDOW);
    const winEnd = Math.min(lines.length - 1, i + CONTEXT_WINDOW);
    const windowText = lines.slice(winStart, winEnd + 1).join("\n");

    if (/\bdefaultValue\s*:|\bfallback\s*:/.test(windowText)) {
      refs.push({ key, lineNum: i + 1 });
    }
  }

  return refs;
}

// ---------------------------------------------------------------------------
// Recursively walk a directory, collecting .ts / .tsx source files.
// Test files (*.test.ts, *.test.tsx) and declaration files (*.d.ts) are
// excluded — test utilities may reference keys in ways that are intentionally
// non-production (stubs, fixtures, mock translation helpers).
// ---------------------------------------------------------------------------
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (
      st.isFile() &&
      (entry.endsWith(".ts") || entry.endsWith(".tsx")) &&
      !entry.endsWith(".d.ts") &&
      !entry.endsWith(".test.ts") &&
      !entry.endsWith(".test.tsx")
    ) {
      out.push(full);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  // Load and flatten both locale files.
  const localeSets = {};
  for (const locale of LOCALE_IDS) {
    const path = join(LOCALES_DIR, locale, "translation.json");
    let json;
    try {
      json = JSON.parse(readFileSync(path, "utf8"));
    } catch (e) {
      console.error(
        `i18n-coverage: failed to read locale file ${path}: ${e.message}`,
      );
      process.exit(1);
    }
    localeSets[locale] = flattenKeys(json);
  }

  // Scan every source file.
  const allFiles = walk(SRC_DIR);
  let scanned = 0;
  // Map of key → first occurrence { file, lineNum, missingLocales }.
  const missingByKey = new Map();

  for (const file of allFiles) {
    const content = readFileSync(file, "utf8");
    const refs = extractKeyRefs(content);
    scanned++;

    for (const { key, lineNum } of refs) {
      if (KNOWN_MISSING.has(key)) continue; // tracked pre-existing debt
      if (missingByKey.has(key)) continue; // already recorded

      const missingLocales = LOCALE_IDS.filter((l) => !localeSets[l].has(key));
      if (missingLocales.length > 0) {
        missingByKey.set(key, {
          file: relative(".", file),
          lineNum,
          missingLocales,
        });
      }
    }
  }

  if (missingByKey.size === 0) {
    console.log(
      `✓ i18n-coverage: all error-handler i18n keys present in all locale files` +
        ` (${scanned} files scanned, ${LOCALE_IDS.length} locales checked,` +
        ` ${KNOWN_MISSING.size} known-missing keys skipped).`,
    );
    process.exit(0);
  }

  console.error(
    `\ni18n-coverage: ${missingByKey.size} i18n key(s) missing from locale file(s).\n`,
  );

  for (const [key, { file, lineNum, missingLocales }] of missingByKey) {
    console.error(`  ${file}:${lineNum}  key: "${key}"`);
    console.error(`    Missing from: ${missingLocales.join(", ")}`);
  }

  console.error(`
Each i18n key referenced in a formatActionError / error-handler object must
exist in all supported locale files (${LOCALE_IDS.join(", ")}) under
${LOCALES_DIR}/.

Add the missing key to the appropriate section of each affected file:
${LOCALE_IDS.map((l) => `  public/locales/${l}/translation.json`).join("\n")}

Pattern checked:
  { key: "dotted.key", defaultValue: "Fallback text." }
  { key: "dotted.key", test: /pattern/, fallback: "Fallback text." }

The detection window is ±${CONTEXT_WINDOW} lines around the key: property. Dynamic keys
(template literals, computed expressions) are not checked and must be verified
manually.

Do NOT add entries to KNOWN_MISSING in scripts/check-i18n-coverage.mjs to
silence this error. Add the translation to all locale files instead.

See issue #5522 for context.
`);

  process.exit(1);
}

main();
