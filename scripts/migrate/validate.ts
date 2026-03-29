#!/usr/bin/env npx tsx
/**
 * Post-Migration Validation
 *
 * Connects to Supabase and validates migration results:
 *   1. Record count matching — Supabase row count vs Convex export JSONL line count
 *   2. FK integrity for contacts — organization_id, created_by, category_id all resolve
 *
 * Usage:
 *   npx tsx scripts/migrate/validate.ts <path-to-export.zip>
 *   npm run migrate:validate -- <path-to-export.zip>
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createReadStream, existsSync } from "node:fs";
import { readdir, stat, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

dotenv.config({ path: ".env.local" });

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function createValidationClient(): SupabaseClient {
  return createClient(
    getEnvOrThrow("SUPABASE_URL"),
    getEnvOrThrow("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

// ---------------------------------------------------------------------------
// ZIP extraction (reuse same logic as framework.ts)
// ---------------------------------------------------------------------------

async function extractZip(zipPath: string): Promise<string> {
  if (!existsSync(zipPath)) throw new Error(`Export ZIP not found: ${zipPath}`);
  const tmpDir = await mkdtemp(join(tmpdir(), "convex-validate-"));
  try {
    execSync(`unzip -o -q "${zipPath}" -d "${tmpDir}"`, {
      stdio: "pipe",
      timeout: 120_000,
    });
  } catch {
    throw new Error(
      "Failed to extract ZIP. Ensure 'unzip' is installed or the file is a valid ZIP archive.",
    );
  }
  return tmpDir;
}

// ---------------------------------------------------------------------------
// JSONL line counting
// ---------------------------------------------------------------------------

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

  // Check single-level subdirectory wrapper
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

async function countJsonlLines(filePath: string): Promise<number> {
  let count = 0;
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (line.trim()) count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Supabase queries
// ---------------------------------------------------------------------------

async function getTableCount(
  client: SupabaseClient,
  table: string,
): Promise<number> {
  const { count, error } = await client
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) throw new Error(`Count query failed for ${table}: ${error.message}`);
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// FK integrity checks (contacts)
// ---------------------------------------------------------------------------

interface FkCheckResult {
  label: string;
  orphanCount: number;
  totalChecked: number;
  passed: boolean;
}

async function checkContactsFkIntegrity(
  client: SupabaseClient,
): Promise<FkCheckResult[]> {
  const results: FkCheckResult[] = [];

  // 1. organization_id → organizations.id
  {
    const { data, error } = await client.rpc("check_contacts_org_fk" as never);
    if (error) {
      // Fallback: do the check in application code
      const orphans = await countOrphanedFk(
        client,
        "contacts",
        "organization_id",
        "organizations",
      );
      results.push({
        label: "contacts.organization_id → organizations.id",
        ...orphans,
      });
    } else {
      // RPC returned result
      const count = Array.isArray(data) ? data.length : 0;
      results.push({
        label: "contacts.organization_id → organizations.id",
        orphanCount: count,
        totalChecked: -1,
        passed: count === 0,
      });
    }
  }

  // 2. created_by → users.id
  {
    const orphans = await countOrphanedFk(
      client,
      "contacts",
      "created_by",
      "users",
    );
    results.push({
      label: "contacts.created_by → users.id",
      ...orphans,
    });
  }

  // 3. category_id → category_definitions.id (nullable)
  {
    const orphans = await countOrphanedFk(
      client,
      "contacts",
      "category_id",
      "category_definitions",
      true, // nullable
    );
    results.push({
      label: "contacts.category_id → category_definitions.id",
      ...orphans,
    });
  }

  return results;
}

/**
 * Counts rows in `sourceTable` whose `fkColumn` value does not exist
 * in `targetTable.id`. Works via application-level comparison.
 */
