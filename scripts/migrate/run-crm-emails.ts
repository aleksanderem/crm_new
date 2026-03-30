#!/usr/bin/env npx tsx
/**
 * Email System Entities Migration Runner
 *
 * Migrates all S03 email-related entities (plus their FK dependencies)
 * from a Convex export ZIP into PostgreSQL (Supabase).
 *
 * Usage:
 *   npx tsx scripts/migrate/run-crm-emails.ts <path-to-export.zip>
 *   npm run migrate:crm-emails -- <path-to-export.zip>
 *
 * Tables migrated (in FK order):
 *   1. users                         (FK root)
 *   2. organizations                 (FK root)
 *   3. contacts                      (FK root for emails.contact_id)
 *   4. companies                     (FK root for emails.company_id)
 *   5. leads                         (FK root for emails.lead_id)
 *   6. email_templates               (FK root for emails, bindings, steps, event_log)
 *   7. email_layouts                 (depends on: organizations, users)
 *   8. email_accounts                (depends on: organizations)
 *   9. mail_providers                (depends on: organizations, users)
 *  10. emails                        (depends on: email_templates, mail_providers, contacts, companies, leads, users)
 *  11. email_brand_config            (depends on: organizations, users)
 *  12. email_event_types             (depends on: organizations)
 *  13. email_event_bindings          (depends on: email_templates, users)
 *  14. email_event_log               (depends on: email_event_bindings, email_templates, users)
 *  15. email_sequences               (depends on: organizations)
 *  16. email_sequence_steps          (depends on: email_sequences, email_templates)
 *  17. email_sequence_enrollments    (depends on: email_sequences)
 */

// --- Register table configs (side-effect imports populate the registry) ---
// FK-root tables
import "./tables/users.js";
import "./tables/organizations.js";
import "./tables/contacts.js";
import "./tables/companies.js";
import "./tables/leads.js";

// S03 email entities
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

// --- Set FK insertion order ---
import { setInsertionOrder } from "./config.js";

setInsertionOrder([
  // FK roots
  "users",
  "organizations",
  "contacts",
  "companies",
  "leads",
  // Email templates first (many tables reference it)
  "email_templates",
  // Standalone email entities
  "email_layouts",
  "email_accounts",
  "mail_providers",
  // Emails (depends on templates, providers, contacts, companies, leads)
  "emails",
  // Brand config (depends on organizations, users)
  "email_brand_config",
  // Event bus
  "email_event_types",
  "email_event_bindings",
  "email_event_log",
  // Sequences
  "email_sequences",
  "email_sequence_steps",
  "email_sequence_enrollments",
]);

// --- Run ---
import { runMigrationCli } from "./framework.js";

const zipPath = process.argv[2];

if (!zipPath) {
  console.error(
    "Usage: npx tsx scripts/migrate/run-crm-emails.ts <export.zip>",
  );
  console.error("");
  console.error("  Export first:  npx convex export --path export.zip");
  console.error("  Then migrate:  npm run migrate:crm-emails -- export.zip");
  process.exit(1);
}

runMigrationCli(zipPath);
