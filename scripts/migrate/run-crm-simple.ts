#!/usr/bin/env npx tsx
/**
 * CRM Simple Entities Migration Runner
 *
 * Migrates all S01 entities (plus their FK dependencies) from a Convex
 * export ZIP into PostgreSQL (Supabase).
 *
 * Usage:
 *   npx tsx scripts/migrate/run-crm-simple.ts <path-to-export.zip>
 *   npm run migrate:crm-simple -- <path-to-export.zip>
 *
 * Tables migrated (in FK order):
 *   1. users
 *   2. organizations
 *   3. team_memberships
 *   4. tag_definitions
 *   5. category_definitions
 *   6. contacts
 *   7. companies
 *   8. products
 *   9. sources
 *  10. lost_reasons
 *  11. calls
 *  12. documents
 *  13. notes                    (self-ref: parent_note_id)
 *  14. activities
 *  15. saved_views
 *  16. custom_field_definitions
 *  17. custom_field_values      (FK → custom_field_definitions)
 *  18. object_relationships
 */

// --- Register table configs (side-effect imports populate the registry) ---
// FK-root tables (already registered by run-contacts)
import "./tables/users.js";
import "./tables/organizations.js";
import "./tables/team-memberships.js";
import "./tables/tag-definitions.js";
import "./tables/category-definitions.js";

// S01 entities
import "./tables/contacts.js";
import "./tables/companies.js";
import "./tables/products.js";
import "./tables/sources.js";
import "./tables/lost-reasons.js";
import "./tables/calls.js";
import "./tables/documents.js";
import "./tables/notes.js";
import "./tables/activities.js";
import "./tables/saved-views.js";
import "./tables/custom-field-definitions.js";
import "./tables/custom-field-values.js";
import "./tables/object-relationships.js";

// --- Set FK insertion order ---
import { setInsertionOrder } from "./config.js";

setInsertionOrder([
  // FK roots
  "users",
  "organizations",
  "team_memberships",
  "tag_definitions",
  "category_definitions",
  // CRM entities (no cross-entity FKs)
  "contacts",
  "companies",
  "products",
  "sources",
  "lost_reasons",
  "calls",
  "documents",
  // Entity-attached (depend on entity rows existing)
  "notes",
  "activities",
  "saved_views",
  // Custom fields: definitions first, then values
  "custom_field_definitions",
  "custom_field_values",
  // Relationships last (reference any entity)
  "object_relationships",
]);

// --- Run ---
import { runMigrationCli } from "./framework.js";

const zipPath = process.argv[2];

if (!zipPath) {
  console.error(
    "Usage: npx tsx scripts/migrate/run-crm-simple.ts <export.zip>",
  );
  console.error("");
  console.error("  Export first:  npx convex export --path export.zip");
  console.error("  Then migrate:  npm run migrate:crm-simple -- export.zip");
  process.exit(1);
}

runMigrationCli(zipPath);
