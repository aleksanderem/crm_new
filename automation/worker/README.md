## Policy / anti-abuse (Phase 2)

- Strike ledger lives in the same `queue.db` (table `strikes`). No migration step — `ensureStrikeSchema(db)` runs at worker startup.
- `BANNED_LOGINS` (env, comma-separated) is the static ban seed. Runtime auto-bans (5 strikes) persist in the `strikes` ledger; the worker unions both each loop. Set on the server the same way as `PAUSED_LOGINS`/`THROTTLED_LOGINS` (systemd unit env / `.env`).
- Pressure is never a decision factor: a fitting issue is accepted even if worded urgently; only a NON-fitting issue that carries pressure is rejected (stern comment). Priority always comes from the matched plan package.
- GitHub labels required in the target repo: `triage:rejected` (in addition to Phase 1's `triage:PK1..PK9` and `triage:backlog`). Missing labels make `gh --add-label` fail, but that path is non-fatal (caught + logged).
- The 6th-offense output is a printed `gh api -X DELETE .../collaborators/<login>` recommendation only. A human runs it. The agent never removes a collaborator or account.
- Deploy is manual: copy `automation/worker/**` (including the new `policy/` dir) to `/home/claude-bot/worker/` as user `claude-bot` (respect RunCloud ownership), then restart `claude-worker` (the webhook is unchanged).
