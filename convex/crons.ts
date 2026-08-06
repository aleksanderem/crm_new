import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "sync-google-calendars",
  { minutes: 10 },
  internal.google.calendarSync.syncAll
);

// Backfill filledBy on formField nodes for all onboarded orgs. Covers orgs
// that completed gabinet setup before the filledBy feature was introduced.
// Idempotent — becomes a no-op once all templates are already correct.
crons.daily(
  "backfill-form-field-filled-by",
  { hourUTC: 3, minuteUTC: 0 },
  internal.documents.seed.backfillFilledByAllOrgs,
);

// Backfill "contact" entityType on the five "Gotowe" ready-made templates for all
// onboarded orgs. Covers orgs that completed setup before issue #2532 was fixed.
// Idempotent — becomes a no-op once all templates are already correct.
crons.daily(
  "backfill-gotowe-contact-entity-types",
  { hourUTC: 3, minuteUTC: 30 },
  internal.documents.seed.backfillGotoweContactEntityTypesAllOrgs,
);

// Mark formDocuments whose signing token has passed its 48h TTL as "expired".
// Runs hourly so the DB status stays in sync with what the signing page shows.
crons.hourly(
  "expire-signing-tokens",
  { minuteUTC: 15 },
  internal.documents.documents.expireSigningTokens,
);

// Back-fill pdf_url on receipt rows created with a NULL pdf_url (issue #3797).
// Rows are left orphaned when blob storage fails after the atomic DB insert.
// Runs hourly at :30 so it doesn't cluster with other hourly jobs (:15).
crons.hourly(
  "backfill-orphaned-pdf-receipts",
  { minuteUTC: 30 },
  internal.gabinet.receipts._backfillOrphanedPdfReceipts,
);

export default crons;
