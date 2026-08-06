#!/usr/bin/env node
/**
 * CI gate: ctx.db.query and ctx.db.get on TABLE_MAP tables are forbidden.
 *
 * Tables listed in convex/_helpers/supabaseDb.ts TABLE_MAP are owned by
 * Supabase (self-hosted Postgres). Reading them via ctx.db.query or
 * ctx.db.get hits the Convex document store, which is either stale or empty
 * after the migration, and bypasses Supabase RLS entirely.
 *
 * Use the Supabase read path instead:
 *   Browser:          use-supabase-*.ts hooks (supabase-js with RLS)
 *   Convex functions: createSupabaseDb() service client
 *                     (see convex/_helpers/supabaseDb.ts)
 *
 * Files that intentionally use ctx.db.query / ctx.db.get on TABLE_MAP tables
 * (backfill scripts, seed utilities, migration helpers) are listed in
 * WHITELIST_PATHS or auto-skipped via shouldSkipFile.
 *
 * Usage:
 *   node scripts/check-convex-db-reads.mjs
 *   npm run check:convex-db-reads
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

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
// GET_PENDING — files with known ctx.db.get violations on TABLE_MAP tables
// that are pending migration to the Supabase read path.
// Both the regex scan (for explicit `as Id<"tableName">` casts) and the
// TypeScript type-checker scan (see findUntypedGetViolationsViaTypeChecker)
// skip files listed here.  Remove entries one-by-one as files are migrated.
// Tracked: issue #4021 (type-checker extension), issue #3968 (original gate).
// ---------------------------------------------------------------------------
const GET_PENDING = new Set([
  // documentInstances.ts — ctx.db.get(args.id) on documentInstances and
  // ctx.db.get(templateId) on documentTemplates; args.id: Id<"documentInstances">.
  "documentInstances",

  // gabinet/employees.ts — ctx.db.get(args.userId as Id<"users">) for employee
  // user lookup; one explicit-cast call remaining at line 971.
  "gabinet/employees",

  // --- Violations newly detected by the TypeScript type-checker (issue #4021) ---
  // These files were invisible to the regex scan because the table name is
  // encoded only in the TypeScript type, not in an explicit `as Id<"...">` cast.
  // Migrate each file to use createSupabaseDb() and remove its entry here.

  // _helpers/activities.ts — ctx.db.get(args.performedBy) where performedBy: Id<"users">.
  "_helpers/activities",

  // activities.ts — ctx.db.get(activity.performedBy) where performedBy: Id<"users">
  // inferred from the activities schema.
  "activities",

  // app.ts — ctx.db.get(userId) where userId: Id<"users"> from auth.getUserId(ctx).
  "app",

  // documentTemplates.ts — ctx.db.get(args.id) where id: v.id("documentTemplates").
  "documentTemplates",

  // emails.ts — ctx.db.get(args.emailId) where emailId: v.id("emails").
  "emails",

  // gabinet/_availability.ts — ctx.db.get(eqId) where eqId: Id<"gabinetEquipment">
  // and ctx.db.get(equipment.currentLocationId) where currentLocationId: Id<"gabinetLocations">.
  "gabinet/_availability",

  // gabinet/appointments.ts — ctx.db.get(args.appointment._id) where
  // _id: Id<"gabinetAppointments">. Intentional migration compatibility read
  // (patches Convex if the record still exists there during Supabase-primary transition).
  "gabinet/appointments",

  // gabinet/equipment.ts — ctx.db.get(args.equipmentId) where
  // equipmentId: v.id("gabinetEquipment").
  "gabinet/equipment",

  // gabinet/packages.ts — ctx.db.get(args.packageId as Id<"gabinetTreatmentPackages">)
  // where the cast spans two lines (also a multiline regex gap — the existing
  // pattern 4 regex requires the cast to be on the same line as ctx.db.get().
  "gabinet/packages",

  // payments.ts — ctx.db.get(m.userId) where m.userId: Id<"users"> (from
  // teamMemberships document; used to fetch email for admin notification).
  "payments",

  // resourceInvites.ts — ctx.db.get(args.organizationId) where
  // organizationId: v.id("organizations").
  "resourceInvites",

  // stripe.ts — ctx.db.get(args.userId) where userId: v.id("users").
  "stripe",
]);

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
  "customFields",
  "documentInstances",
  "documentTemplateFields",
  "documentTemplates",
  "documents/components",
  "documents/templates",
  "emailEventTrigger",
  "emailEvents",
  "emails",
  "emails_internal",
  "gabinet/_availability",
  "gabinet/equipment",
  "gabinet/patientAuth",
  "gabinet/patients",
  "leads",
  "notes",
  "organizations",
  "payments",
  "stripe",
]);

// ---------------------------------------------------------------------------
// Violation detection — find ctx.db.query/get on TABLE_MAP tables in a file.
//
// Only ctx.db.query / ctx.db.get (and variables destructured from ctx as db)
// are flagged.  A bare db.query where db = createSupabaseDb() is the correct
// Supabase read path and is intentionally not matched here — provenance
// tracking via the destructure pre-scan keeps these two apart.
//
// Six patterns are detected:
//   1. ctx.db.query("table")                                — direct chained
//   2. const { db } = ctx; … db.query("table")             — destructure alias
//   3. ctx.db\n      .query("table")                       — split two lines
//   4. ctx.db.get(x as Id<"table">)                        — direct chained get
//   5. const { db } = ctx; … db.get(x as Id<"table">)      — alias get
//   6. ctx.db\n      .get(x as Id<"table">)                — split two lines
//
// Patterns 1-3 require a string-literal table name in the call.
// Patterns 4-6 require an explicit `as Id<"tableName">` cast — untyped
// ctx.db.get(id) calls where the table is only known from the TypeScript type
// are not detectable by this regex-based gate.
//
// Files in MULTILINE_PENDING are exempt from pattern 3 only.
// Files in GET_PENDING are exempt from patterns 4-6.
// ---------------------------------------------------------------------------
function findViolations(content, tableMapKeys, { detectMultiline = true, detectGet = true } = {}) {
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
    if (/\bctx\.db\s*$/.test(line) && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      const nextTrimmed = nextLine.trimStart();
      if (!nextTrimmed.startsWith("//") && !nextTrimmed.startsWith("*")) {
        if (detectMultiline) {
          const mm = /^\s*\.query\(\s*["'](\w+)["']/.exec(nextLine);
          if (mm && tableMapKeys.has(mm[1])) {
            violations.push({
              lineNum: i + 1,
              text: line.trim() + " " + nextLine.trim(),
              tableName: mm[1],
            });
          }
        }
        // Pattern 6 (multiline get): ctx.db at end of line, .get(x as Id<"table">)
        // on the next line.  Skipped for files in GET_PENDING.
        if (detectGet) {
          const gm = /^\s*\.get\([^)]*\bas\s+Id<["'](\w+)["']/.exec(nextLine);
          if (gm && tableMapKeys.has(gm[1])) {
            violations.push({
              lineNum: i + 1,
              text: line.trim() + " " + nextLine.trim(),
              tableName: gm[1],
            });
          }
        }
      }
    }

    // Pattern 4: ctx.db.get(x as Id<"table">) — direct chained get.
    // Only detectable when the argument includes an explicit `as Id<"tableName">`
    // cast; untyped get(id) calls where the table is only in the TS type are
    // invisible to regex analysis.  Skipped for files in GET_PENDING.
    if (detectGet) {
      const getReWithCast = /\bctx\.db\.get\([^)]*\bas\s+Id<["'](\w+)["']/g;
      let gm;
      while ((gm = getReWithCast.exec(line)) !== null) {
        if (tableMapKeys.has(gm[1])) {
          violations.push({ lineNum: i + 1, text: line.trim(), tableName: gm[1] });
        }
      }

      // Pattern 5: alias.get(x as Id<"table">) where alias was destructured from ctx.db.
      for (const alias of ctxDbAliases) {
        const aliasGetRe = new RegExp(
          String.raw`\b${alias}\.get\([^)]*\bas\s+Id<["'](\w+)["']`,
          "g",
        );
        let agm;
        while ((agm = aliasGetRe.exec(line)) !== null) {
          if (tableMapKeys.has(agm[1])) {
            violations.push({ lineNum: i + 1, text: line.trim(), tableName: agm[1] });
          }
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
// TypeScript type-checker scan — catches ctx.db.get(id) calls where the table
// name is encoded only in the TypeScript type (no explicit `as Id<"...">`cast).
//
// Requires the `typescript` package to be installed (it is a devDependency).
// Falls back gracefully when TypeScript is unavailable (fresh worktree without
// npm ci), so the regex scan still runs in that case.
//
// Files in GET_PENDING are skipped by this scan too (same exemption list).
// ---------------------------------------------------------------------------

function collectCtxDbAliases(node, aliases, ts) {
  if (
    ts.isVariableDeclaration(node) &&
    ts.isObjectBindingPattern(node.name) &&
    node.initializer &&
    ts.isIdentifier(node.initializer) &&
    node.initializer.text === "ctx"
  ) {
    for (const element of node.name.elements) {
      if (ts.isBindingElement(element)) {
        const propName = element.propertyName ?? element.name;
        if (ts.isIdentifier(propName) && propName.text === "db") {
          if (ts.isIdentifier(element.name)) {
            aliases.add(element.name.text);
          }
        }
      }
    }
  }
  ts.forEachChild(node, (child) => collectCtxDbAliases(child, aliases, ts));
}

function tableNameFromIdTypeString(typeStr) {
  // Match Id<"table">, GenericId<"table">, or import("...").Id<"table"> etc.
  const m = /(?:\bId|\bGenericId)<["'](\w+)["']>$/.exec(typeStr);
  return m ? m[1] : null;
}

function visitForGetCalls(
  node,
  checker,
  tableMapKeys,
  aliases,
  violations,
  sourceFile,
  ts,
) {
  if (ts.isCallExpression(node)) {
    const expr = node.expression;
    if (ts.isPropertyAccessExpression(expr) && expr.name.text === "get") {
      const obj = expr.expression;
      let isCtxDbGet = false;

      // ctx.db.get(...)
      if (
        ts.isPropertyAccessExpression(obj) &&
        obj.name.text === "db" &&
        ts.isIdentifier(obj.expression) &&
        obj.expression.text === "ctx"
      ) {
        isCtxDbGet = true;
      }

      // alias.get(...) where alias was destructured from ctx as db
      if (!isCtxDbGet && ts.isIdentifier(obj) && aliases.has(obj.text)) {
        isCtxDbGet = true;
      }

      if (isCtxDbGet && node.arguments.length > 0) {
        const arg = node.arguments[0];
        try {
          const argType = checker.getTypeAtLocation(arg);
          const typeStr = checker.typeToString(argType);
          const tableName = tableNameFromIdTypeString(typeStr);
          if (tableName && tableMapKeys.has(tableName)) {
            const { line } =
              sourceFile.getLineAndCharacterOfPosition(node.getStart());
            violations.push({
              lineNum: line + 1,
              text: sourceFile.text.split("\n")[line].trim(),
              tableName,
            });
          }
        } catch {
          // Type resolution failed for this node — skip.
        }
      }
    }
  }
  ts.forEachChild(node, (child) =>
    visitForGetCalls(
      child,
      checker,
      tableMapKeys,
      aliases,
      violations,
      sourceFile,
      ts,
    ),
  );
}

async function findUntypedGetViolationsViaTypeChecker(tableMapKeys) {
  // Dynamically import TypeScript — devDependency, not always installed in
  // fresh worktrees without npm ci.  Return null to signal skip to caller.
  let ts;
  try {
    const mod = await import("typescript");
    ts = mod.default ?? mod;
  } catch {
    return null;
  }

  const convexAbsDir = resolve(CONVEX_DIR);
  const configPath = join(convexAbsDir, "tsconfig.json");

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) return null;

  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    convexAbsDir,
  );

  const program = ts.createProgram(parsedConfig.fileNames, {
    ...parsedConfig.options,
    noEmit: true,
  });
  const checker = program.getTypeChecker();
  const results = [];

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;

    const filePath = sourceFile.fileName;
    const slashDir = convexAbsDir.split(sep).join("/");
    if (
      !filePath.startsWith(slashDir + "/") &&
      !filePath.startsWith(convexAbsDir + sep)
    )
      continue;

    const relPath = relative(convexAbsDir, filePath).split("/").join(sep);
    if (shouldSkipFile(relPath)) continue;

    const moduleKey = relToModuleKey(relPath);
    if (WHITELIST_PATHS.has(moduleKey)) continue;
    if (GET_PENDING.has(moduleKey)) continue;

    // Two-pass: collect ctx.db aliases first, then check get calls.
    const aliases = new Set();
    collectCtxDbAliases(sourceFile, aliases, ts);

    const violations = [];
    visitForGetCalls(
      sourceFile,
      checker,
      tableMapKeys,
      aliases,
      violations,
      sourceFile,
      ts,
    );

    if (violations.length > 0) {
      results.push({ file: relPath, violations });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main (async to support dynamic TypeScript import for type-checker scan)
// ---------------------------------------------------------------------------
async function main() {
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
      detectGet: !GET_PENDING.has(moduleKey),
    });

    if (violations.length > 0) {
      allViolations.push({ file: relPath, violations });
    }
  }

  // ---------------------------------------------------------------------------
  // Supplementary type-checker scan: catches ctx.db.get(id) calls where the
  // table name is only in the TypeScript type, not in an explicit cast.
  // Results are merged with the regex violations; duplicates (same file+line)
  // are deduplicated so explicit-cast calls are not reported twice.
  // ---------------------------------------------------------------------------
  const tcViolations =
    await findUntypedGetViolationsViaTypeChecker(tableMapKeys);

  if (tcViolations === null) {
    console.warn(
      "convex-db-reads-gate: TypeScript not available — untyped ctx.db.get scan skipped." +
        " Run `npm ci` to enable the full check.",
    );
  } else {
    for (const { file, violations } of tcViolations) {
      const existing = allViolations.find((v) => v.file === file);
      if (existing) {
        for (const v of violations) {
          if (!existing.violations.some((ev) => ev.lineNum === v.lineNum)) {
            existing.violations.push(v);
          }
        }
      } else {
        allViolations.push({ file, violations });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Output
  // ---------------------------------------------------------------------------
  if (allViolations.length === 0) {
    console.log(
      `✓ convex-db-reads-gate: no ctx.db.query / ctx.db.get reads on TABLE_MAP tables detected` +
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
TABLE_MAP tables live in Supabase. Reading them via ctx.db.query or ctx.db.get
(directly or via destructuring) hits the Convex document store which is stale
or empty post-migration, and bypasses Supabase RLS.

Correct read paths:
  Browser:          use-supabase-*.ts hooks (supabase-js, RLS-scoped)
  Convex functions: createSupabaseDb() service client
                    (see convex/_helpers/supabaseDb.ts)

ctx.db.get detection uses two complementary approaches:
  Regex scan: catches explicit \`as Id<"tableName">\` casts and same-line patterns.
  Type-checker scan: catches all ctx.db.get(id) calls where id's TypeScript type
    is Id<"tableName"> for any TABLE_MAP table, even without an explicit cast.
    Requires the typescript devDependency to be installed (npm ci).

To add a legitimate exemption (backfill script, seed utility, migration helper,
dev tool), add the module path (relative to convex/, no .ts extension) to
WHITELIST_PATHS in scripts/check-convex-db-reads.mjs with a comment explaining
why the Convex read is intentional.

See issue #3846 (query gate), issue #3968 (get gate), issue #4021 (type-checker
extension) for context.
`);

  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
