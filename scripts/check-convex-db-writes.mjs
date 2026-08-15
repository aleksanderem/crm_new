#!/usr/bin/env node
/**
 * CI gate: ctx.db.insert, ctx.db.patch, and ctx.db.delete on TABLE_MAP tables
 * are forbidden.
 *
 * Tables listed in convex/_helpers/supabaseDb.ts TABLE_MAP are owned by
 * Supabase (self-hosted Postgres). Writing them via ctx.db.insert creates a
 * row in the Convex document store that Supabase will never see; patch/delete
 * silently fails or mutates a Convex document that is stale post-migration.
 *
 * Use the Supabase write path instead:
 *   Convex functions: createSupabaseDb() service client
 *                     (see convex/_helpers/supabaseDb.ts)
 *
 * Companion gate for ctx.db reads: scripts/check-convex-db-reads.mjs
 * See issue #4943 for context.
 *
 * Two detection strategies:
 *   Regex scan:       catches ctx.db.insert("tableName", ...) where the table
 *                     name is a string literal in the first argument.
 *   TypeScript scan:  catches ctx.db.patch(id, ...) and ctx.db.delete(id)
 *                     where id's TypeScript type is Id<"tableName"> for any
 *                     TABLE_MAP table. Requires the typescript devDependency
 *                     (npm ci). Falls back gracefully when unavailable.
 *
 * Files that intentionally write via ctx.db on TABLE_MAP tables (backfill
 * scripts, seed utilities, dual-write patterns) are listed in WHITELIST_PATHS.
 *
 * Known violations pending migration are listed in INSERT_PENDING (for insert)
 * and PATCH_DELETE_PENDING (for patch/delete). Remove entries one-by-one as
 * files are migrated to createSupabaseDb().
 *
 * Usage:
 *   node scripts/check-convex-db-writes.mjs
 *   npm run check:convex-db-writes
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
  const re = /^\s{2}(\w+):\s*["'][\w_]+["']/gm;
  let m;
  while ((m = re.exec(content)) !== null) {
    keys.add(m[1]);
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Whitelist — files that intentionally write to TABLE_MAP tables via ctx.db.
// Format: module path relative to convex/ root, no .ts, forward slashes.
// Every entry MUST have a comment explaining why it is exempt.
// ---------------------------------------------------------------------------
const WHITELIST_PATHS = new Set([
  // supabase/backfill.ts — mirrors Convex rows into Supabase. By design,
  // reads from ctx.db and writes there too (for backfill idempotency tracking).
  "supabase/backfill",

  // supabase/usersHelpers.ts — backfill helper for the users-mirror action.
  "supabase/usersHelpers",

  // supabase/organizations.ts — _backfillAllTeamMembershipsToSupabase helper.
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

  // notifications — Convex is the authoritative real-time store for in-app
  // notifications. ctx.db.insert is intentional so the notification bell
  // receives live-query push updates. See issue #3904 (option A).
  "notifications",

  // permissions — _writeOrgPermissionsToConvex (internalMutation) dual-writes
  // orgPermissions to ctx.db so that _helpers/permissions.ts (QueryCtx) can
  // read them. QueryCtx cannot make HTTP calls, so this dual-write is a
  // permanent architectural necessity. See convex/permissions.ts for rationale.
  "permissions",

  // organizations — dual-writes organizations and teamMemberships to ctx.db so
  // that verifyOrgAccess / requireOrgAdmin in _helpers/auth.ts (QueryCtx |
  // MutationCtx) can read them. QueryCtx cannot make HTTP calls, so these
  // Convex writes are a permanent architectural necessity alongside the
  // Supabase writes already present in every calling action. See issue #4952.
  "organizations",

  // invitations — _acceptInternal dual-writes teamMemberships and users to
  // ctx.db for the same reason as organizations above: requireOrgAdmin /
  // requireUser in _helpers/auth.ts read from ctx.db (QueryCtx | MutationCtx),
  // which cannot make HTTP calls. The invitations table itself is now Supabase-
  // only (migrated in issue #4953). The remaining ctx.db writes are limited to
  // teamMemberships (Convex auth compat) and users (username derivation for
  // new invitees). See issue #4953.
  "invitations",

  // app — dual-writes users, organizations, and teamMemberships to ctx.db so
  // that verifyOrgAccess / requireUser in _helpers/auth.ts (QueryCtx |
  // MutationCtx) can read them. MutationCtx cannot make HTTP calls, so these
  // Convex writes are a permanent architectural necessity. Every ctx.db write
  // in app.ts has a corresponding Supabase write: completeOnboarding (action)
  // writes user/org/membership directly; profile mutations schedule
  // writeUserToSupabase; deleteCurrentUserAccount (action) deletes from
  // Supabase. See issue #4954.
  "app",
]);

// ---------------------------------------------------------------------------
// INSERT_PENDING — files with known ctx.db.insert violations on TABLE_MAP
// tables that are pending migration to createSupabaseDb().
// Remove entries one-by-one as files are migrated.
// Tracked: issue #4943.
// ---------------------------------------------------------------------------
const INSERT_PENDING = new Set([
  // admin/entitlements.ts — ctx.db.insert("productSubscriptions", ...) for
  // inserting subscription records; should use createSupabaseDb().insert().
  "admin/entitlements",

  // documents/components.ts — ctx.db.insert("documentComponents", ...).
  "documents/components",

  // gabinet/appointments.ts — ctx.db.insert("appointmentReminders", ...).
  "gabinet/appointments",

  // gabinet/equipment.ts — ctx.db.insert("gabinetEquipment", ...).
  "gabinet/equipment",

  // stripe.ts — ctx.db.insert("productSubscriptions", ...) during Stripe
  // webhook handling; should use createSupabaseDb().insert().
  "stripe",
]);

// ---------------------------------------------------------------------------
// PATCH_DELETE_PENDING — files with known ctx.db.patch / ctx.db.delete
// violations on TABLE_MAP tables that are pending migration.
// These files are exempt from the TypeScript type-checker scan.
// Remove entries one-by-one as files are migrated.
// Tracked: issue #4943.
// ---------------------------------------------------------------------------
const PATCH_DELETE_PENDING = new Set([
  // admin/entitlements.ts — ctx.db.patch on productSubscriptions records.
  "admin/entitlements",

  // automation.ts — ctx.db.patch(convexId, ...) where convexId may be a
  // TABLE_MAP table (gabinet entities). Intentional migration-compat mirror:
  // only patches if a legacy Convex doc still exists (see comment in source).
  "automation",

  // categoryDefinitions.ts — ctx.db.patch(entity._id, ...) where entity is
  // a contact, company, or lead — all TABLE_MAP tables.
  "categoryDefinitions",

  // crm/notes.ts — ctx.db.delete(child._id) where child: Id<"notes">.
  "crm/notes",

  // crm/pipelines.ts — ctx.db.patch(leadId, ...) where leadId: Id<"leads">.
  "crm/pipelines",

  // documents/components.ts — ctx.db.patch(tmpl._id, ...) where tmpl is a
  // documentTemplates record.
  "documents/components",

  // gabinet/employees.ts — ctx.db.patch(args.userId as Id<"users">, ...).
  "gabinet/employees",

  // gabinet/equipment.ts — ctx.db.patch/delete on gabinetEquipment records.
  "gabinet/equipment",

  // gabinet/onboarding.ts — ctx.db.patch(args.organizationId, ...) where
  // organizationId: Id<"organizations">.
  "gabinet/onboarding",

  // gabinet/patients.ts — ctx.db.patch on activities, notes, and
  // gabinetAppointments records during GDPR erasure.
  "gabinet/patients",

  // stripe.ts — ctx.db.patch(args.userId, { customerId }) in
  // PREAUTH_updateCustomerId where userId: Id<"users">. Should also write
  // customerId to Supabase users table.
  "stripe",

]);

// ---------------------------------------------------------------------------
// File filtering — skip files that are structurally exempt.
// ---------------------------------------------------------------------------
function shouldSkipFile(relPath) {
  if (
    relPath.startsWith("_generated" + sep) ||
    relPath.startsWith("_generated/")
  )
    return true;

  if (
    relPath.startsWith("migrations" + sep) ||
    relPath.startsWith("migrations/")
  )
    return true;

  const basename = relPath.split(sep).pop();
  if (basename === "schema.ts" || basename === "auth.config.ts") return true;
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
// Regex-based insert violation detection.
//
// ctx.db.insert always takes a string-literal table name as its first
// argument, so regex is sufficient for full coverage.
//
// Three patterns:
//   1. ctx.db.insert("table", doc)           — direct chained
//   2. alias.insert("table", doc)            — alias destructured from ctx.db
//   3. ctx.db\n      .insert("table", doc)   — split two lines (multiline)
// ---------------------------------------------------------------------------
function findInsertViolations(content, tableMapKeys) {
  const violations = [];
  const lines = content.split("\n");

  // Pre-scan: collect ctx.db aliases from destructuring patterns.
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
    const trimmed = line.trimStart();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

    // Pattern 1: ctx.db.insert("table", ...)
    const re = /\bctx\.db\.insert\(\s*["'](\w+)["']/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      if (tableMapKeys.has(m[1])) {
        violations.push({ lineNum: i + 1, text: line.trim(), tableName: m[1] });
      }
    }

    // Pattern 2: alias.insert("table", ...) where alias = ctx.db
    for (const alias of ctxDbAliases) {
      const aliasRe = new RegExp(
        String.raw`\b${alias}\.insert\(\s*["'](\w+)["']`,
        "g",
      );
      let am;
      while ((am = aliasRe.exec(line)) !== null) {
        if (tableMapKeys.has(am[1])) {
          violations.push({ lineNum: i + 1, text: line.trim(), tableName: am[1] });
        }
      }
    }

    // Pattern 3 (multiline): ctx.db at end of line, .insert("table", ...) on next line.
    if (/\bctx\.db\s*$/.test(line) && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      const nextTrimmed = nextLine.trimStart();
      if (!nextTrimmed.startsWith("//") && !nextTrimmed.startsWith("*")) {
        const mm = /^\s*\.insert\(\s*["'](\w+)["']/.exec(nextLine);
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
// TypeScript type-checker scan — catches ctx.db.patch(id, ...) and
// ctx.db.delete(id) calls where the table name is only known from the
// TypeScript type of the id argument (Id<"tableName">).
//
// Files in PATCH_DELETE_PENDING are skipped by this scan.
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
  const m = /(?:\bId|\bGenericId)<["'](\w+)["']>$/.exec(typeStr);
  return m ? m[1] : null;
}

function visitForWriteCalls(
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
    if (ts.isPropertyAccessExpression(expr)) {
      const methodName = expr.name.text;

      if (methodName === "patch" || methodName === "delete") {
        const obj = expr.expression;
        let isCtxDbWrite = false;

        // ctx.db.patch(...) / ctx.db.delete(...)
        if (
          ts.isPropertyAccessExpression(obj) &&
          obj.name.text === "db" &&
          ts.isIdentifier(obj.expression) &&
          obj.expression.text === "ctx"
        ) {
          isCtxDbWrite = true;
        }

        // alias.patch(...) / alias.delete(...) where alias = ctx.db
        if (!isCtxDbWrite && ts.isIdentifier(obj) && aliases.has(obj.text)) {
          isCtxDbWrite = true;
        }

        if (isCtxDbWrite && node.arguments.length > 0) {
          // First argument of patch/delete is always the Id
          const idArg = node.arguments[0];
          try {
            const argType = checker.getTypeAtLocation(idArg);
            const typeStr = checker.typeToString(argType);
            const tableName = tableNameFromIdTypeString(typeStr);
            if (tableName && tableMapKeys.has(tableName)) {
              const { line } =
                sourceFile.getLineAndCharacterOfPosition(node.getStart());
              violations.push({
                lineNum: line + 1,
                text: sourceFile.text.split("\n")[line].trim(),
                tableName,
                method: methodName,
              });
            }
          } catch {
            // Type resolution failed for this node — skip.
          }
        }
      }
    }
  }
  ts.forEachChild(node, (child) =>
    visitForWriteCalls(
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

async function findPatchDeleteViolationsViaTypeChecker(tableMapKeys) {
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
    if (PATCH_DELETE_PENDING.has(moduleKey)) continue;

    const aliases = new Set();
    collectCtxDbAliases(sourceFile, aliases, ts);

    const violations = [];
    visitForWriteCalls(
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
async function main() {
  const tableMapKeys = extractTableMapKeys();

  if (tableMapKeys.size === 0) {
    console.error(
      "convex-db-writes-gate: could not extract TABLE_MAP keys from convex/_helpers/supabaseDb.ts",
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

    if (!INSERT_PENDING.has(moduleKey)) {
      const violations = findInsertViolations(content, tableMapKeys);
      if (violations.length > 0) {
        allViolations.push({ file: relPath, violations });
      }
    }
  }

  // TypeScript type-checker scan for patch/delete violations.
  const tcViolations =
    await findPatchDeleteViolationsViaTypeChecker(tableMapKeys);

  if (tcViolations === null) {
    console.warn(
      "convex-db-writes-gate: TypeScript not available — ctx.db.patch/delete scan skipped." +
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
      `✓ convex-db-writes-gate: no ctx.db.insert / ctx.db.patch / ctx.db.delete` +
        ` writes on TABLE_MAP tables detected` +
        ` (${scanned} files scanned, ${tableMapKeys.size} TABLE_MAP tables tracked).`,
    );
    process.exit(0);
  }

  const totalViolations = allViolations.reduce(
    (n, f) => n + f.violations.length,
    0,
  );
  console.error(
    `\nconvex-db-writes-gate: ${totalViolations} forbidden ctx.db write(s) on TABLE_MAP tables.\n`,
  );

  for (const { file, violations } of allViolations) {
    for (const v of violations) {
      console.error(`  convex/${file}:${v.lineNum}  — table: "${v.tableName}"`);
      console.error(`    ${v.text}`);
    }
  }

  console.error(`
TABLE_MAP tables live in Supabase. Writing them via ctx.db.insert creates a
row in the Convex document store that Supabase will never see. ctx.db.patch /
ctx.db.delete may silently fail or mutate stale Convex documents.

Correct write path in Convex functions:
  const db = createSupabaseDb();
  await db.insert("tableName", row);
  await db.patch("tableName", id, updates);
  await db.delete("tableName", id);
  (see convex/_helpers/supabaseDb.ts)

ctx.db.patch/delete detection uses the TypeScript type-checker: it flags all
calls where the id argument's type is Id<"tableName"> for a TABLE_MAP table.
Requires the typescript devDependency to be installed (npm ci).

To add a legitimate exemption (backfill script, seed utility, dual-write
pattern, dev tool), add the module path (relative to convex/, no .ts extension)
to WHITELIST_PATHS in scripts/check-convex-db-writes.mjs with a comment
explaining why the ctx.db write is intentional.

For known violations pending migration, add to INSERT_PENDING (for insert) or
PATCH_DELETE_PENDING (for patch/delete). These are tracked in issue #4943.

See issue #4943 (writes gate), issue #3846 (reads gate) for context.
`);

  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
