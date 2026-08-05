const LOW_CONFIDENCE = 0.5;

export function verdictLabel(verdict) {
  return verdict.fits ? `triage:${verdict.package}` : "triage:backlog";
}

// Reporter-facing Polish verdict comment. Fitting -> accepted + placement;
// backlog -> explained deferral. Low-confidence verdicts are flagged "wstępny"
// so a wrong auto-decision is visibly provisional.
export function verdictComment(verdict) {
  const provisional = verdict.confidence < LOW_CONFIDENCE
    ? "\n\n_(werdykt wstępny — do weryfikacji przez człowieka)_" : "";
  if (verdict.fits) {
    const ord = verdict.order !== null ? `, pozycja ${verdict.order}` : "";
    return `✅ **Przyjęte do planu** — pakiet ${verdict.package}, priorytet ${verdict.priority}${ord}.\n\n${verdict.rationale}${provisional}`;
  }
  return `⏸️ **Poza bieżącym planem uruchomienia.** ${verdict.rationale}\n\nTrafia do backlogu — wrócimy po starcie.${provisional}`;
}

export function postVerdict(issue, verdict, { exec }) {
  const repo = issue.repo;
  exec("gh", ["issue", "comment", String(issue.number), "--repo", repo, "--body", verdictComment(verdict)]);
  exec("gh", ["issue", "edit", String(issue.number), "--repo", repo, "--add-label", verdictLabel(verdict)]);
}

// Policy rejection: a visible comment plus the triage:rejected label. Used when
// the policy gate blocks an issue (multi-account / banned / pressure) so the
// reporter still sees a verdict.
export function postRejection(issue, body, { exec }) {
  const repo = issue.repo;
  exec("gh", ["issue", "comment", String(issue.number), "--repo", repo, "--body", body]);
  exec("gh", ["issue", "edit", String(issue.number), "--repo", repo, "--add-label", "triage:rejected"]);
}
