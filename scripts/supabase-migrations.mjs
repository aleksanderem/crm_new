#!/usr/bin/env node
// Check / apply Supabase SQL migrations against the database in $SUPABASE_DB_URL.
//
// Tracks applied migrations in `supabase_migrations.schema_migrations` (the same
// schema the Supabase CLI uses), keyed by the filename version prefix
// (e.g. `00005` for `00005_gabinet_treatment_tax_exempt.sql`).
//
// Modes:
//   check               — print pending migrations, exit non-zero if any (default)
//   apply               — apply pending migrations in order, each wrapped in
//                         BEGIN/COMMIT, recording success in schema_migrations
//   mark <ver> [<ver>…] — record the given versions as applied without running
//                         them. One-time bootstrap when the deployed database
//                         already has migrations that were applied manually
//                         (e.g. 00001-00004 in this repo).
//
// Requires `psql` on PATH (preinstalled on ubuntu-latest GitHub runners).
//
// Why this exists: issue #935 — migration 00005 was merged 2 days before being
// flagged as missing from quera-dev because nothing in CI/CD applies migrations.

import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const MIGRATIONS_DIR = "supabase/migrations";
const MODE = (process.argv[2] ?? "check").toLowerCase();

if (!["check", "apply", "mark"].includes(MODE)) {
  console.error(`Unknown mode "${MODE}". Use "check", "apply", or "mark".`);
  process.exit(2);
}

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("SUPABASE_DB_URL is not set. Skipping migration check.");
  // Exit 0 so callers that haven't configured the secret aren't blocked.
  // The CI workflow gates the job on the secret separately for stricter enforcement.
  process.exit(0);
}

if (!existsSync(MIGRATIONS_DIR)) {
  console.error(`No ${MIGRATIONS_DIR} directory found.`);
  process.exit(0);
}

function ensurePsql(result) {
  if (result.error && result.error.code === "ENOENT") {
    throw new Error(
      "psql is not installed or not on PATH. Install postgresql-client " +
        "(it is preinstalled on GitHub ubuntu-latest runners).",
    );
  }
}

function runPsql(sql, { captureStdout = false } = {}) {
  const result = spawnSync(
    "psql",
    [
      dbUrl,
      "-v",
      "ON_ERROR_STOP=1",
      "--no-psqlrc",
      "--quiet",
      ...(captureStdout ? ["-tA"] : []),
      "-c",
      sql,
    ],
    { encoding: "utf8" },
  );
  ensurePsql(result);
  if (result.status !== 0) {
    const stderr = result.stderr ?? "";
    throw new Error(`psql failed (exit ${result.status}): ${stderr.trim()}`);
  }
  return result.stdout ?? "";
}

function runPsqlFile(path) {
  const result = spawnSync(
    "psql",
    [
      dbUrl,
      "-v",
      "ON_ERROR_STOP=1",
      "--no-psqlrc",
      "--quiet",
      "--single-transaction",
      "-f",
      path,
    ],
    { encoding: "utf8" },
  );
  ensurePsql(result);
  if (result.status !== 0) {
    const stderr = result.stderr ?? "";
    throw new Error(`psql failed applying ${path} (exit ${result.status}): ${stderr.trim()}`);
  }
}

function parseFile(name) {
  const match = /^(\d+)_(.+)\.sql$/u.exec(name);
  if (!match) return null;
  return { version: match[1], name: match[2], file: name };
}

const localMigrations = readdirSync(MIGRATIONS_DIR)
  .map(parseFile)
  .filter((m) => m !== null)
  .sort((a, b) => a.version.localeCompare(b.version));

if (localMigrations.length === 0) {
  console.log("No migration files found.");
  process.exit(0);
}

// Ensure tracking table exists
runPsql(`
  CREATE SCHEMA IF NOT EXISTS supabase_migrations;
  CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
    version TEXT PRIMARY KEY,
    name TEXT,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);

const appliedRaw = runPsql(
  "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;",
  { captureStdout: true },
);
const applied = new Set(
  appliedRaw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean),
);

if (MODE === "mark") {
  const versions = process.argv.slice(3);
  if (versions.length === 0) {
    console.error("mark mode requires one or more version arguments.");
    console.error("Example: node scripts/supabase-migrations.mjs mark 00001 00002");
    process.exit(2);
  }
  const localVersions = new Set(localMigrations.map((m) => m.version));
  for (const v of versions) {
    if (!localVersions.has(v)) {
      console.error(`Version "${v}" has no matching file in ${MIGRATIONS_DIR}.`);
      process.exit(2);
    }
  }
  for (const v of versions) {
    const m = localMigrations.find((x) => x.version === v);
    const sanitizedName = m.name.replace(/'/gu, "''");
    runPsql(
      `INSERT INTO supabase_migrations.schema_migrations (version, name) ` +
        `VALUES ('${m.version}', '${sanitizedName}') ` +
        `ON CONFLICT (version) DO NOTHING;`,
    );
    console.log(`marked ${m.version} as applied`);
  }
  process.exit(0);
}

const pending = localMigrations.filter((m) => !applied.has(m.version));

if (pending.length === 0) {
  console.log(
    `All ${localMigrations.length} migrations applied (latest: ${localMigrations.at(-1).version}).`,
  );
  process.exit(0);
}

console.log(`Pending migrations (${pending.length}):`);
for (const m of pending) console.log(`  - ${m.file}`);

if (MODE === "check") {
  console.error(
    "\nThe deployed database is missing the migrations above. Run\n" +
      "`npm run migrations:apply` (with SUPABASE_DB_URL set) to apply them, or wait\n" +
      "for the CI workflow on main to do it.",
  );
  process.exit(1);
}

// apply
for (const m of pending) {
  const path = join(MIGRATIONS_DIR, m.file);
  console.log(`Applying ${m.file}...`);
  runPsqlFile(path);
  // Record after success. We do this in a separate statement because some
  // migrations contain statements that cannot run inside a transaction
  // (e.g. CREATE INDEX CONCURRENTLY). psql --single-transaction will already
  // have committed if all statements ran successfully.
  const sanitizedName = m.name.replace(/'/gu, "''");
  runPsql(
    `INSERT INTO supabase_migrations.schema_migrations (version, name) ` +
      `VALUES ('${m.version}', '${sanitizedName}') ` +
      `ON CONFLICT (version) DO NOTHING;`,
  );
  console.log(`  applied ${m.version}`);
}

console.log(`\nApplied ${pending.length} migration(s).`);

// Reload PostgREST schema cache so newly-added columns/tables are visible
// without waiting for the periodic refresh. Safe no-op if pgrst isn't listening.
try {
  runPsql("NOTIFY pgrst, 'reload schema';");
  console.log("Notified PostgREST to reload schema cache.");
} catch (err) {
  console.warn(`Could not notify PostgREST: ${err.message}`);
}
