export function nextUntriagedJob(db) {
  return db.prepare(
    `SELECT * FROM jobs WHERE status = 'pending' AND triage_status = 'untriaged'
     ORDER BY created_at ASC LIMIT 1`,
  ).get() || null;
}

export function issueFromJob(job) {
  let p = {};
  try { p = JSON.parse(job.payload_json || "{}"); } catch { /* ignore */ }
  const jamLink = typeof p.body === "string" ? p.body.match(/https?:\/\/[^\s)]*jam\.dev[^\s)]*/i)?.[0] : undefined;
  return {
    number: job.issue_number,
    repo: job.repo,
    title: p.title || "",
    body: p.comment_body || p.body || "",
    login: job.trigger_login || "",
    url: p.issue_url || `https://github.com/${job.repo}/issues/${job.issue_number}`,
    jamLink,
  };
}

// Triage a single job: evaluate -> write Base record -> write GitHub verdict ->
// persist triage columns. The Base write + status update are the load-bearing
// results; a GitHub failure is logged but must not undo them (reporter comment
// can be retried, the queue decision must stick).
export async function triageJob(db, job, deps) {
  const issue = issueFromJob(job);
  const verdict = await deps.evaluate(issue, deps.planDigest);

  const pr = deps.pressureReject ? deps.pressureReject(verdict) : { reject: false };
  if (pr.reject) {
    db.prepare(
      `UPDATE jobs SET triage_status = 'rejected', triage_package = NULL, triage_priority = NULL,
         triage_order = NULL, triage_confidence = ?, triage_rationale = ? WHERE id = ?`,
    ).run(verdict.confidence, String(pr.comment).slice(0, 1000), job.id);
    try { deps.writeRejection(issue, pr.comment); }
    catch (e) { deps.log?.({ level: "warn", msg: "triage-rejection-write-failed", id: job.id, err: String(e).slice(0, 300) }); }
    return { verdict, rejected: true };
  }

  let recordId = null;
  try { recordId = deps.writeBase(verdict, issue); }
  catch (e) {
    recordId = null; /* Base failure: still record the decision below */
    deps.log?.({ level: "warn", msg: "triage-base-write-failed", id: job.id, err: String(e).slice(0, 300) });
  }

  db.prepare(
    `UPDATE jobs SET triage_status = ?, triage_package = ?, triage_priority = ?,
       triage_order = ?, triage_confidence = ?, triage_rationale = ?, triage_base_record_id = ?
     WHERE id = ?`,
  ).run(
    verdict.fits ? "triaged" : "backlog",
    verdict.package, verdict.priority, verdict.order,
    verdict.confidence, verdict.rationale, recordId, job.id,
  );

  try { deps.writeGithub(issue, verdict); }
  catch (e) {
    /* comment can be retried; decision already persisted */
    deps.log?.({ level: "warn", msg: "triage-github-write-failed", id: job.id, err: String(e).slice(0, 300) });
  }

  return { verdict, recordId };
}
