#!/usr/bin/env npx tsx
/**
 * Automation Engine Entities Migration Runner
 *
 * Migrates all S04 automation entities (plus their FK dependencies)
 * from a Convex export ZIP into PostgreSQL (Supabase).
 *
 * Usage:
 *   npx tsx scripts/migrate/run-automation.ts <path-to-export.zip>
 *   npm run migrate:automation -- <path-to-export.zip>
 *
 * Tables migrated (in FK order):
 *   1. users                    (FK root)
 *   2. organizations            (FK root)
 *   3. automation_rules         (depends on: organizations, users)
 *   4. automation_runs          (depends on: organizations, automation_rules, users)
 *   5. automation_run_steps     (depends on: organizations, automation_runs, automation_rules)
 */

// --- Register table configs (side-effect imports populate the registry) ---
// FK-root tables
import "./tables/users.js";
import "./tables/organizations.js";

// S04 automation entities
import "./tables/automation-rules.js";
import "./tables/automation-runs.js";
import "./tables/automation-run-steps.js";

// --- Set FK insertion order ---
import { setInsertionOrder } from "./config.js";

setInsertionOrder([
  // FK roots
  "users",
  "organizations",
  // Automation hierarchy
  "automation_rules",
  "automation_runs",
  "automation_run_steps",
]);

// --- Run ---
import { runMigrationCli } from "./framework.js";

const zipPath = process.argv[2];

if (!zipPath) {
  console.error(
    "Usage: npx tsx scripts/migrate/run-automation.ts <export.zip>",
  );
  console.error("");
  console.error("  Export first:  npx convex export --path export.zip");
  console.error("  Then migrate:  npm run migrate:automation -- export.zip");
  process.exit(1);
}

runMigrationCli(zipPath);
