#!/usr/bin/env npx tsx
/**
 * Contacts Migration Runner
 *
 * Migrates contacts and their FK dependencies from a Convex export ZIP
 * into PostgreSQL (Supabase).
 *
 * Usage:
 *   npx tsx scripts/migrate/run-contacts.ts <path-to-export.zip>
 *   npm run migrate:contacts -- <path-to-export.zip>
 *
 * Tables migrated (in FK order):
 *   1. users
 *   2. organizations
 *   3. team_memberships
 *   4. tag_definitions
 *   5. category_definitions
 *   6. contacts
 */

// --- Register table configs (side-effect imports populate the registry) ---
import "./tables/users.js";
import "./tables/organizations.js";
import "./tables/team-memberships.js";
import "./tables/tag-definitions.js";
import "./tables/category-definitions.js";
import "./tables/contacts.js";

// --- Set FK insertion order ---
import { setInsertionOrder } from "./config.js";

setInsertionOrder([
  "users",
  "organizations",
  "team_memberships",
  "tag_definitions",
  "category_definitions",
  "contacts",
]);

// --- Run ---
import { runMigrationCli } from "./framework.js";

const zipPath = process.argv[2];

if (!zipPath) {
  console.error("Usage: npx tsx scripts/migrate/run-contacts.ts <export.zip>");
  console.error("");
  console.error("  Export first:  npx convex export --path export.zip");
  console.error("  Then migrate:  npm run migrate:contacts -- export.zip");
  process.exit(1);
}

runMigrationCli(zipPath);
