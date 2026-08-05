## Policy / anti-abuse (Phase 2)

- Strike ledger lives in the same `queue.db` (table `strikes`). No migration step — `ensureStrikeSchema(db)` runs at worker startup.
- `BANNED_LOGINS` (env, comma-separated) is the static ban seed. Runtime auto-bans (5 strikes) persist in the `strikes` ledger; the worker unions both each loop. Set on the server the same way as `PAUSED_LOGINS`/`THROTTLED_LOGINS` (systemd unit env / `.env`).
- Pressure is never a decision factor: a fitting issue is accepted even if worded urgently; only a NON-fitting issue that carries pressure is rejected (stern comment). Priority always comes from the matched plan package.
- GitHub labels required in the target repo: `triage:rejected` (in addition to Phase 1's `triage:PK1..PK9` and `triage:backlog`). Missing labels make `gh --add-label` fail, but that path is non-fatal (caught + logged).
- The 6th-offense output is a printed `gh api -X DELETE .../collaborators/<login>` recommendation only. A human runs it. The agent never removes a collaborator or account.
- Deploy is manual: copy `automation/worker/**` (including the new `policy/` dir) to `/home/claude-bot/worker/` as user `claude-bot` (respect RunCloud ownership), then restart `claude-worker` (the webhook is unchanged).

## Wiki feedback loop (Phase 3)

- Purpose: keep the plan/docs current WITHOUT losing the launch goal. Records every launch-relevant change a triaged issue implies; out-of-scope reports (e.g. magazyn) change nothing.
- Ships DORMANT: `WIKI_FEEDBACK` env defaults to `off`. Values: `off` (skip), `dry` (assess + persist to the `plan_delta` column, no external writes), `on` (execute). Turn on only after verifying the lark-cli write commands live (`--dry-run`) on the server. The intended action is persisted to `plan_delta` in every mode.
- Requires `PLAN_WIKI_DOC` (the plan Wiki doc URL/token) when `on`. `FEEDBACK_CONFIDENCE_THRESHOLD` defaults to 0.8.
- Delta kinds: `completed` (in-scope task done → AUTO status→Zrobione + note, only when confidence ≥ threshold AND the record resolves; else draft), `regression` (in-scope bug/blocker that sets readiness back → records a Wiki note + `triage:plan-change` label so a human raises/adds the P0; never a silent status write), `structural` (plan-direction change → draft proposal + label, never auto), `none` (out of launch scope → nothing).
- Direction safeguard: the loop only ever marks done, records a blocker, or proposes a change — it NEVER removes or lowers priority. Only fitting-and-confident completions auto-write.
- Trigger: any non-rejected triage whose text matches a completion OR bug/blocker keyword (runs for both fits and backlog — a new blocker often isn't an existing task). One extra LLM call, gated.
- New GitHub label required: `triage:plan-change`. New additive SQLite column `plan_delta` (`ensurePlanDeltaColumn` at startup, same `queue.db`).
- Deploy: copy `automation/worker/**` (incl. `wiki/`) to `/home/claude-bot/worker/` as `claude-bot`; `lark-cli` authenticated in the `claude-bot` context; set `WIKI_FEEDBACK`/`PLAN_WIKI_DOC`; restart `claude-worker`.
