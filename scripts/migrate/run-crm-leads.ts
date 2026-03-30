#!/usr/bin/env npx tsx
/**
 * CRM Lead Pipeline Entities Migration Runner
 *
 * Migrates all S02 lead-pipeline entities (plus their FK dependencies)
 * from a Convex export ZIP into PostgreSQL (Supabase).
 *
 * Usage:
 *   npx tsx scripts/migrate/run-crm-leads.ts <path-to-export.zip>
 *   npm run migrate:crm-leads -- <path-to-export.zip>
 *
 * Tables migrated (in FK order):
 *   1. users                    (FK root)
 *   2. organizations            (FK root)
 *   3. tag_definitions          (FK root)
 *   4. category_definitions     (FK root)
 *   5. companies                (FK root for leads.company_id)
 *   6. products                 (FK root for deal_products.product_id)
 *   7. pipelines                (depends on: organizations, users)
 *   8. pipeline_stages          (depends on: pipelines, organizations)
 *   9. pipeline_stage_actions   (depends on: pipeline_stages, organizations)
 *  10. leads                    (depends on: organizations, companies, users, pipeline_stages)
 *  11. deal_products            (depends on: leads, products, organizations)
 *  12. scheduled_activities     (depends on: organizations, users)
 */

// --- Register table configs (side-effect imports populate the registry) ---
// FK-root tables
import "./tables/users.js";
import "./tables/organizations.js";
import "./tables/tag-definitions.js";
import "./tables/category-definitions.js";
import "./tables/companies.js";
import "./tables/products.js";

// S02 lead-pipeline entities
import "./tables/pipelines.js";
import "./tables/pipeline-stages.js";
import "./tables/pipeline-stage-actions.js";
import "./tables/leads.js";
import "./tables/deal-products.js";
import "./tables/scheduled-activities.js";

// --- Set FK insertion order ---
import { setInsertionOrder } from "./config.js";

setInsertionOrder([
  // FK roots
  "users",
  "organizations",
  "tag_definitions",
  "category_definitions",
  "companies",
  "products",
  // Pipeline hierarchy
  "pipelines",
  "pipeline_stages",
  "pipeline_stage_actions",
  // Leads (depends on pipeline_stages, companies, users)
  "leads",
  // Lead-attached
  "deal_products",
  // Scheduled activities (depends on users, organizations)
  "scheduled_activities",
]);

// --- Run ---
import { runMigrationCli } from "./framework.js";

const zipPath = process.argv[2];

if (!zipPath) {
  console.error(
    "Usage: npx tsx scripts/migrate/run-crm-leads.ts <export.zip>",
  );
  console.error("");
  console.error("  Export first:  npx convex export --path export.zip");
  console.error("  Then migrate:  npm run migrate:crm-leads -- export.zip");
  process.exit(1);
}

runMigrationCli(zipPath);
