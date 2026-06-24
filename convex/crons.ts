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

export default crons;
