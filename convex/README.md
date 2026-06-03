# Convex backend

This directory holds Convex functions, but **Convex is no longer the primary
database for this project** as of 2026-04. Read this section before trusting
any in-file comment that talks about "the database" or "ctx.db".

## Data layer (Supabase-primary)

- The browser holds a Supabase JWT minted via Convex
  (`convex/supabase/jwt.ts → mintSupabaseToken`) and queries the self-hosted
  Supabase instance directly via `supabase-js` — see the
  `src/hooks/use-supabase-*.ts` family.
- Write path: React calls Convex mutations / actions, and the handler writes
  to Supabase through `convex/_helpers/supabaseDb.ts → createSupabaseDb()`
  using the service-role client (`convex/supabase/client.ts`).
- The Convex schema (`convex/schema.ts`) is still the structural source of
  truth (camelCase). The equivalent Postgres schema lives in
  `supabase/migrations/` (snake_case). The Convex→Supabase table-name
  mapping is in `convex/_helpers/supabaseDb.ts` (`TABLE_MAP`).
- Indexes that production queries rely on must exist in
  `supabase/migrations/`, not just `convex/schema.ts`.
- The pre-migration `writeXToSupabase` internal actions in
  `convex/supabase/backfill.ts` remain only for backfill.

## What still lives in Convex (`ctx.db`)

A few tables intentionally stay Convex-owned and are not migrated:

- `users`, `organizations`, `teamMemberships` — auth tables (Convex Auth is
  the source of truth; Supabase gets a copy for analytics).
- `oauthConnections` — sensitive refresh/access tokens; see the header in
  `convex/oauthConnections.ts`.
- `_scheduled_functions` and other Convex-managed system tables.
- Some legacy read paths (e.g. `convex/pipelines.ts` queries) that have not
  yet been migrated — writes already go to Supabase via the action handlers.

If you see a `ctx.db.insert/patch/get(...)` call on a non-auth table, check
`TABLE_MAP` and confirm whether it should also be written through
`createSupabaseDb()`. Many such call sites are legacy and will read stale
data because the production frontend reads from Supabase.

## File header conventions

Migrated modules carry a one-line header near the imports:

```
// Dual-write refs removed — Supabase is now primary for <thing> writes
```

When the situation is more nuanced (read still hits Convex, table is
intentionally Convex-owned, etc.), files use a multi-line header — see
`convex/emailAccounts.ts` and `convex/oauthConnections.ts` for the canonical
shape (state the source of truth, explain why, point at the relevant
frontend hook).

## Cross-references

- `CLAUDE.md` — project-wide architecture overview, including the migration
  note that supersedes older docs.
- `docs/modules/platform-core.md`, `docs/modules/crm.md`,
  `docs/modules/gabinet.md` — per-module data layer notes.
- `docs/plans/2026-02-17-modular-platform-implementation-plan.md` —
  historical implementation plan (marked SUPERSEDED).
- `TESTING.md` — Convex tests run via `npm run test:unit`; the in-memory
  Supabase stub is at `tests/convex/_supabase_inmemory.ts`.

## Stale comments

In-file comments written before the migration may still describe Convex as
"the database", talk about `ctx.db` as the canonical write path, or refer
to "Convex-only side effects" when the side effects in fact dual-write
through `publishActivityEnvelope` and friends. Trust the code, not the
comment — and if you touch the file, fix the comment.
