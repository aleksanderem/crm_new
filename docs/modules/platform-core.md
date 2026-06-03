# Platform Core — module context

This file gives any agent enough context to work on platform-level (horizontal) code without reading the entire codebase.

## Ownership

Platform core owns: auth, organizations, team memberships, RBAC, billing, notifications, audit log, custom fields, global search, activity timeline, document system, email integration.

## Key files

- convex/schema.ts — full database schema
- convex/permissions.ts — RBAC logic (checkPermission, verifyOrgAccess)
- convex/_helpers/seatLimits.ts — seat limit helper
- convex/documentTemplates.ts — template CRUD
- convex/documentTemplateFields.ts — template field CRUD
- convex/documentInstances.ts — document instance lifecycle (create, updateDraft, updateStatus, sign, createFromFile)
- convex/documentDataSources.ts — data source registry (system, current_user, org sources)
- convex/search.ts — global multi-entity search
- convex/activities.ts — activity timeline
- convex/notifications.ts — in-app notifications
- convex/auditLog.ts — audit trail
- src/components/org-context.tsx — useOrganization() hook
- src/components/layout/app-sidebar.tsx — main navigation
- src/components/documents/ — document system UI components

## Patterns to follow

Every mutation must call verifyOrgAccess(ctx, orgId) first. Permission-sensitive operations must also call checkPermission(ctx, orgId, feature, action). All tables have organizationId field.

New horizontal features go in convex/ root (not in convex/crm/ or convex/gabinet/). UI components shared across modules go in src/components/ (not in crm/ or gabinet/ subdirs).

## Data layer (Supabase-primary as of 2026-04)

Self-hosted Supabase Postgres (`SUPABASE_URL`) is the primary data store. Convex hosts auth (`@convex-dev/auth`), mutations/actions, the JWT bridge that mints Supabase tokens (`convex/supabase/jwt.ts → mintSupabaseToken`), file storage, and scheduled jobs.

- Read path: the browser holds a Supabase JWT (see `src/components/supabase-provider.tsx`, `src/hooks/use-supabase-token.ts`) and queries Supabase directly via `supabase-js` (the `src/hooks/use-supabase-*.ts` family). RLS scopes rows to the user's org.
- Write path: React calls Convex mutations, which write to Supabase via `convex/_helpers/supabaseDb.ts → createSupabaseDb()` using the service-role client (`convex/supabase/client.ts`).
- `convex/schema.ts` is the structural source of truth. Postgres tables live in `supabase/migrations/`. Convex (camelCase) ↔ Supabase (snake_case) table-name mapping is `TABLE_MAP` in `convex/_helpers/supabaseDb.ts`.
- New indexes needed for a query must exist in `supabase/migrations/` — Convex schema indexes are now legacy/test-suite only.
- Older docs and in-code comments may still describe Convex as "the database" without Supabase; treat those as stale. See the "Migration note" in `CLAUDE.md` and the superseded plan in `docs/plans/2026-02-17-modular-platform-implementation-plan.md`.

## Document system architecture

Two document types coexist in documentInstances table: type="template" (created from documentTemplates with field values and rendered HTML) and type="file" (uploaded files with storage reference). Both share the same status workflow: draft -> pending_review -> approved -> pending_signature -> signed -> archived.

Data source registry: modules register their data sources in convex/{module}/documentDataSources.ts. Sources are resolved at document creation time. Template fields can bind to source fields for auto-fill.

## What users need from platform

- Consistent navigation and sidebar across modules
- Unified document management (templates + files + signing + PDF)
- Cross-module search (find anything from search bar)
- Activity timeline that aggregates events from all modules
- Notifications for workflow events (review requested, signature needed)
- Team management with role-based access
