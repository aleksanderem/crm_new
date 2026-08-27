# Platform Admin Console — SP2: Organizations Console (Design Spec)

**Date:** 2026-08-27
**Status:** Design — awaiting approval
**Sub-project:** SP2 of the Platform Admin Console (SP1 Module access ✅ → **SP2 Organizations console** → SP4 Plans/pricing → SP3 Users → SP5 Billing/Stripe → SP6 Settings/observability).

## Goal

Give a platform operator (`users.isPlatformAdmin`) a cross-tenant view of **all** organizations, a per-org detail drill-down (members, roles, plan, entitlements, seat usage), and reversible operator actions: suspend/reactivate, edit profile, override seat limit, and read-only impersonation ("enter as support").

## Architecture (mirrors SP1 / `admin.entitlements`)

All backend is Convex `action`s guarded by `verifyPlatformAdmin` (`convex/_helpers/authAction.ts:255`), reading Supabase cross-tenant via `createSupabaseDb()` service-role (bypasses RLS by design — the operator is meant to see every tenant). Writes dual-write (Convex mutation for the permanent-mirror tables + Supabase for the primary store) and call `logAudit(ctx, …)` immediately after. Frontend routes mirror `admin.entitlements.tsx`: `useAction(api.app.getIsPlatformAdmin)` → inline 403 card when not admin; `useQuery` for reads, `useMutation` wrapping the action for writes; UI from `src/components/ui` (`Card`, `Table`, `Badge`, `Switch`, `Dialog`, `Button`).

## Data-model changes

`organizations` currently has no status or seat-override field. Add three optional columns (Convex `convex/schema/crm.ts` + Supabase migration `00150`):

- `status: v.optional(v.union(v.literal("active"), v.literal("suspended")))` — absent/`"active"` = normal; `"suspended"` blocks the tenant.
- `suspendedReason: v.optional(v.string())` — operator note shown in the console + audit.
- `seatLimitOverride: v.optional(v.number())` — manual seat cap, honored by `checkSeatLimit` (already "max wins", so the override participates in the max).

All optional/nullable so the migration is non-destructive and existing rows read as active with no override. Supabase snake_case: `status`, `suspended_reason`, `seat_limit_override`. The dual-write path in `convex/supabase/organizations.ts` gains these fields.

## Backend — `convex/admin/organizations.ts` (new)

- `listOrganizations` action → `Array<{ organizationId, name, slug, ownerEmail, memberCount, status, plan, crm: EntStatus, gabinet: EntStatus, createdAt }>`. One cross-tenant read of `organizations` + `teamMemberships` + `productSubscriptions` + owner `users` (mirror of `listOrgEntitlements`), plus plan resolved from the owner's `subscriptions`.
- `getOrganizationDetail` action(`organizationId`) → `{ …org fields, status, suspendedReason, seatLimitOverride, members: Array<{ userId, name, email, role, joinedAt }>, entitlements: { crm, gabinet }, plan: { key, name, seatLimit } | null, seatUsage: { currentSeats, effectiveSeatLimit } }`.
- `setOrganizationStatus` action(`organizationId`, `status`, `reason?`) → dual-write + `logAudit` (`organization_suspended` / `organization_reactivated`).
- `updateOrganizationProfile` action(`organizationId`, `{ name?, website?, ownerId? }`) → validates new owner is a member (owner reassignment); dual-write + `logAudit` (`organization_profile_updated`).
- `setSeatLimitOverride` action(`organizationId`, `seatLimit: number | null`) → dual-write + `logAudit` (`organization_seat_override_set`).

## Suspend enforcement

The single tenant boundary for reads/writes is the Convex auth layer + JWT minting. Add a suspend check in two places, both after the org is resolved:

- `verifyOrgAccess` (`convex/_helpers/authAction.ts`) — throw `"Organization suspended"` if `org.status === "suspended"`. This gates every write mutation and every Convex-action read.
- `mintSupabaseToken` (`convex/supabase/jwt.ts`) — throw before issuing the org-scoped JWT, so a suspended org cannot even obtain a Supabase read token.

The admin console itself is unaffected (it uses `verifyPlatformAdmin`, never `verifyOrgAccess`). Reactivation clears `status` back to `"active"` and access resumes.

## Impersonation ("Wejdź jako" — read-only support view)

New action `mintImpersonationToken` action(`organizationId`): guarded by `verifyPlatformAdmin` (NOT membership), mints a Supabase JWT with `sub = adminUserId`, `org_id = targetOrg`, and an `imp: true` claim; `logAudit` (`organization_impersonation_started`). The frontend stores the impersonation token + target org, renders a persistent banner ("Podgląd jako operator — tryb tylko-do-odczytu. Wyjdź."), and routes Supabase reads through this token. Because the app's read path is overwhelmingly Supabase-direct (RLS filters by the `org_id` claim), the operator sees a faithful read-only view.

Read-only is enforced structurally: write mutations call `verifyOrgAccess`, and the impersonating admin is not a member of the target org, so writes throw naturally. To make Convex-*action* reads that also call `verifyOrgAccess` (e.g. `getMembers`) work during impersonation, `verifyOrgAccess` grants access when the caller is a platform admin (read context) — this is the one deliberate widening, scoped to reads and audit-logged at mint time. Exiting impersonation clears the stored token/org.

Impersonation is the heaviest, most security-sensitive piece and is sequenced **last** in the plan, so the console ships fully usable even if impersonation needs a follow-up hardening pass.

## UI

- `src/routes/_app/_auth/admin.organizations.tsx` — searchable list (Table: name, owner, members, status badge, plan, CRM/Gabinet badges, "Szczegóły" link).
- `src/routes/_app/_auth/admin.organizations.$orgId.tsx` — detail: profile card (editable name/website/owner), status card (suspend/reactivate with reason dialog), seat card (usage + override input), members table, entitlements (reuse SP1 toggles or link to `/admin/entitlements`), "Wejdź jako" button.
- Add an "Organizacje" tile/link on `admin.index.tsx`.

## Non-goals (later sub-projects)

Full plan/pricing CRUD and Stripe (SP4/SP5); creating or hard-deleting organizations; editing member roles from the console (lives in org settings today); trials/expiry (SP5). SP2's plan/seat controls are the minimal manual override; SP4 replaces them with real plan management.

## Testing

`convex-test` unit tests per action: non-admin caller throws (`verifyPlatformAdmin` gate); `listOrganizations` shape + aggregation; suspend→reactivate round-trip and that a suspended org's `verifyOrgAccess`/`mintSupabaseToken` throw; `setSeatLimitOverride` honored by `checkSeatLimit`; profile update rejects a non-member owner; `mintImpersonationToken` requires platform admin and yields a token whose write path still throws. Extend the RBAC drift-guard mindset: suspend/impersonation must never grant a plain member cross-tenant access.