async function countOrphanedFk(
  client: SupabaseClient,
  sourceTable: string,
  fkColumn: string,
  targetTable: string,
  nullable: boolean = false,
): Promise<{ orphanCount: number; totalChecked: number; passed: boolean }> {
  // Get all distinct FK values from source
  const { data: sourceRows, error: srcErr } = await client
    .from(sourceTable)
    .select(fkColumn);

  if (srcErr) {
    throw new Error(
      `Failed to read ${sourceTable}.${fkColumn}: ${srcErr.message}`,
    );
  }

  // Get all IDs from target
  const { data: targetRows, error: tgtErr } = await client
    .from(targetTable)
    .select("id");

  if (tgtErr) {
    throw new Error(`Failed to read ${targetTable}.id: ${tgtErr.message}`);
  }

  const targetIds = new Set(
    (targetRows ?? []).map((r: unknown) => (r as Record<string, unknown>).id as string),
  );

  let totalChecked = 0;
  let orphanCount = 0;

  for (const row of sourceRows ?? []) {
    const fkValue = (row as unknown as Record<string, unknown>)[fkColumn] as
      | string
      | null;
    if (nullable && (fkValue === null || fkValue === undefined)) continue;
    totalChecked++;
    if (!targetIds.has(fkValue!)) {
      orphanCount++;
    }
  }

  return { orphanCount, totalChecked, passed: orphanCount === 0 };
}

// ---------------------------------------------------------------------------
// Main validation
// ---------------------------------------------------------------------------

const MIGRATED_TABLES = [
  { convex: "users", postgres: "users" },
  { convex: "organizations", postgres: "organizations" },
  { convex: "teamMemberships", postgres: "team_memberships" },
  { convex: "tagDefinitions", postgres: "tag_definitions" },
  { convex: "categoryDefinitions", postgres: "category_definitions" },
  { convex: "contacts", postgres: "contacts" },
];

async function main() {
  const zipPath = process.argv[2];

  if (!zipPath) {
    console.error(
      "Usage: npx tsx scripts/migrate/validate.ts <export.zip>",
    );
    console.error("");
    console.error("  Validates migration results against the original export.");
    process.exit(1);
  }

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Post-Migration Validation");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  ZIP: ${zipPath}\n`);

  const client = createValidationClient();

  // 1. Extract ZIP to count source rows
  console.log("📂 Extracting export archive for row counts...");
  const extractDir = await extractZip(zipPath);

  let passCount = 0;
  let failCount = 0;

  function pass(label: string, detail?: string) {
    passCount++;
    console.log(`  [PASS] ${label}${detail ? ` — ${detail}` : ""}`);
  }

  function fail(label: string, detail?: string) {
    failCount++;
    console.error(`  [FAIL] ${label}${detail ? ` — ${detail}` : ""}`);
  }

  // 2. Count matching per table
  console.log("\n── Record Count Matching ─────────────────────────────────\n");

  for (const { convex, postgres } of MIGRATED_TABLES) {
    const jsonlPath = await findJsonlFile(extractDir, convex);
    if (!jsonlPath) {
      fail(`${postgres} count`, `No JSONL file found for "${convex}"`);
      continue;
    }

    const sourceCount = await countJsonlLines(jsonlPath);
    const targetCount = await getTableCount(client, postgres);

    if (sourceCount === targetCount) {
      pass(`${postgres} count`, `${sourceCount} == ${targetCount}`);
    } else {
      fail(
        `${postgres} count`,
        `source=${sourceCount}, target=${targetCount} (diff: ${targetCount - sourceCount})`,
      );
    }
  }

  // 3. FK integrity for contacts
  console.log("\n── FK Integrity (contacts) ───────────────────────────────\n");

  try {
    const fkResults = await checkContactsFkIntegrity(client);
    for (const fk of fkResults) {
      if (fk.passed) {
        pass(
          fk.label,
          fk.totalChecked >= 0
            ? `${fk.totalChecked} checked, 0 orphans`
            : "0 orphans",
        );
      } else {
        fail(
          fk.label,
          `${fk.orphanCount} orphaned rows out of ${fk.totalChecked} checked`,
        );
      }
    }
  } catch (err) {
    fail("FK integrity checks", (err as Error).message);
  }

  // 4. Cleanup
  try {
    await rm(extractDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup failure
  }

  // 5. Summary
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(`  Results: ${passCount} passed, ${failCount} failed`);
  console.log("═══════════════════════════════════════════════════════════\n");

  if (failCount > 0) {
    console.error("Post-migration validation FAILED.");
    process.exit(1);
  } else {
    console.log("All checks passed. Migration validated successfully.");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("\n💥 Validation failed:", (err as Error).message);
  process.exit(2);
});
