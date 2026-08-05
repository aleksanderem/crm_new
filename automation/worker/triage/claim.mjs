import { priorityRank } from "./verdict.mjs";

// Claim the next runnable job by PLAN order (not FIFO). Runnable = triaged or
// backlog. Ordering: priority rank (P0<P1<P2<backlog) -> plan Kolejność -> age.
// Hard-excludes paused AND banned logins; preserves the per-login throttle.
// Sets status='running' atomically.
export function claimNextPlanned(db, { throttledLogins, pausedLogins, bannedLogins = [], throttleIntervalMs, now }) {
  const cutoff = now() - throttleIntervalMs;
  const hardStop = [...pausedLogins, ...bannedLogins];
  const throttleIn = throttledLogins.map(() => "?").join(",") || "''";
  const hardIn = hardStop.map(() => "?").join(",") || "''";
  const rows = db.prepare(
    `SELECT * FROM jobs
     WHERE status = 'pending' AND triage_status IN ('triaged','backlog')
       AND (trigger_login IS NULL OR trigger_login NOT IN (${hardIn}))
       AND (
         trigger_login IS NULL
         OR trigger_login NOT IN (${throttleIn})
         OR NOT EXISTS (
           SELECT 1 FROM jobs busy WHERE busy.trigger_login = jobs.trigger_login
             AND busy.status IN ('running','done','failed')
             AND COALESCE(busy.finished_at, busy.started_at, 0) > ?
         )
       )`,
  ).all(...hardStop, ...throttledLogins, cutoff);

  if (rows.length === 0) return null;
  rows.sort((a, b) =>
    (priorityRank(a.triage_priority) - priorityRank(b.triage_priority)) ||
    ((a.triage_order ?? Number.MAX_SAFE_INTEGER) - (b.triage_order ?? Number.MAX_SAFE_INTEGER)) ||
    (a.created_at - b.created_at),
  );
  const job = rows[0];
  db.prepare("UPDATE jobs SET status = 'running', started_at = ? WHERE id = ?").run(Date.now(), job.id);
  return { ...job, status: "running" };
}
