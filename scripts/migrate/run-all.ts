#!/usr/bin/env npx tsx
/**
 * Combined Migration Runner — ALL entities
 *
 * Production entrypoint that migrates every Convex table into PostgreSQL
 * (Supabase) in full FK-dependency order.
 *
 * Usage:
 *   npx tsx scripts/migrate/run-all.ts <path-to-export.zip>
 *   npm run migrate:all -- <path-to-export.zip>
 *
 * Tables migrated (48 tables in FK order):
 *   See setInsertionOrder() below for the full dependency chain.
 */

// --- Register ALL table configs (side-effect imports) ---

// 1. FK roots
import "./tables/users.js";
import "./tables/organizations.js";

// 2. Platform standalone
import "./tables/plans.js";

// 3. Platform entities
import "./tables/subscriptions.js";
import "./tables/product-subscriptions.js";
import "./tables/team-memberships.js";
import "./tables/org-settings.js";
import "./tables/invitations.js";
import "./tables/notifications.js";
import "./tables/audit-log.js";
import "./tables/recently-viewed.js";

// 4. Taxonomy
import "./tables/tag-definitions.js";
import "./tables/category-definitions.js";
import "./tables/activity-type-definitions.js";

// 5. CRM core entities
import "./tables/contacts.js";
import "./tables/companies.js";
import "./tables/products.js";
import "./tables/sources.js";
import "./tables/lost-reasons.js";

// 6. Pipeline hierarchy
import "./tables/pipelines.js";
import "./tables/pipeline-stages.js";
import "./tables/pipeline-stage-actions.js";

// 7. Leads & deals
import "./tables/leads.js";
import "./tables/deal-products.js";
import "./tables/scheduled-activities.js";

// 8. CRM attached entities
import "./tables/calls.js";
import "./tables/documents.js";
import "./tables/notes.js";
import "./tables/activities.js";
import "./tables/saved-views.js";
import "./tables/custom-field-definitions.js";
import "./tables/custom-field-values.js";
import "./tables/object-relationships.js";

// 9. Email system
import "./tables/email-templates.js";
import "./tables/email-layouts.js";
import "./tables/email-accounts.js";
import "./tables/mail-providers.js";
import "./tables/emails.js";
import "./tables/email-brand-config.js";
import "./tables/email-event-types.js";
import "./tables/email-event-bindings.js";
import "./tables/email-event-log.js";
import "./tables/email-sequences.js";
import "./tables/email-sequence-steps.js";
import "./tables/email-sequence-enrollments.js";

// 10. Automation engine
import "./tables/automation-rules.js";
import "./tables/automation-runs.js";
import "./tables/automation-run-steps.js";

// --- Set global FK insertion order ---
import { setInsertionOrder } from "./config.js";

setInsertionOrder([
  // ── FK roots ──
  "users",
  "organizations",

  // ── Platform ──
  "plans",
  "subscriptions",
  "product_subscriptions",
  "team_memberships",
  "org_settings",
  "invitations",
  "notifications",
  "audit_log",
  "recently_viewed",

  // ── Taxonomy ──
  "tag_definitions",
  "category_definitions",
  "activity_type_definitions",

  // ── CRM core ──
  "contacts",
  "companies",
  "products",
  "sources",
  "lost_reasons",

  // ── Pipeline hierarchy ──
  "pipelines",
  "pipeline_stages",
  "pipeline_stage_actions",

  // ── Leads & deals ──
  "leads",
  "deal_products",
  "scheduled_activities",

  // ── CRM attached ──
  "calls",
  "documents",
  "notes",
  "activities",
  "saved_views",
  "custom_field_definitions",
  "custom_field_values",
  "object_relationships",

  // ── Email system ──
  "email_templates",
  "email_layouts",
  "email_accounts",
  "mail_providers",
  "emails",
  "email_brand_config",
  "email_event_types",
  "email_event_bindings",
  "email_event_log",
  "email_sequences",
  "email_sequence_steps",
  "email_sequence_enrollments",

  // ── Automation engine ──
  "automation_rules",
  "automation_runs",
  "automation_run_steps",
]);

// --- Run ---
import { runMigrationCli } from "./framework.js";

const zipPath = process.argv[2];

if (!zipPath) {
  console.error("Usage: npx tsx scripts/migrate/run-all.ts <export.zip>");
  console.error("");
  console.error("  Export first:  npx convex export --path export.zip");
  console.error("  Then migrate:  npm run migrate:all -- export.zip");
  process.exit(1);
}

runMigrationCli(zipPath);
