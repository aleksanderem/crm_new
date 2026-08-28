# Platform Admin — SP3 Users & Platform Admins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Complete the users console — search + a per-user detail route (orgs/roles/metadata + platform-admin toggle) + global user suspension (a suspended user cannot obtain Supabase tokens or pass auth guards). Builds on the existing `platformAdmins.list`/`setRole` + `admin.users.tsx`.

**Architecture:** Convex `action`s guarded by `verifyPlatformAdmin`, reading/writing Supabase via `createSupabaseDb()` (users/teamMemberships/organizations are Supabase; `isPlatformAdmin`/`isSuspended` are Supabase-authoritative admin flags). Frontend mirrors the existing admin routes.

**Tech Stack:** Convex, self-hosted Supabase Postgres, React 19 + TanStack Router/Query, shadcn/ui.

## Global Constraints

- Every new backend `action` calls `await ctx.runAction(internal._helpers.authAction.verifyPlatformAdmin, {})` FIRST; capture `{ userId }` where needed.
- `createSupabaseDb()` casing: `.query().collect()`/`.get()` RETURN camelCase + `_id`; `.patch()` ACCEPTS camelCase (→ snake via mapRowToSnake). So read `user.isPlatformAdmin`/`user.isSuspended`/`m.organizationId`, and patch `{ isSuspended: ... }`.
- `users.isSuspended` is written Supabase-ONLY (mirrors `isPlatformAdmin`; all guards read it from Supabase). Migration `00151` is applied by CI on merge — never hand-run DDL.
- No `logAudit` for platform-level admin-flag changes (audit_log.organization_id is NOT NULL FK) → `console.info`.
- `setUserSuspended` MUST reject self-suspend (`userId === actorId`).
- Convex tests: `cd convex && npx vitest run <name>`. Keep `npx tsc -p convex/tsconfig.json` clean.
- Frontend: `npx tsc -p tsconfig.app.json --noEmit` (works now) + `npx vite build`.
- Reuse only existing `src/components/ui/*`. No installs.

---

### Task 1: Backend — user detail

**Files:**
- Create: `convex/admin/users.ts`
- Test: `tests/convex/adminUsers.test.ts` (new)

**Interfaces:**
- Produces: `getUserDetail({ userId }) → { userId, name, email, username, language, theme, timezone, isPlatformAdmin, isSuspended, memberships: Array<{ organizationId, organizationName, role, joinedAt }> }`.

- [ ] **Step 1: Write failing tests.** `tests/convex/adminUsers.test.ts`, harness from `tests/convex/adminOrganizations.test.ts` (`createTestCtx`, `seedTestUser`; make caller admin via inserting the Supabase `users` row with `isPlatformAdmin:true`). Seed a target user + an org + a `teamMemberships` row linking them (camelCase keys with `_id`). Tests: (a) non-admin `getUserDetail` rejects `/platform admin/i`; (b) admin `getUserDetail(targetId)` returns the user's metadata + a membership with the org name + role.

- [ ] **Step 2: Run** — `cd convex && npx vitest run adminUsers`. Expect FAIL.

- [ ] **Step 3: Implement `convex/admin/users.ts`.** Mirror `convex/admin/organizations.ts` accessor style.

```ts
import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";

export const getUserDetail = action({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await ctx.runAction(internal._helpers.authAction.verifyPlatformAdmin, {});
    const db = createSupabaseDb();
    const user = await db.get("users", String(args.userId));
    if (!user) throw new Error("User not found");
    const memberships = await db
      .query("teamMemberships")
      .eq("userId", String(args.userId))
      .collect();
    const orgIds = [...new Set(memberships.map((m) => String(m.organizationId)))];
    const orgs = await db.getMany("organizations", orgIds);
    const orgName = new Map(orgs.map((o) => [String(o._id), (o.name as string) ?? ""]));
    return {
      userId: String(user._id),
      name: (user.name as string | null) ?? null,
      email: (user.email as string | null) ?? null,
      username: (user.username as string | null) ?? null,
      language: (user.language as string | null) ?? null,
      theme: (user.theme as string | null) ?? null,
      timezone: (user.timezone as string | null) ?? null,
      isPlatformAdmin: Boolean(user.isPlatformAdmin),
      isSuspended: Boolean(user.isSuspended),
      memberships: memberships
        .map((m) => ({
          organizationId: String(m.organizationId),
          organizationName: orgName.get(String(m.organizationId)) ?? "",
          role: String(m.role),
          joinedAt: Number(m.joinedAt ?? 0),
        }))
        .sort((a, b) => a.organizationName.localeCompare(b.organizationName)),
    };
  },
});
```

