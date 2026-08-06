#!/usr/bin/env node
/**
 * CI gate: ctx.db.query on TABLE_MAP tables is forbidden.
 *
 * Tables listed in convex/_helpers/supabaseDb.ts TABLE_MAP are owned by
 * Supabase (self-hosted Postgres). Reading them via ctx.db.query hits the
 * Convex document store, which is either stale or empty after the migration,
 * and bypasses Supabase RLS entirely.
 *
 * Use the Supabase read path instead:
 *   Browser:          use-supabase-*.ts hooks (supabase-js with RLS)
 *   Convex functions: createSupabaseDb() service client
 *                     (see convex/_helpers/supabaseDb.ts)
 *
 * Files that intentionally use ctx.db.query on TABLE_MAP tables (backfill
 * scripts, seed utilities, migration helpers) are listed in WHITELIST_PATHS
 * or auto-skipped via shouldSkipFile.
 *
 * Usage:
 *   node scripts/check-convex-db-reads.mjs
 *   npm run check:convex-db-reads
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const CONVEX_DIR = "convex";

// ---------------------------------------------------------------------------
// Parse TABLE_MAP keys dynamically from supabaseDb.ts so this gate stays
// in sync with the map automatically as new tables are added.
// ---------------------------------------------------------------------------
function extractTableMapKeys() {
  const content = readFileSync(
    join(CONVEX_DIR, "_helpers/supabaseDb.ts"),
    "utf8",
  );
  const keys = new Set();
  // Match lines of the form:   tableName: "table_name",
  const re = /^\s{2}(\w+):\s*["'][\w_]+["']/gm;
  let m;
  while ((m = re.exec(content)) !== null) {
    keys.add(m[1]);
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Whitelist — files that intentionally read TABLE_MAP tables via ctx.db.
// Format: module path relative to convex/ root, no .ts, forward slashes.
// Every entry MUST have a comment explaining why it is exempt.
// ---------------------------------------------------------------------------
const WHITELIST_PATHS = new Set([
  // supabase/backfill.ts — sources TABLE_MAP tables to mirror rows into Supabase.
  // By design, must read from ctx.db to obtain the rows being mirrored.
  "supabase/backfill",

  // supabase/usersHelpers.ts — _listAllUsers internalQuery used exclusively by
  // the users-mirror action. Part of the Convex→Supabase sync pipeline.
  "supabase/usersHelpers",

  // supabase/organizations.ts — _listAllTeamMemberships is a backfill helper
  // called only by _backfillAllTeamMembershipsToSupabase. Same sync pattern.
  "supabase/organizations",

  // dev/helpers.ts — deployed only in non-production namespaces.
  "dev/helpers",

  // Seed utilities — only deployed in non-production environments.
  "crm/seed",
  "gabinet/seed",
  "documents/seed",
]);

// ---------------------------------------------------------------------------
// File filtering — skip files that are structurally exempt.
// ---------------------------------------------------------------------------
function shouldSkipFile(relPath) {
  // Generated files
  if (
    relPath.startsWith("_generated" + sep) ||
    relPath.startsWith("_generated/")
  )
    return true;

  // Migration files — all files under migrations/ are backfill/migration utilities
  // that must read from ctx.db to source the rows being migrated.
  if (
    relPath.startsWith("migrations" + sep) ||
    relPath.startsWith("migrations/")
  )
    return true;

  const basename = relPath.split(sep).pop();

  // Schema and auth config are declarations, not data access files.
  if (basename === "schema.ts" || basename === "auth.config.ts") return true;

  // Test files
  if (basename.startsWith("_test") || basename === "_test_helpers.ts")
    return true;
  if (basename.includes("_e2eTest") || basename.includes("e2eTest"))
    return true;
  if (basename.endsWith(".test.ts")) return true;

  return false;
}

function relToModuleKey(relPath) {
  return relPath.replace(/\.(ts|tsx)$/, "").split(sep).join("/");
}

// ---------------------------------------------------------------------------
// Violation detection — find ctx.db.query("TABLE_MAP_TABLE") in a file.
//
// Only ctx.db.query is flagged. A bare db.query where db = createSupabaseDb()
// is the correct Supabase read path and is intentionally not matched here.
// ---------------------------------------------------------------------------
function findViolations(content, tableMapKeys) {
  const violations = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip comment-only lines to avoid flagging documentation examples.
    const trimmed = line.trimStart();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

    // Require ctx.db.query specifically — not a bare db.query — to avoid
    // false positives on Supabase reads via createSupabaseDb().
    const re = /\bctx\.db\.query\(\s*["'](\w+)["']/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      const tableName = m[1];
      if (tableMapKeys.has(tableName)) {
        violations.push({ lineNum: i + 1, text: line.trim(), tableName });
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// File walker
// ---------------------------------------------------------------------------
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (
      st.isFile() &&
      entry.endsWith(".ts") &&
      !entry.endsWith(".d.ts")
    ) {
      out.push(full);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const tableMapKeys = extractTableMapKeys();

if (tableMapKeys.size === 0) {
  console.error(
    "convex-db-reads-gate: could not extract TABLE_MAP keys from convex/_helpers/supabaseDb.ts",
  );
  process.exit(1);
}

const allFiles = walk(CONVEX_DIR);
const allViolations = [];
let scanned = 0;

for (const file of allFiles) {
  const relPath = relative(CONVEX_DIR, file);
  if (shouldSkipFile(relPath)) continue;

  const moduleKey = relToModuleKey(relPath);
  if (WHITELIST_PATHS.has(moduleKey)) continue;

  scanned++;
  const content = readFileSync(file, "utf8");
  const violations = findViolations(content, tableMapKeys);

  if (violations.length > 0) {
    allViolations.push({ file: relPath, violations });
  }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
if (allViolations.length === 0) {
  console.log(
    `✓ convex-db-reads-gate: no ctx.db.query on TABLE_MAP tables detected` +
      ` (${scanned} files scanned, ${tableMapKeys.size} TABLE_MAP tables tracked).`,
  );
  process.exit(0);
}

const totalViolations = allViolations.reduce(
  (n, f) => n + f.violations.length,
  0,
);
console.error(
  `\nconvex-db-reads-gate: ${totalViolations} forbidden ctx.db.query call(s) on TABLE_MAP tables.\n`,
);

for (const { file, violations } of allViolations) {
  for (const v of violations) {
    console.error(`  convex/${file}:${v.lineNum}  — table: "${v.tableName}"`);
    console.error(`    ${v.text}`);
  }
}

console.error(`
TABLE_MAP tables live in Supabase. Reading them via ctx.db.query hits the
Convex document store which is stale or empty post-migration, and bypasses
Supabase RLS.

Correct read paths:
  Browser:          use-supabase-*.ts hooks (supabase-js, RLS-scoped)
  Convex functions: createSupabaseDb() service client
                    (see convex/_helpers/supabaseDb.ts)

To add a legitimate exemption (backfill script, seed utility, migration helper,
dev tool), add the module path (relative to convex/, no .ts extension) to
WHITELIST_PATHS in scripts/check-convex-db-reads.mjs with a comment explaining
why the Convex read is intentional.

See issue #3846 for context.
`);

process.exit(1);
