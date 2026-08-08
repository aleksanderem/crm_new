# Platform Admin Console — SP1: Module Access & Enforcement — Design

**Date:** 2026-08-08
**Status:** Approved (design)
**Author:** Alfred + Claude

## Context

The platform is a multi-tenant SaaS: a shared platform layer (orgs, auth, billing, RBAC) with pluggable vertical modules (CRM, Gabinet). Module access is gated by the Convex `productSubscriptions` table: `getActiveProducts` (drives the module navigation) and `verifyProductAccess` / `checkModuleAccess` (gate every gabinet backend function) both read it.

During the 2026-08-07 production incident that table was found to be **empty** — no grants had ever been written (pre-launch, no Stripe). Enforcement therefore blocked every org from Gabinet and collapsed the module navigation. As an emergency stopgap (PR #4345) enforcement was disabled: `verifyProductAccess` was made **fail-open** and `getActiveProducts` was given a **catalog fallback**. Consequently there is currently **no module paywall** — every org sees and can use every module.

SP1 restores real enforcement by giving the operator a way to grant/revoke module access per organization, backfilling existing orgs so nobody is locked out, and then reverting the stopgaps. See `~/.claude/.../memory/project_incident_2026-08-07_prod_convex.md` for the incident detail.

### Where SP1 sits in the full console

This is sub-project 1 of a full Platform Admin Console, decomposed as: **SP1 Module access & enforcement** (this doc) → SP2 Organizations console → SP4 Plans/products/pricing → SP3 Users & platform admins → SP5 Billing & Stripe → SP6 Platform settings & observability. Each gets its own spec → plan → build. SP1 is first because it is urgent and reverts the stopgaps.

### Dependency / ordering note

The stopgaps SP1 reverts live in **PR #4345** (branch `fix/unblock-gabinet-and-pln-schema`), which must be merged to `main` before SP1's enforcement-re-enable step, and SP1 should be built on top of it. The stopgaps are also already live on the serving deployment `helpful-mule-867`.

## Goals

- Platform admins can grant/revoke module access (CRM, Gabinet) per organization.
- Existing orgs are backfilled so re-enabling enforcement locks nobody out.
- Enforcement (`getActiveProducts`, `verifyProductAccess`) is restored to read real grants.
- New orgs automatically receive the CRM baseline entitlement.

## Non-goals (later sub-projects)

- Stripe/self-serve billing, invoices, plan/pricing management (SP4/SP5).
- Trials with expiry, time-limited grants (SP5).
- Organizations console / user management beyond the entitlements table (SP2/SP3).
- A "locked / upsell" screen for ungranted modules — ungranted modules stay hidden (SP5 may add upsell).

## Deployment / architecture constraints (must respect)

- The serving Convex deployment is **`helpful-mule-867`** (deploy with `npx convex dev --once`, not `convex deploy`). See memory `project_convex_deploy_pipeline`.
- `organizations`, `teamMemberships`, and the `gabinet_*` tables live in **Supabase** (TABLE_MAP). A Convex **query** (V8 isolate) cannot read Supabase — only **actions** can. Therefore anything that reads org or gabinet data must be an action; `productSubscriptions` is a Convex-only table and is read/written directly in query/mutation ctx.
- Platform-admin auth is `isPlatformAdmin` on the Supabase `users` row, checked via the existing `verifyPlatformAdmin` internal action (`convex/_helpers/authAction.ts`) or `getIsPlatformAdmin` (`convex/app.ts`).

## Model

Entitlements reuse the existing Convex `productSubscriptions` table (the table enforcement already reads). New optional fields (backward compatible) are added for provenance/audit:

- `source: v.optional(v.union(v.literal("manual"), v.literal("stripe")))` — manual operator grant vs Stripe (SP5).
- `grantedByUserId: v.optional(v.id("users"))` — who granted.
- `note: v.optional(v.string())` — optional operator note.

A manual grant is a row `{ organizationId, productId: "crm" | "gabinet", status: "active", cancelAtPeriodEnd: false, source: "manual", grantedByUserId, createdAt, updatedAt }`. There is exactly one row per `(organizationId, productId)` (upsert via the `by_orgAndProduct` index). **Revoke = set `status: "canceled"`** (row retained for history; `getActiveProducts`/`verifyProductAccess` already treat only `active`/`trialing` as access). Re-grant flips `status` back to `active`.

CRM is the **baseline product**: auto-granted (`active`) to every org on creation and in the backfill; shown in the UI as an always-on badge, not a toggle. Gabinet (and future modules) are operator-granted add-ons.

## Backend

New module `convex/admin/entitlements.ts`, all platform-admin gated:

- `listOrgEntitlements` (**action**): `verifyPlatformAdmin` → reads organizations from Supabase (`createSupabaseDb`) and their team-membership counts, reads `productSubscriptions` from Convex via an internalQuery, merges → returns `Array<{ organizationId: string; name: string; memberCount: number; crm: EntitlementStatus; gabinet: EntitlementStatus }>` where `EntitlementStatus = "active" | "canceled" | "none"`.
- `setEntitlement` (**action**): args `{ organizationId: Id<"organizations">; productId: "crm" | "gabinet"; grant: boolean }` → `verifyPlatformAdmin` → calls the internal upsert mutation → writes an audit-log entry via the existing audit helper. Returns the new status.
- `_upsertEntitlement` (**internalMutation**): upserts the `productSubscriptions` row for `(organizationId, productId)`: sets `status` to `active` (grant) or `canceled` (revoke), `source: "manual"`, `grantedByUserId`, timestamps.
- `_listEntitlementsInternal` (**internalQuery**): returns all `productSubscriptions` rows (or by org) for the listing action to merge.

Org-create hook: in `convex/organizations.ts` `create` (already an action), after the org is created, grant the CRM baseline entitlement by calling `_upsertEntitlement` (or a small dedicated internal) with `productId: "crm"`, `source: "manual"`, `status: "active"`.

## Backfill

A one-off internal action `convex/migrations/backfillEntitlements.ts`:

1. List all organizations from Supabase.
2. For each org: upsert a CRM entitlement (`active`) if none exists.
3. For each org that has real gabinet data — at least one row in `gabinet_patients`, `gabinet_employees`, or `gabinet_appointments` (Supabase) — upsert a Gabinet entitlement (`active`) if none exists.
4. Idempotent: skip orgs that already have the entitlement. Supports a `dryRun` arg that logs the counts (total orgs, orgs granted Gabinet) without writing, to verify before the enforcement flip.

## Enforcement re-enablement (strict ordering)

The stopgaps must not be reverted until grants exist, or prod breaks again. Order:

1. Ship the entitlements schema fields, backend, org-create CRM grant, backfill action, and admin UI — **with the PR #4345 stopgaps still in place** (fail-open `verifyProductAccess`, catalog fallback in `getActiveProducts`). No lock-out risk yet.
2. Run `backfillEntitlements` with `dryRun: true`, review counts, then run it for real.
3. Verify every org has a CRM entitlement and every gabinet-using org has a Gabinet entitlement (query check).
4. **Only then** revert the stopgaps: remove the catalog fallback from `getActiveProducts` (return only real active/trialing grants) and restore `verifyProductAccess` to throw when there is no active entitlement.
5. Deploy to `helpful-mule-867` (`npx convex dev --once`) and verify live in-browser: for a granted org the nav shows the modules and gabinet loads; revoking Gabinet for a test org hides it and blocks its backend functions.

## UI

New route `src/routes/_app/_auth/admin.entitlements.tsx`, platform-admin gated with the same `getIsPlatformAdmin` guard pattern as `admin.index.tsx`; a card linking to it is added to `admin.index.tsx`.

The page renders a table of organizations (name, member count) with:
- a **CRM** column showing an always-on "Bazowy" badge (baseline; not toggleable),
- a **Gabinet** column with a switch: "Nadany" (active) / "Brak" (none/canceled). Toggling on calls `setEntitlement({ grant: true })`; toggling off opens a confirmation dialog (revoking cuts off a live module) then calls `setEntitlement({ grant: false })`.

After a successful mutation the list refetches and a toast confirms. Components come from the existing design system (`Card`, `Table`, `Switch`, `Badge`, `Dialog`, toast) — no new dependencies. Loading and empty states mirror existing admin pages.

## Denied UX

An ungranted module is **hidden from the navigation** (existing `getVisibleModules` behavior) and its backend functions throw via `verifyProductAccess`. This matches the operator-granted B2B model. A visible-but-locked upsell screen is out of scope (SP5).

## Error handling

- All admin backend entry points reject non-platform-admins (throw; UI shows the existing 403 card).
- `setEntitlement` validates `productId` against the known set (`crm`, `gabinet`) and no-ops gracefully if the requested state already holds.
- Revoking CRM is not offered in the UI; if attempted via the API it is allowed but discouraged (CRM is baseline) — the UI simply never exposes it.

## Testing

- **convex-test** (`convex/tests/`):
  - `setEntitlement`: grant creates/flips an `active` row with `source:"manual"` + `grantedByUserId` + audit entry; revoke flips to `canceled`; non-platform-admin is rejected.
  - `listOrgEntitlements`: merges Supabase orgs (in-memory stub) with Convex entitlements into the correct per-product status.
  - `getActiveProducts` (post-revert): returns only active/trialing product ids, no catalog fallback.
  - `verifyProductAccess` (post-revert): throws when no active entitlement, passes when granted.
  - `backfillEntitlements`: idempotent; grants CRM to all orgs and Gabinet only to orgs with gabinet data; `dryRun` writes nothing.
  - org `create`: new org receives a CRM entitlement.
- **Playwright** (`e2e/`): a platform admin opens `/admin/entitlements`, toggles Gabinet for an org and sees the status update; a non-admin visiting `/admin/entitlements` sees the 403 card.

## Rollout

Because enforcement is being turned back on, the plan's last task is the flip (step 4–5 above) and it must be verified live on `helpful-mule-867` before closing SP1. The stopgap-revert commits should be isolated so they can be deployed in the correct order relative to the backfill.
