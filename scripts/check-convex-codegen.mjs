#!/usr/bin/env node
// Verify that convex/_generated/api.d.ts references every module file under
// convex/, applying the same exclusion rules convex codegen uses. Designed for
// CI: exits non-zero if any module is missing or any orphan reference is found.
//
// This avoids requiring a real Convex deployment in CI (newer convex versions
// refuse to run `npx convex codegen` without one) while still catching the
// drift that issue #138 hand-patched: a module added to convex/ without a
// corresponding refresh of _generated/api.d.ts.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";

const CONVEX_DIR = "convex";
const API_D_TS = join(CONVEX_DIR, "_generated", "api.d.ts");
const ENTRY_POINT_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

function isModuleFile(relPath, baseName) {
  // Mirrors convex codegen's filter rules (see convex/dist/cli.bundle.cjs).
  if (!ENTRY_POINT_EXTENSIONS.some((ext) => relPath.endsWith(ext))) return false;
  if (relPath.startsWith("_generated" + sep) || relPath.startsWith("_generated/"))
    return false;
  if (baseName.startsWith(".") || baseName.startsWith("#")) return false;
  if (baseName === "schema.ts" || baseName === "schema.js") return false;
  // Files with more than one dot in the basename are excluded
  // (catches *.config.ts, *.test.ts, *.d.ts, etc.).
  if ((baseName.match(/\./g) || []).length > 1) return false;
  return true;
}

function moduleNameFor(relPath) {
  // Strip entry-point extension and normalize to forward slashes (matches
  // the path format codegen writes into api.d.ts imports).
  const noExt = relPath.replace(/\.(ts|tsx|js|jsx)$/u, "");
  return noExt.split(sep).join(posix.sep);
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (st.isFile()) {
      out.push(full);
    }
  }
  return out;
}

const expectedModules = new Set();
for (const full of walk(CONVEX_DIR)) {
  const rel = relative(CONVEX_DIR, full);
  const base = rel.split(sep).pop();
  if (!isModuleFile(rel, base)) continue;
  expectedModules.add(moduleNameFor(rel));
}

const apiSrc = readFileSync(API_D_TS, "utf8");
const importRe = /import type \* as \w+ from "\.\.\/([^"]+)\.js";/gu;
const referencedModules = new Set();
for (const m of apiSrc.matchAll(importRe)) {
  referencedModules.add(m[1]);
}

const missing = [...expectedModules].filter((m) => !referencedModules.has(m)).sort();
const orphans = [...referencedModules].filter((m) => !expectedModules.has(m)).sort();

if (missing.length === 0 && orphans.length === 0) {
  console.log(`convex/_generated/api.d.ts is in sync (${expectedModules.size} modules).`);
  process.exit(0);
}

console.error("convex/_generated/api.d.ts is out of sync with convex/.");
if (missing.length) {
  console.error("\nMissing from api.d.ts (file exists under convex/, no import):");
  for (const m of missing) console.error(`  - ${m}`);
}
if (orphans.length) {
  console.error("\nOrphan in api.d.ts (imported but file is gone or excluded):");
  for (const m of orphans) console.error(`  - ${m}`);
}
console.error(
  "\nFix: run `npx convex dev` (or `npx convex codegen`) locally to regenerate" +
    "\nconvex/_generated/, then commit the result. See" +
    "\nhttps://docs.convex.dev/understanding/best-practices/other-recommendations#check-generated-code-into-version-control",
);
process.exit(1);
