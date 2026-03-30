#!/usr/bin/env npx tsx
/**
 * Platform Entities Migration Runner
 *
 * Migrates all platform-level entities from a Convex export ZIP
 * into PostgreSQL (Supabase).
 *
 * Usage:
 *   npx tsx scripts/migrate/run-platform.ts <path-to-export.zip>
 *   npm run migrate:platform -- <path-to-export.zip>
 *
 * Tables migrated (in FK order):
 *   1. users                       (FK root)
 *   2. organizations               (FK root, depends on: users)
 *   3. plans                       (standalone — no FK deps)
 *   4. subscriptions               (depends on: users, plans)
 *   5. product_subscriptions       (depends on: organizations)
 *   6. team_memberships            (depends on: users, organizations)
 *   7. org_settings                (depends on: organizations)
 *   8. invitations                 (depends on: organizations, users)
 *   9. notifications               (depends on: organizations, users)
 *  10. audit_log                   (depends on: organizations, users)
 *  11. recently_viewed             (depends on: organizations, users)
 *  12. tag_definitions             (depends on: organizations)
 *  13. category_definitions        (depends on: organizations)
 *  14. activity_type_definitions   (depends on: organizations)
 */

// --- Register table configs (side-effect imports populate the registry) ---
// FK-root tables
import "./tables/users.js";
import "./tables/organizations.js";

// Standalone lookup
import "./tables/plans.js";

// Platform entities
import "./tables/subscriptions.js";
import "./tables/product-subscriptions.js";
import "./tables/team-memberships.js";
import "./tables/org-settings.js";
import "./tables/invitations.js";
import "./tables/notifications.js";
import "./tables/audit-log.js";
import "./tables/recently-viewed.js";
import "./tables/tag-definitions.js";
import "./tables/category-definitions.js";
import "./tables/activity-type-definitions.js";

// --- Set FK insertion order ---
import { setInsertionOrder } from "./config.js";

setInsertionOrder([
  // FK roots
  "users",
  "organizations",
  // Standalone lookup
  "plans",
  // User-level subscriptions (depends on users, plans)
  "subscriptions",
  // Org-level subscriptions (depends on organizations)
  "product_subscriptions",
  // Org membership (depends on users, organizations)
  "team_memberships",
  // Org config (depends on organizations)
  "org_settings",
  // Invitations (depends on organizations, users)
  "invitations",
  // User-scoped (depends on organizations, users)
  "notifications",
  "audit_log",
  "recently_viewed",
  // Taxonomy (depends on organizations)
  "tag_definitions",
  "category_definitions",
  "activity_type_definitions",
]);

// --- Run ---
import { runMigrationCli } from "./framework.js";

const zipPath = process.argv[2];

if (!zipPath) {
  console.error(
    "Usage: npx tsx scripts/migrate/run-platform.ts <export.zip>",
  );
  console.error("");
  console.error("  Export first:  npx convex export --path export.zip");
  console.error("  Then migrate:  npm run migrate:platform -- export.zip");
  process.exit(1);
}

runMigrationCli(zipPath);
