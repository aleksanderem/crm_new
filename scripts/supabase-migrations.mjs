#!/usr/bin/env node
// Check / apply Supabase SQL migrations against the deployed database.
//
// Tracks applied migrations in `supabase_migrations.schema_migrations` (the same
// schema the Supabase CLI uses), keyed by the filename version prefix
// (e.g. `00005` for `00005_gabinet_treatment_tax_exempt.sql`).
//
// Two transports, auto-selected:
//   1. HTTP (preferred) — POST ${SUPABASE_URL}/pg/query with the service-role
//      key. Works over 443 (no Postgres port needed), which is why it succeeds
//      where psql to the pooler fails. Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
//   2. psql (fallback) — raw Postgres connection via SUPABASE_DB_URL. Needs the
//      DB/pooler port reachable from the runner.
//
// Modes:
//   check               — print pending migrations, exit non-zero if any (default)
//   apply               — apply pending migrations in order, recording success
//   mark <ver> [<ver>…] — record versions as applied without running them
//
// Why this exists: issue #935 — nothing in CI/CD applied migrations, so merged
// migrations silently never reached the DB.

import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const MIGRATIONS_DIR = "supabase/migrations";
const MODE = (process.argv[2] ?? "check").toLowerCase();

if (!["check", "apply", "mark"].includes(MODE)) {
  console.error(`Unknown mode "${MODE}". Use "check", "apply", or "mark".`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Transport selection
// ---------------------------------------------------------------------------

const httpUrl = (process.env.SUPABASE_URL ?? "").replace(/\/+$/u, "");
const httpKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const dbUrl = process.env.SUPABASE_DB_URL ?? "";

const useHttp = Boolean(httpUrl && httpKey);
const usePsql = !useHttp && Boolean(dbUrl);

if (!useHttp && !usePsql) {
  // Emit a GitHub Actions warning annotation so the missing-secret state is
  // visible in the PR checks UI instead of being silently green.
  console.log(
    `::warning::No migration transport configured — skipping ${MODE}. ` +
      `Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (HTTP, preferred) or ` +
      `SUPABASE_DB_URL (psql) as repository secrets.`,
  );
  process.exit(0);
}

if (!existsSync(MIGRATIONS_DIR)) {
  console.error(`No ${MIGRATIONS_DIR} directory found.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// HTTP transport (POST ${SUPABASE_URL}/pg/query)
// ---------------------------------------------------------------------------

async function httpQuery(sql) {
  const res = await fetch(`${httpUrl}/pg/query`, {
    method: "POST",
    headers: {
      apikey: httpKey,
      Authorization: `Bearer ${httpKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`pg/query HTTP ${res.status}: ${text.slice(0, 600)}`);
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return [];
  }
  // The endpoint returns a JSON array of rows on success, or an object carrying
  // Postgres error fields (severity/code/message) on failure — even with 200.
  if (json && !Array.isArray(json) && (json.error || json.severity || json.code)) {
    throw new Error(`pg/query error: ${(json.message ?? JSON.stringify(json)).toString().slice(0, 600)}`);
  }
  return Array.isArray(json) ? json : [];
}

// ---------------------------------------------------------------------------
// psql transport (fallback)
// ---------------------------------------------------------------------------

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
    [dbUrl, "-v", "ON_ERROR_STOP=1", "--no-psqlrc", "--quiet",
      ...(captureStdout ? ["-tA"] : []), "-c", sql],
    { encoding: "utf8" },
  );
  ensurePsql(result);
  if (result.status !== 0) {
    throw new Error(`psql failed (exit ${result.status}): ${(result.stderr ?? "").trim()}`);
  }
  return result.stdout ?? "";
}

function runPsqlFile(path) {
  const result = spawnSync(
    "psql",
    [dbUrl, "-v", "ON_ERROR_STOP=1", "--no-psqlrc", "--quiet", "--single-transaction", "-f", path],
    { encoding: "utf8" },
  );
  ensurePsql(result);
  if (result.status !== 0) {
    throw new Error(`psql failed applying ${path} (exit ${result.status}): ${(result.stderr ?? "").trim()}`);
  }
}

// ---------------------------------------------------------------------------
// Transport-agnostic operations
// ---------------------------------------------------------------------------

const versionInsertSql = (version, name) =>
  `INSERT INTO supabase_migrations.schema_migrations (version, name) ` +
  `VALUES ('${version}', '${name.replace(/'/gu, "''")}') ON CONFLICT (version) DO NOTHING;`;

// Statements that cannot run inside an explicit transaction block, so the file
// must be sent as-is (implicit / autocommit) rather than wrapped in BEGIN/COMMIT.
const NON_TX = /concurrently|alter\s+type[\s\S]*?add\s+value/iu;

async function ensureTrackingTable() {
  const sql = `
    CREATE SCHEMA IF NOT EXISTS supabase_migrations;
    CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`;
  if (useHttp) await httpQuery(sql);
  else runPsql(sql);
}

async function fetchAppliedVersions() {
  if (useHttp) {
    const rows = await httpQuery(
      "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;",
    );
    return rows.map((r) => String(r.version)).filter(Boolean);
  }
  const raw = runPsql(
    "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;",
    { captureStdout: true },
  );
  return raw.split("\n").map((l) => l.trim()).filter(Boolean);
}

async function markVersion(m) {
  const sql = versionInsertSql(m.version, m.name);
  if (useHttp) await httpQuery(sql);
  else runPsql(sql);
}

async function applyMigration(m) {
  const path = join(MIGRATIONS_DIR, m.file);
  if (useHttp) {
    const body = readFileSync(path, "utf8");
    if (NON_TX.test(body)) {
      // Cannot wrap: run the file as-is, then record the version separately.
      await httpQuery(body);
      await httpQuery(versionInsertSql(m.version, m.name));
    } else {
      // Atomic: migration + version insert commit together (or not at all).
      await httpQuery(`BEGIN;\n${body}\n${versionInsertSql(m.version, m.name)}\nCOMMIT;`);
    }
  } else {
    runPsqlFile(path);
    runPsql(versionInsertSql(m.version, m.name));
  }
}

async function notifyPostgrestReload() {
  const sql = "NOTIFY pgrst, 'reload schema';";
  if (useHttp) await httpQuery(sql);
  else runPsql(sql);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

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

console.log(`Using ${useHttp ? "HTTP (pg/query)" : "psql"} transport.`);

await ensureTrackingTable();
const applied = new Set(await fetchAppliedVersions());

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
    await markVersion(m);
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
      "`npm run migrations:apply` to apply them, or wait for the CI workflow on main.",
  );
  process.exit(1);
}

// apply
for (const m of pending) {
  console.log(`Applying ${m.file}...`);
  await applyMigration(m);
  console.log(`  applied ${m.version}`);
}

console.log(`\nApplied ${pending.length} migration(s).`);

try {
  await notifyPostgrestReload();
  console.log("Notified PostgREST to reload schema cache.");
} catch (err) {
  console.warn(`Could not notify PostgREST: ${err.message}`);
}