Add a `returns:` validator mirroring the entitlements/organizations style. (`isSuspended` reads the field added in Task 2 — until then it is simply `false`/absent; the field access is safe.)

- [ ] **Step 4: Run tests** — expect PASS. tsc convex clean.

- [ ] **Step 5: Commit** — `feat(admin): getUserDetail action (SP3 T1)`.

---

### Task 2: Backend — user suspension (schema + migration + action + auth guards)

**Files:**
- Modify: `convex/schema/platform.ts` (users table: `isSuspended`)
- Create: `supabase/migrations/00151_users_is_suspended.sql`
- Modify: `convex/admin/users.ts` (add `setUserSuspended`)
- Modify: `convex/_helpers/authAction.ts` (`verifyOrgAccess` + `verifyPlatformAdmin`)
- Modify: `convex/supabase/jwt.ts` (`mintUserToken`)
- Test: `tests/convex/adminUsers.test.ts` (extend) + `tests/convex/userSuspension.test.ts` (new)

**Interfaces:**
- Produces: `setUserSuspended({ userId, suspended })`; suspended users throw `/suspended/i` from `verifyOrgAccess`, `mintUserToken`, `verifyPlatformAdmin`.

- [ ] **Step 1: Schema + migration.** In `convex/schema/platform.ts` `users` table add `isSuspended: v.optional(v.boolean())`. Create `supabase/migrations/00151_users_is_suspended.sql`:

```sql
-- Platform Admin SP3: global user suspension flag. Absent/false = active;
-- true blocks the user from minting Supabase tokens and passing auth guards.
-- Nullable + idempotent — existing rows read as active. Supabase-authoritative
-- (mirrors is_platform_admin), written only via the setUserSuspended admin action.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_suspended boolean;
```

- [ ] **Step 2: Write failing tests** in `tests/convex/userSuspension.test.ts` (harness from `orgSuspension.test.ts`): seed a member of an org; set their Supabase `users.is_suspended = true`; assert (a) an action that runs `verifyOrgAccess` (e.g. `api.organizations.getMembers`) rejects `/suspended/i`; (b) `api.supabase.jwt.mintUserToken` rejects `/suspended/i` for the suspended user; (c) `api.app.getIsPlatformAdmin`/a `verifyPlatformAdmin`-guarded action rejects a suspended admin. And in `adminUsers.test.ts`: (d) `setUserSuspended({userId,suspended:true})` by admin round-trips (Supabase `is_suspended` true); (e) non-admin `setUserSuspended` rejects; (f) `setUserSuspended` on the actor's OWN id rejects `/self|yourself|własne/i`.

- [ ] **Step 3: Run** — `cd convex && npx vitest run userSuspension` + `adminUsers`. Expect FAIL.

- [ ] **Step 4: Implement `setUserSuspended`** in `convex/admin/users.ts`:

```ts
export const setUserSuspended = action({
  args: { userId: v.id("users"), suspended: v.boolean() },
  returns: v.object({ userId: v.string(), suspended: v.boolean() }),
  handler: async (ctx, args) => {
    const { userId: actorId } = await ctx.runAction(internal._helpers.authAction.verifyPlatformAdmin, {});
    if (String(actorId) === String(args.userId)) {
      throw new Error("You cannot suspend your own account");
    }
    const db = createSupabaseDb();
    await db.patch("users", String(args.userId), { isSuspended: args.suspended });
    console.info(`[admin/users] user_${args.suspended ? "suspended" : "unsuspended"} userId=${args.userId} by=${actorId}`);
    return { userId: String(args.userId), suspended: args.suspended };
  },
});
```

