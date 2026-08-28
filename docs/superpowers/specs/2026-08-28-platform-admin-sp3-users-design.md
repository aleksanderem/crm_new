# Platform Admin Console — SP3: Users & Platform Admins (Design Spec)

**Date:** 2026-08-28
**Status:** Design — scope approved
**Sub-project:** SP3 of the Platform Admin Console (SP1 ✅ → SP2 ✅ → SP4 ✅ → **SP3 Users & platform admins** → SP5 Billing/Stripe → SP6 Settings/observability).

## Goal

Complete the users console. Today `admin.users.tsx` already lists all users and grants/revokes platform-admin (`platformAdmins.list` / `platformAdmins.setRole`, with a last-admin guard). SP3 adds: a client-side **search**, a per-user **detail** route (the user's organizations + roles + metadata + platform-admin toggle), and a **global user suspension** (block a suspended user from obtaining Supabase tokens / passing auth guards).

## Architecture

Backend is Convex `action`s guarded by `verifyPlatformAdmin`, reading Supabase via `createSupabaseDb()` (users, teamMemberships, organizations are all Supabase — like SP2). `isPlatformAdmin`/`isSuspended` are Supabase-authoritative admin flags (mirrors the existing `platformAdmins.setRole` which patches Supabase only). Frontend mirrors the existing admin routes (`getIsPlatformAdmin` gate → 403; list + detail like SP2's organizations).

## Data-model change

Add `users.isSuspended` (Convex `convex/schema/platform.ts`, optional; Supabase migration `00151` — `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended boolean`). Absent/false = active. Written Supabase-only (consistent with `isPlatformAdmin`; the auth guards read it from Supabase).

## Backend — `convex/admin/users.ts` (new) + guards

- `getUserDetail` action(`userId: Id<"users">`) → guard → `createSupabaseDb()` reads: the user row (name/email/username/language/theme/timezone/isPlatformAdmin/isSuspended/customerId), plus `teamMemberships` where `userId` = target → join `organizations` for names → `memberships: Array<{ organizationId, organizationName, role, joinedAt }>`. Returns `{ userId, name, email, username, language, theme, timezone, isPlatformAdmin, isSuspended, memberships }`.
- `setUserSuspended` action(`userId`, `suspended: boolean`) → guard (capture actor `userId`) → reject if `userId === actorId` (no self-suspend, prevents self-lockout) → `db.patch("users", userId, { is_suspended: suspended })` (Supabase) → `console.info` (platform-level; no org-scoped `audit_log` fit, same as SP4).
- Reuse existing `platformAdmins.list` (list) and `platformAdmins.setRole` (platform-admin toggle) unchanged.

### Suspension enforcement (the invasive part — last)

A suspended user must be unable to use the app. Add an `isSuspended` check in three Supabase-reading guards, each after the user is resolved:
- `verifyOrgAccess` (`convex/_helpers/authAction.ts`) — throw `"User suspended"` if the caller's user `is_suspended` (gates every write mutation + Convex-action read). The org-suspend check from SP2 lives here already; add the user-suspend check alongside.
- `mintUserToken` (`convex/supabase/jwt.ts`) — the user-scoped bootstrap token: fetch the user and throw if suspended, so a suspended user cannot obtain ANY Supabase token (no data, no org bootstrap).
- `verifyPlatformAdmin` (`convex/_helpers/authAction.ts`) — throw if the (would-be admin) user is suspended, so a suspended platform admin can't use the admin panel either.

This blocks a suspended user at the Supabase-token boundary (the app's whole read path) and at every write, mirroring how org-suspend works in SP2. (The raw Convex-auth session JWT is minted by `@convex-dev/auth` and is not gated here — but without a Supabase token the app is non-functional for them; a deeper auth-provider block is out of scope.)

## Frontend

- `src/routes/_app/_auth/admin.users.tsx` (extend the existing file): add a search `Input` (filter by name/email, client-side over `platformAdmins.list`), and a "Szczegóły" link per row → `/admin/users/$userId`. Keep the existing platform-admin grant/revoke toggle.
- `src/routes/_app/_auth/admin.users.$userId.tsx` (new): admin gate; `getUserDetail`. Cards: Profil (name/email/username/language/theme/timezone read-only), Status (platform-admin `Switch` → `platformAdmins.setRole` with last-admin guard surfaced as a toast; suspended `Switch` → `setUserSuspended`, disabled on the self row), Organizacje (`Table`: org name, role Badge, joinedAt). Back link to `/admin/users`.
- Hub tile "Platform administrators" → `/admin/users` already exists; optionally relabel to "Użytkownicy" (users + platform admins).

## Non-goals (SP5 / later)

Billing/subscription per user (SP5); bulk actions; per-user notes; hard-delete from the console (a self-serve `deleteCurrentUserAccount` already exists); deeper auth-provider-level login block beyond the token/guard boundary; platform-scoped audit log (SP6 — `audit_log` is org-scoped NOT NULL FK, so admin-flag changes log via `console.info`).

## Testing

`convex-test`: `getUserDetail` returns memberships with roles + rejects non-admin; `setUserSuspended` round-trip + rejects self-suspend + rejects non-admin; suspended user's `verifyOrgAccess` / `mintUserToken` / `verifyPlatformAdmin` all throw `/suspended/i` while an unsuspended user passes; last-admin guard on `setRole` still holds (existing). Drift-guard mindset: suspension must not accidentally grant access, and self-suspend must never succeed.
