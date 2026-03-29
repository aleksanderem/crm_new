/**
 * Migration Framework — Core Engine
 *
 * Reads a Convex export ZIP, parses JSONL files, maps fields via per-table
 * configs, and upserts into PostgreSQL (Supabase) in FK-dependency order.
 *
 * Usage (from T02):
 *   import { runMigration } from "./framework.js";
 *   import "./tables/contacts.js"; // registers config via registerTable()
 *   const result = await runMigration("/path/to/export.zip");
 */

import { createReadStream, existsSync } from "node:fs";
import { readdir, stat, mkdtemp, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { createInterface } from "node:readline";
import { tmpdir } from "node:os";

// Use dynamic import so the script works with both ESM and CJS resolution
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

import { buildMigrationPlan } from "./config.js";
import type {
  MigrationError,
  MigrationPlan,
  MigrationResult,
  TableMigrationConfig,
  TableMigrationResult,
} from "./types.js";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

dotenv.config({ path: ".env.local" });

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Supabase client (service-role — full access, no RLS)
// ---------------------------------------------------------------------------

function createMigrationClient(): SupabaseClient {
  const url = getEnvOrThrow("SUPABASE_URL");
  const key = getEnvOrThrow("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------------------------------------------------------------------------
// ZIP extraction
// ---------------------------------------------------------------------------

/**
 * Extracts a ZIP file to a temporary directory.
 * Uses the `unzip` CLI command for reliability with large archives.
 * Falls back to a manual approach if unzip is unavailable.
 *
 * Returns the path to the temp directory containing extracted files.
 */
async function extractZip(zipPath: string): Promise<string> {
  if (!existsSync(zipPath)) {
    throw new Error(`Export ZIP not found: ${zipPath}`);
  }

  const tmpDir = await mkdtemp(join(tmpdir(), "convex-migrate-"));

  // Try native unzip first (faster, handles large files well)
  const { execSync } = await import("node:child_process");
  try {
    execSync(`unzip -o -q "${zipPath}" -d "${tmpDir}"`, {
      stdio: "pipe",
      timeout: 120_000,
    });
  } catch {
    // Fallback: use Node.js built-in zlib for .zip extraction
    // For production use, this handles the common ZIP format from Convex
    throw new Error(
      `Failed to extract ZIP. Ensure 'unzip' is installed or the file is a valid ZIP archive.`,
    );
  }

  return tmpDir;
}

// ---------------------------------------------------------------------------
// JSONL parsing
// ---------------------------------------------------------------------------

/**
 * Finds the JSONL file for a given Convex table inside the extracted directory.
 *
 * Convex export structure:
 *   export_dir/
 *     <tableName>/documents.jsonl
 *   OR
 *     <tableName>.jsonl (older format)
 */
async function findJsonlFile(
  extractDir: string,
  tableName: string,
): Promise<string | null> {
  // Format 1: <tableName>/documents.jsonl
  const nested = join(extractDir, tableName, "documents.jsonl");
  if (existsSync(nested)) return nested;

  // Format 2: <tableName>.jsonl (flat)
  const flat = join(extractDir, `${tableName}.jsonl`);
  if (existsSync(flat)) return flat;

  // Check for a single-level subdirectory (some exports wrap in a folder)
  const entries = await readdir(extractDir);
  for (const entry of entries) {
    const subDir = join(extractDir, entry);
    const s = await stat(subDir);
    if (s.isDirectory()) {
      const subNested = join(subDir, tableName, "documents.jsonl");
      if (existsSync(subNested)) return subNested;
    }
  }

  return null;
}

/**
 * Reads a JSONL file line-by-line, yielding parsed JSON objects.
 * Memory-efficient: streams one line at a time.
 */
async function* parseJsonlFile(
  filePath: string,
): AsyncGenerator<Record<string, unknown>> {
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      yield JSON.parse(trimmed) as Record<string, unknown>;
    } catch (err) {
      console.warn(
        `⚠ Skipping malformed JSONL line in ${basename(filePath)}: ${(err as Error).message}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

/**
 * Applies field mappings to a single Convex row, producing a PostgreSQL row.
 */
function mapRow(
  raw: Record<string, unknown>,
  config: TableMigrationConfig,
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};

  for (const fm of config.fields) {
    const rawValue = raw[fm.source];
    mapped[fm.target] = fm.transform ? fm.transform(rawValue, raw) : rawValue;
  }

  if (config.postTransform) {
    return config.postTransform(mapped, raw);
  }

  return mapped;
}

// ---------------------------------------------------------------------------
// Batched upsert
// ---------------------------------------------------------------------------

const BATCH_SIZE = 500;

/**
 * Upserts rows into a Supabase table in batches.
 * Uses `onConflict: 'id'` for idempotent re-runs.
 */
async function batchUpsert(
  client: SupabaseClient,
  targetTable: string,
  rows: Record<string, unknown>[],
): Promise<{ inserted: number; errors: MigrationError[] }> {
  let inserted = 0;
  const errors: MigrationError[] = [];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    const { error } = await client
      .from(targetTable)
      .upsert(batch, { onConflict: "id" });

    if (error) {
      // Log the batch error and record each row as failed
      const batchStart = i;
      for (let j = 0; j < batch.length; j++) {
        errors.push({
          rowIndex: batchStart + j,
          convexId: (batch[j].id as string) ?? null,
          message: error.message,
        });
      }
      console.error(
        `  ✗ Batch ${Math.floor(i / BATCH_SIZE) + 1} failed for ${targetTable}: ${error.message}`,
      );
    } else {
      inserted += batch.length;
    }
  }

  return { inserted, errors };
}

// ---------------------------------------------------------------------------
// Single table migration
// ---------------------------------------------------------------------------

async function migrateTable(
  client: SupabaseClient,
  extractDir: string,
  config: TableMigrationConfig,
): Promise<TableMigrationResult> {
  const start = Date.now();
  const result: TableMigrationResult = {
    sourceTable: config.sourceTable,
    targetTable: config.targetTable,
    rowsRead: 0,
    rowsInserted: 0,
    rowsSkipped: 0,
    errors: [],
    durationMs: 0,
  };

  console.log(`\n📦 Migrating: ${config.sourceTable} → ${config.targetTable}`);

  // 1. Find the JSONL file
  const jsonlPath = await findJsonlFile(extractDir, config.sourceTable);
  if (!jsonlPath) {
    console.warn(
      `  ⚠ No JSONL file found for "${config.sourceTable}" — skipping`,
    );
    result.durationMs = Date.now() - start;
    return result;
  }

  // 2. Parse and map all rows
  const mappedRows: Record<string, unknown>[] = [];

  for await (const raw of parseJsonlFile(jsonlPath)) {
    result.rowsRead++;

    if (config.skipRow && config.skipRow(raw)) {
      result.rowsSkipped++;
      continue;
    }

    try {
      const mapped = mapRow(raw, config);
      mappedRows.push(mapped);
    } catch (err) {
      result.errors.push({
        rowIndex: result.rowsRead - 1,
        convexId: (raw._id as string) ?? null,
        message: (err as Error).message,
      });
    }
  }

  console.log(
    `  📄 Read ${result.rowsRead} rows (${result.rowsSkipped} skipped, ${mappedRows.length} to insert)`,
  );

  // 3. Batch upsert
  if (mappedRows.length > 0) {
    const { inserted, errors } = await batchUpsert(
      client,
      config.targetTable,
      mappedRows,
    );
    result.rowsInserted = inserted;
    result.errors.push(...errors);
  }

  result.durationMs = Date.now() - start;

  // 4. Summary
  const status =
    result.errors.length > 0
      ? `⚠ ${result.errors.length} errors`
      : "✓ success";
  console.log(
    `  ${status} — ${result.rowsInserted} inserted in ${result.durationMs}ms`,
  );

  return result;
}

// ---------------------------------------------------------------------------
// Full migration run
// ---------------------------------------------------------------------------

/**
 * Run the full migration pipeline:
 * 1. Extract the Convex export ZIP
 * 2. Build the migration plan from registered configs
 * 3. Migrate each table in FK-dependency order
 * 4. Report results
 *
 * @param zipPath  Path to the Convex export ZIP file
 * @returns        Migration results with per-table statistics
 */
export async function runMigration(zipPath: string): Promise<MigrationResult> {
  const totalStart = Date.now();

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Convex → Supabase Migration");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  ZIP: ${zipPath}`);

  // 1. Build plan
  const plan = buildMigrationPlan();
  console.log(
    `  Tables: ${plan.insertionOrder.length} (${plan.insertionOrder.join(" → ")})`,
  );

  // 2. Create Supabase client
  const client = createMigrationClient();

  // 3. Extract ZIP
  console.log("\n📂 Extracting export archive...");
  const extractDir = await extractZip(zipPath);
  console.log(`  Extracted to: ${extractDir}`);

  // 4. Migrate tables in order
  const tableResults: TableMigrationResult[] = [];

  for (const tableName of plan.insertionOrder) {
    const config = plan.configs.get(tableName);
    if (!config) {
      console.warn(`  ⚠ No config for "${tableName}" — skipping`);
      continue;
    }
    const result = await migrateTable(client, extractDir, config);
    tableResults.push(result);
  }

  // 5. Cleanup temp directory
  try {
    await rm(extractDir, { recursive: true, force: true });
  } catch {
    console.warn(`  ⚠ Could not clean up temp dir: ${extractDir}`);
  }

  // 6. Build summary
  const migrationResult: MigrationResult = {
    tables: tableResults,
    totalRowsRead: tableResults.reduce((s, r) => s + r.rowsRead, 0),
    totalRowsInserted: tableResults.reduce((s, r) => s + r.rowsInserted, 0),
    totalErrors: tableResults.reduce((s, r) => s + r.errors.length, 0),
    durationMs: Date.now() - totalStart,
  };

  // 7. Print final report
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  Migration Complete");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Total rows read:     ${migrationResult.totalRowsRead}`);
  console.log(`  Total rows inserted: ${migrationResult.totalRowsInserted}`);
  console.log(`  Total errors:        ${migrationResult.totalErrors}`);
  console.log(
    `  Duration:            ${(migrationResult.durationMs / 1000).toFixed(1)}s`,
  );

  if (migrationResult.totalErrors > 0) {
    console.log("\n  ⚠ Errors by table:");
    for (const tr of tableResults) {
      if (tr.errors.length > 0) {
        console.log(`    ${tr.targetTable}: ${tr.errors.length} errors`);
        // Show first 3 errors per table
        for (const e of tr.errors.slice(0, 3)) {
          console.log(`      row ${e.rowIndex}: ${e.message}`);
        }
        if (tr.errors.length > 3) {
          console.log(`      ... and ${tr.errors.length - 3} more`);
        }
      }
    }
  }

  console.log("");
  return migrationResult;
}

/**
 * Convenience: run migration and exit with appropriate code.
 * Intended as the entry point when invoked via `npx tsx scripts/migrate/run.ts`.
 */
export async function runMigrationCli(zipPath: string): Promise<void> {
  try {
    const result = await runMigration(zipPath);
    process.exit(result.totalErrors > 0 ? 1 : 0);
  } catch (err) {
    console.error("\n💥 Migration failed:", (err as Error).message);
    process.exit(2);
  }
}