- [ ] **Step 5: Add the three auth guards.** Each fetches the Supabase user and throws `"User suspended"` when `isSuspended`:
  - `convex/_helpers/authAction.ts` `verifyOrgAccess` — after auth + before/near the existing org-suspend check, add: `const suspUser = await db.get("users", String(userId)); if (suspUser && (suspUser as { isSuspended?: boolean }).isSuspended) throw new Error("User suspended");` (`db` = the existing `createSupabaseDb()` in that handler).
  - `convex/_helpers/authAction.ts` `verifyPlatformAdmin` — it already fetches `const user = await db.get("users", String(userId))`; add `if ((user as { isSuspended?: boolean }).isSuspended) throw new Error("User suspended");` before the `isPlatformAdmin` check.
  - `convex/supabase/jwt.ts` `mintUserToken` — after `auth.getUserId`, add `const db = createSupabaseDb(); const u = await db.get("users", String(userId)); if (u && (u as { isSuspended?: boolean }).isSuspended) throw new Error("User suspended");` before signing.

- [ ] **Step 6: Run tests** — expect PASS. Also `cd convex && npx vitest run orgSuspension tenantIsolation` to confirm no regression (the new user-suspend check is a no-op for non-suspended users). tsc convex clean.

- [ ] **Step 7: Commit** — `feat(admin): user suspension flag + setUserSuspended + auth guards (SP3 T2)`.

---

### Task 3: Frontend — users search + detail route

**Files:**
- Modify: `src/routes/_app/_auth/admin.users.tsx` (search + detail link)
- Create: `src/routes/_app/_auth/admin.users.$userId.tsx`

**Interfaces:**
- Consumes: `api.platformAdmins.list` / `setRole`, `api.admin.users.getUserDetail` / `setUserSuspended`, `api.app.getIsPlatformAdmin`.

- [ ] **Step 1: Extend `admin.users.tsx`.** Add a search `Input` filtering the `platformAdmins.list` rows by name/email (case-insensitive, null-safe). Add a "Szczegóły" link per row → `<Link to="/admin/users/$userId" params={{ userId: row._id }}>`. Keep the existing Grant/Revoke admin toggle + last-admin error toast. Do not remove existing behavior.

- [ ] **Step 2: Create `admin.users.$userId.tsx`** at `createFileRoute("/_app/_auth/admin/users/$userId")`, admin gate (copy from `admin.organizations.$orgId.tsx`). `useAction(api.admin.users.getUserDetail)` + `useQuery(["admin","users",userId], enabled: admin)`; `userId` from `Route.useParams()`. Cards:
  - **Profil**: read-only name/email/username/language/theme/timezone.
  - **Status**: platform-admin `Switch` (bound to `detail.isPlatformAdmin`) → `useMutation(api.platformAdmins.setRole)` with `{ userId, isPlatformAdmin }` (surface the last-admin error as a toast); suspended `Switch` (bound to `detail.isSuspended`) → `useMutation(api.admin.users.setUserSuspended)` with `{ userId, suspended }`. Determine the viewer's own id (compare via `getIsPlatformAdmin`-adjacent identity, or just let the backend reject self-suspend and surface the toast) — at minimum the self-suspend backend error must be shown as a toast.
  - **Organizacje**: `Table` of `detail.memberships` (org name, role Badge, joinedAt formatted).
  - Back link to `/admin/users`.
  - Invalidate `["admin","users",userId]` (and the `["adminUsers"]`/list key the existing page uses) on mutation success + `toast`.

- [ ] **Step 3: Verify** — `npx vite build` (regenerates route tree + bundles) then `npx tsc -p tsconfig.app.json --noEmit` clean.

- [ ] **Step 4: Commit** — `feat(admin): users search + detail route (SP3 T3)`.

---

## Rollout

Migration 00151 applies via CI on merge. Convex deploy: `npx convex dev --once` (runs headless from the Bash tool — auth from cached convex login) after merge. Verify: `/admin/users` search + detail; suspend a throwaway user and confirm their `mintUserToken` throws (login blocked); unsuspend restores; self-suspend is refused.
