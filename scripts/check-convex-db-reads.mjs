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
  "seedDefaults",
  "emailTemplateSeed",
  "seedEmailEvents",
  "seedTemplates",

  // Auth/permissions helpers called from QueryCtx — Convex queries cannot
  // make HTTP calls, so createSupabaseDb() is unavailable. Many mutation
  // callers have been migrated to action-based variants (authAction.ts for
  // auth/perms, seatLimits.checkSeatLimitAction for seat checks). Some
  // mutation-context callers also legitimately read these tables via ctx.db
  // for the same reason (mutations cannot use fetch in the Convex runtime);
  // e.g. automation.ts:getAutomationEditPermission uses a fake actorCtx to
  // read teamMemberships/orgPermissions — it is exempt via MULTILINE_PENDING
  // rather than this whitelist. Primary query-context callers here:
  // getSeatUsage, verifyOrgAccess in queries.
  "_helpers/auth",
  "_helpers/permissions",
  "_helpers/seatLimits",

  // notifications — Convex is the authoritative real-time store for in-app
  // notifications. Writes go through ctx.db so that the notification bell
  // receives live-query push updates without polling. The Supabase table
  // exists for long-term archival / RLS-scoped reads by the portal, but
  // the primary read path for the bell and notification page stays on Convex.
  // Resolved via issue #3904 (option A).
  "notifications",

  // permissions — _writeOrgPermissionsToConvex (internalMutation) dual-writes
  // orgPermissions to ctx.db so that _helpers/permissions.ts (QueryCtx) can
  // read them via ctx.db. Convex queries cannot make HTTP calls, so
  // createSupabaseDb() is permanently unavailable in QueryCtx. This dual-write
  // is NOT a migration backlog item; it is a permanent architectural necessity.
  // See convex/permissions.ts lines 68-73 for the inline rationale.
  "permissions",
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
// MULTILINE_PENDING — files with known ctx.db\n.query() violations that are
// pending migration to the Supabase read path.  These files are exempt from
// the multiline pattern check ONLY — single-line patterns are still flagged.
// Tracked: issue #3860.  Remove entries one-by-one as files are migrated.
// ---------------------------------------------------------------------------
const MULTILINE_PENDING = new Set([
  "activities",
  "app",
  "automation",
  "calls",
  "companies",
  "contacts",
  "customFields",
  "documentInstances",
  "documentTemplateFields",
  "documentTemplates",
  "documents/components",
  "documents/templates",
  "emailEventBindings",
  "emailEventTrigger",
  "emailEvents",
  "emailSending",
  "emailSequences",
  "emails",
  "emails_internal",
  "gabinet/_availability",
  "gabinet/equipment",
  "gabinet/patientAuth",
  "gabinet/patients",
  "invitations",
  "leads",
  "notes",
  "organizations",
  "payments",
  "signatureRequests",
  "stripe",
]);

// ---------------------------------------------------------------------------
// Violation detection — find ctx.db.query("TABLE_MAP_TABLE") in a file.
//
// Only ctx.db.query (and variables destructured from ctx as db) are flagged.
// A bare db.query where db = createSupabaseDb() is the correct Supabase read
// path and is intentionally not matched here — provenance tracking via the
// destructure pre-scan keeps these two apart.
//
// Three patterns are detected:
//   1. ctx.db.query("table")                         — direct chained access
//   2. const { db } = ctx; … db.query("table")       — destructure alias
//   3. ctx.db\n      .query("table")                 — split across two lines
//
// Files in MULTILINE_PENDING are exempt from pattern 3 only (migration
// backlog tracked in issue #3860).  New files are subject to all three checks.
// ---------------------------------------------------------------------------
function findViolations(content, tableMapKeys, { detectMultiline = true } = {}) {
  const violations = [];
  const lines = content.split("\n");

  // Pre-scan: collect every variable that holds ctx.db via destructuring so we
  // can flag bare alias.query("table") calls with the same precision as
  // ctx.db.query("table") — without catching db from createSupabaseDb().
  //
  // Matches (single-line destructures):
  //   const { db } = ctx          → alias "db"
  //   const { db: myDb } = ctx    → alias "myDb"
  //   const { db, scheduler } = ctx → alias "db"
  const ctxDbAliases = new Set();
  {
    const destructureRe = /\{([^}]+)\}\s*=\s*ctx\b/g;
    let dm;
    while ((dm = destructureRe.exec(content)) !== null) {
      const body = dm[1];
      const dbRe = /\bdb\s*(?::\s*(\w+))?/g;
      let dbm;
      while ((dbm = dbRe.exec(body)) !== null) {
        ctxDbAliases.add(dbm[1] ?? "db");
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip comment-only lines to avoid flagging documentation examples.
    const trimmed = line.trimStart();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

    // Pattern 1: ctx.db.query("table") — direct chained access.
    const re = /\bctx\.db\.query\(\s*["'](\w+)["']/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      const tableName = m[1];
      if (tableMapKeys.has(tableName)) {
        violations.push({ lineNum: i + 1, text: line.trim(), tableName });
      }
    }

    // Pattern 2: alias.query("table") where alias was destructured from ctx.db.
    for (const alias of ctxDbAliases) {
      const aliasRe = new RegExp(
        String.raw`\b${alias}\.query\(\s*["'](\w+)["']`,
        "g",
      );
      let am;
      while ((am = aliasRe.exec(line)) !== null) {
        const tableName = am[1];
        if (tableMapKeys.has(tableName)) {
          violations.push({ lineNum: i + 1, text: line.trim(), tableName });
        }
      }
    }

    // Pattern 3 (multiline): ctx.db at end of line, .query("table") on the
    // next line.  Skipped for files in MULTILINE_PENDING (migration backlog).
    if (detectMultiline && /\bctx\.db\s*$/.test(line) && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      const nextTrimmed = nextLine.trimStart();
      if (!nextTrimmed.startsWith("//") && !nextTrimmed.startsWith("*")) {
        const mm = /^\s*\.query\(\s*["'](\w+)["']/.exec(nextLine);
        if (mm && tableMapKeys.has(mm[1])) {
          violations.push({
            lineNum: i + 1,
            text: line.trim() + " " + nextLine.trim(),
            tableName: mm[1],
          });
        }
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
  const violations = findViolations(content, tableMapKeys, {
    detectMultiline: !MULTILINE_PENDING.has(moduleKey),
  });

  if (violations.length > 0) {
    allViolations.push({ file: relPath, violations });
  }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
if (allViolations.length === 0) {
  console.log(
    `✓ convex-db-reads-gate: no ctx.db reads on TABLE_MAP tables detected` +
      ` (${scanned} files scanned, ${tableMapKeys.size} TABLE_MAP tables tracked).`,
  );
  process.exit(0);
}

const totalViolations = allViolations.reduce(
  (n, f) => n + f.violations.length,
  0,
);
console.error(
  `\nconvex-db-reads-gate: ${totalViolations} forbidden ctx.db read(s) on TABLE_MAP tables.\n`,
);

for (const { file, violations } of allViolations) {
  for (const v of violations) {
    console.error(`  convex/${file}:${v.lineNum}  — table: "${v.tableName}"`);
    console.error(`    ${v.text}`);
  }
}

console.error(`
TABLE_MAP tables live in Supabase. Reading them via ctx.db (directly or via
destructuring) hits the Convex document store which is stale or empty
post-migration, and bypasses Supabase RLS.

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
