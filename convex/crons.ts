import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "sync-google-calendars",
  { minutes: 10 },
  internal.google.calendarSync.syncAll
);

export default crons;
