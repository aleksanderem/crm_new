# Platform Admin — SP2 Organizations Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A platform-admin (`users.isPlatformAdmin`) cross-tenant Organizations console — list all orgs, drill into detail (members/roles/plan/entitlements/seat usage), and take reversible operator actions: suspend/reactivate, edit profile, override seat limit, read-only impersonation.

**Architecture:** Backend is Convex `action`s guarded by `verifyPlatformAdmin`, reading Supabase cross-tenant via `createSupabaseDb()` service-role, writing dual (Convex mutation for the permanent-mirror `organizations` table + Supabase patch) and calling `logAudit`. Frontend mirrors `admin.entitlements.tsx` (getIsPlatformAdmin gate → 403 card; useAction/useQuery/useMutation). New optional columns on `organizations` (`status`, `suspended_reason`, `seat_limit_override`) added via Convex schema + Supabase migration 00150.

**Tech Stack:** Convex (actions/mutations/internalActions), self-hosted Supabase Postgres, React 19 + TanStack Router/Query, shadcn/ui.

## Global Constraints

- Every new backend action MUST call `await ctx.runAction(internal._helpers.authAction.verifyPlatformAdmin, {})` as its first statement. Non-admins must be rejected.
- All new `organizations` columns are OPTIONAL / nullable; absent `status` = active. Migration must be non-destructive and idempotent (`ADD COLUMN IF NOT EXISTS`).
- `organizations` is a PERMANENT dual-write table (Convex `ctx.db` + Supabase). Every write action patches BOTH: a Convex `internalMutation` on `ctx.db` AND `createSupabaseDb().patch("organizations", …)`.
- Every operator write action calls `logAudit(ctx, { organizationId, userId, action, entityType: "organization", entityId })` immediately after the writes succeed.
- Convex unit tests run via `cd convex && npx vitest run <name>`. Never `npm run test:unit -- <name>`.
- Keep `npx tsc -p convex/tsconfig.json` green — a Convex deploy typechecks and will fail otherwise.
- Read path for lists/detail is Supabase service-role via `createSupabaseDb()` (cross-tenant is intended). Frontend never reads other tenants directly; it calls the admin actions.
- Suspend must NOT affect the admin console itself (which uses `verifyPlatformAdmin`, never `verifyOrgAccess`).
- Impersonation is read-only. Do NOT widen `verifyOrgAccess` to grant platform admins org access — writes and Convex-action reads must fail naturally for the impersonating admin. Impersonation grants ONLY a Supabase read token (org_id claim).

---

### Task 1: Data model — org status / suspended_reason / seat_limit_override

**Files:**
- Modify: `convex/schema/crm.ts` (organizations table definition)
- Create: `supabase/migrations/00150_organizations_admin_fields.sql`
- Modify: `convex/supabase/organizations.ts` (`writeOrganizationToSupabase` args + row)
- Test: `tests/convex/adminOrganizations.test.ts` (new; first case here)

**Interfaces:**
- Produces: `organizations.status?: "active" | "suspended"`, `organizations.suspendedReason?: string`, `organizations.seatLimitOverride?: number` (Convex); Supabase columns `status text`, `suspended_reason text`, `seat_limit_override integer`.

- [ ] **Step 1: Add optional fields to the Convex `organizations` table.** In `convex/schema/crm.ts`, extend the `organizations` `defineTable({...})` (currently `name, slug, ownerId, logo, website, createdAt, updatedAt, onboardingCompleted`) with:

```ts
    status: v.optional(v.union(v.literal("active"), v.literal("suspended"))),
    suspendedReason: v.optional(v.string()),
    seatLimitOverride: v.optional(v.number()),
```

Keep the existing `.index("by_slug", ...)` / `.index("by_ownerId", ...)` chain unchanged.

- [ ] **Step 2: Write the Supabase migration.** Create `supabase/migrations/00150_organizations_admin_fields.sql`:

```sql
-- Platform Admin SP2: operator-managed org fields.
-- status: absent/'active' = normal; 'suspended' blocks the tenant (auth + JWT mint).
-- suspended_reason: operator note shown in console + audit.
-- seat_limit_override: manual seat cap, participates in the "max wins" seat limit.
-- All nullable/idempotent — existing rows read as active with no override.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS suspended_reason text,
  ADD COLUMN IF NOT EXISTS seat_limit_override integer;
```

- [ ] **Step 3: Extend the dual-write action.** In `convex/supabase/organizations.ts`, add to `writeOrganizationToSupabase.args`: `status: v.optional(v.string())`, `suspendedReason: v.optional(v.string())`, `seatLimitOverride: v.optional(v.number())`. In its `row` object add `status: args.status ?? null, suspended_reason: args.suspendedReason ?? null, seat_limit_override: args.seatLimitOverride ?? null`. (This keeps full-row upserts complete; per-field admin edits use `db.patch` in Task 4.)

- [ ] **Step 4: Write the failing test.** Create `tests/convex/adminOrganizations.test.ts` with a first test that seeds an org (via the test harness's existing org-seeding helper — follow the pattern in `tests/convex/entitlements*.test.ts` or `tests/convex/organizations*.test.ts`) and asserts the new fields default to undefined/null and can be patched. If no direct schema test fits, assert the Supabase in-memory stub accepts `status`/`suspended_reason`/`seat_limit_override` on an `organizations` row insert/patch.

```ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "../../convex/schema";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";
// Follow the existing setup in tests/convex/entitlements*.test.ts for seeding.

test("organizations accepts admin fields (status/reason/override)", async () => {
  const db = createSupabaseDb();
  const id = "org_test_sp2";
  await db.insert("organizations", {
    id, name: "T", slug: "t", owner_id: "u1",
    created_at: 1, updated_at: 1,
    status: "suspended", suspended_reason: "abuse", seat_limit_override: 50,
  });
  const row = await db.get("organizations", id);
  expect(row?.status).toBe("suspended");
  expect(row?.seat_limit_override).toBe(50);
});
```

- [ ] **Step 5: Run the test** — `cd convex && npx vitest run adminOrganizations`. Expect PASS (in-memory stub is schemaless on columns; this verifies the row shape the app will use).

- [ ] **Step 6: Verify types + commit.** `npx tsc -p convex/tsconfig.json` clean. Commit: `feat(admin): org status/suspended_reason/seat_limit_override columns (SP2 T1)`.

---

### Task 2: Suspend enforcement in auth + JWT minting

**Files:**
- Modify: `convex/_helpers/authAction.ts` (`verifyOrgAccess`)
- Modify: `convex/supabase/jwt.ts` (`mintSupabaseToken`)
- Test: `tests/convex/orgSuspension.test.ts` (new)

**Interfaces:**
- Consumes: `organizations.status` from Task 1.
- Produces: suspended orgs throw `"Organization suspended"` from both `verifyOrgAccess` and `mintSupabaseToken`.

- [ ] **Step 1: Write the failing test.** Create `tests/convex/orgSuspension.test.ts`: seed a member of an org, set the org's Supabase `status="suspended"`, and assert that calling a normal member action (any action that internally runs `verifyOrgAccess`, e.g. `api.organizations.getMembers`) rejects with `/suspended/i`. Add a second case: an active org (status null) still succeeds. Follow harness/seeding from `tests/convex/tenantIsolation.test.ts`.

- [ ] **Step 2: Run it** — `cd convex && npx vitest run orgSuspension`. Expect FAIL (no suspend check yet).

- [ ] **Step 3: Add the suspend check to `verifyOrgAccess`.** In `convex/_helpers/authAction.ts`, after the `membership` is confirmed (line ~122, before the `return`), fetch the org and throw if suspended:

```ts
    const org = await db.get("organizations", String(args.organizationId));
    if (org && (org as { status?: string }).status === "suspended") {
      throw new Error("Organization suspended");
    }
```

- [ ] **Step 4: Add the same guard to `mintSupabaseToken`.** In `convex/supabase/jwt.ts`, after `verifyOrgAccess` resolves and before signing the JWT, fetch the org via `createSupabaseDb()` and throw `"Organization suspended"` if `status === "suspended"`. (Belt-and-suspenders: `verifyOrgAccess` already runs first here, but guarding at mint time makes the token boundary explicit.)

```ts
    const db = createSupabaseDb();
    const org = await db.get("organizations", String(args.organizationId));
    if (org && (org as { status?: string }).status === "suspended") {
      throw new Error("Organization suspended");
    }
```

- [ ] **Step 5: Run the test** — expect PASS. Also run `cd convex && npx vitest run tenantIsolation` to confirm no regression in the isolation suite.

- [ ] **Step 6: tsc + commit.** `feat(admin): block suspended orgs at verifyOrgAccess + mintSupabaseToken (SP2 T2)`.

---

### Task 3: Backend reads — listOrganizations + getOrganizationDetail

**Files:**
- Create: `convex/admin/organizations.ts`
- Test: `tests/convex/adminOrganizations.test.ts` (extend)

**Interfaces:**
- Consumes: `verifyPlatformAdmin`, `createSupabaseDb`, Task 1 columns.
- Produces:
  - `listOrganizations(): Array<{ organizationId, name, slug, ownerEmail, memberCount, status, plan: string | null, crm: "active"|"none", gabinet: "active"|"none", createdAt }>`
  - `getOrganizationDetail({ organizationId }): { organizationId, name, slug, website, ownerId, status, suspendedReason, seatLimitOverride, members: Array<{ userId, name, email, role, joinedAt }>, entitlements: { crm, gabinet }, plan: { key, name, seatLimit } | null, seatUsage: { currentSeats, effectiveSeatLimit } }`

- [ ] **Step 1: Write failing tests.** In `tests/convex/adminOrganizations.test.ts`, add: (a) `listOrganizations` called by a NON-admin rejects with `/platform admin/i`; (b) called by an admin returns a row for a seeded org with correct `memberCount` and `crm/gabinet` derived from seeded `productSubscriptions`; (c) `getOrganizationDetail` returns the seeded members with roles. Mirror the admin-seeding in `tests/convex/entitlements*.test.ts` (set `users.isPlatformAdmin=true` on the caller).

- [ ] **Step 2: Run** — `cd convex && npx vitest run adminOrganizations`. Expect FAIL (module doesn't exist).

- [ ] **Step 3: Implement `listOrganizations`.** Create `convex/admin/organizations.ts`. Mirror `convex/admin/entitlements.ts` `listOrgEntitlements` exactly for structure. Read `organizations`, `teamMemberships`, `productSubscriptions`, and owner `users` (via `db.getMany("users", ownerIds)`); optionally resolve plan name from `subscriptions` (best-effort, `null` if none). Build the row array. Use `returns:` validator like entitlements does.

```ts
import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";

const statusValidator = v.union(v.literal("active"), v.literal("none"));

export const listOrganizations = action({
  args: {},
  handler: async (ctx) => {
    await ctx.runAction(internal._helpers.authAction.verifyPlatformAdmin, {});
    const db = createSupabaseDb();
    const [orgs, memberships, entRows] = await Promise.all([
      db.query("organizations").collect(),
      db.query("teamMemberships").collect(),
      db.query("productSubscriptions").collect(),
    ]);
    const ownerIds = [...new Set(orgs.map((o) => String(o.ownerId)))];
    const owners = await db.getMany("users", ownerIds);
    const ownerById = new Map(owners.map((u) => [String(u._id), u]));
    const memberCount = new Map<string, number>();
    for (const m of memberships) {
      const k = String(m.organizationId);
      memberCount.set(k, (memberCount.get(k) ?? 0) + 1);
    }
    const entByOrg = new Map<string, Set<string>>();
    for (const e of entRows) {
      if (String(e.status) !== "active") continue;
      const k = String(e.organizationId);
      if (!entByOrg.has(k)) entByOrg.set(k, new Set());
      entByOrg.get(k)!.add(String(e.productId));
    }
    return orgs
      .map((o) => {
        const id = String(o._id);
        const owner = ownerById.get(String(o.ownerId));
        const ents = entByOrg.get(id) ?? new Set<string>();
        return {
          organizationId: id,
          name: (o.name as string) ?? "",
          slug: (o.slug as string) ?? "",
          ownerEmail: (owner?.email as string | null) ?? null,
          memberCount: memberCount.get(id) ?? 0,
          status: ((o.status as string) ?? "active") as "active" | "suspended",
          crm: ents.has("crm") ? "active" : "none",
          gabinet: ents.has("gabinet") ? "active" : "none",
          createdAt: Number(o.createdAt ?? 0),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});
```

> CRITICAL for implementer: the `createSupabaseDb().query(...).collect()` abstraction returns rows with **camelCase** keys and `_id` as the primary key (it maps DB snake_case→camelCase and `id`→`_id` on read). So read `o._id`, `o.ownerId`, `o.status`, `o.seatLimitOverride`, `o.createdAt`, `m.organizationId`, `e.organizationId`, `e.productId`; and `users` rows expose `u._id`, `u.email`, `u.name`. This exactly mirrors `convex/admin/entitlements.ts` `listOrgEntitlements` — open that function and copy its accessor style verbatim. Do NOT use snake_case accessors. Seed your test rows through the SAME harness the existing `entitlements.test.ts` uses so the read keys line up.

- [ ] **Step 4: Implement `getOrganizationDetail`.** `action({ args: { organizationId: v.string() } })`, guard first. Read the org row, its memberships (`db.query("teamMemberships").eq("organizationId", id).collect()`), member users via `getMany`, active entitlements, and seat usage via `ctx.runAction(internal._helpers.seatLimits.checkSeatLimitAction, { organizationId: id })`. Compose the detail object per the Interfaces block. Plan is best-effort from `subscriptions` (may be `null`).

- [ ] **Step 5: Run tests** — expect PASS.

- [ ] **Step 6: tsc + commit.** `feat(admin): listOrganizations + getOrganizationDetail actions (SP2 T3)`.

---

### Task 4: Backend writes — status / profile / seat override (+ seat override honored)

**Files:**
- Modify: `convex/admin/organizations.ts` (add write actions + Convex mirror mutation)
- Modify: `convex/_helpers/seatLimits.ts` (`checkSeatLimitAction` honors `seat_limit_override`)
- Test: `tests/convex/adminOrganizations.test.ts` (extend)

**Interfaces:**
- Consumes: Task 1 columns, `logAudit`, `verifyPlatformAdmin`.
- Produces:
  - `setOrganizationStatus({ organizationId, status: "active"|"suspended", reason? })`
  - `updateOrganizationProfile({ organizationId, name?, website?, ownerId? })`
  - `setSeatLimitOverride({ organizationId, seatLimit: number | null })`
  - `checkSeatLimitAction` returns `seatLimit = max(planSeatLimit, seat_limit_override ?? 0)`.

- [ ] **Step 1: Write failing tests.** Extend `adminOrganizations.test.ts`: (a) non-admin rejected on each write; (b) `setOrganizationStatus` suspends then reactivates, asserting the Supabase `organizations.status` value round-trips; (c) `setSeatLimitOverride(…, 50)` then `checkSeatLimitAction` returns `seatLimit >= 50`; (d) `updateOrganizationProfile` with `ownerId` that is NOT a member rejects with `/member/i`; with a valid member succeeds and patches `name`.

- [ ] **Step 2: Run** — expect FAIL.

- [ ] **Step 3: (No Convex mirror for these fields.)** The new admin-only fields (`status`, `suspended_reason`, `seat_limit_override`) are read ONLY via Supabase — `verifyOrgAccess`/`mintSupabaseToken` (T2) and `checkSeatLimitAction` (T4) all `createSupabaseDb().get("organizations", …)`. No QueryCtx path reads them from `ctx.db`, and prod orgs are Supabase-UUID keyed (not Convex `_id` addressable), so a Convex `organizations` mirror patch would be a prod no-op. Write Supabase only, with a one-line code comment noting this. (The permanent dual-write constraint concerns `teamMemberships`, which this task does not touch.)

- [ ] **Step 4: Implement the three write actions.** Each: guard `verifyPlatformAdmin` (capture `userId`), validate, `createSupabaseDb().patch("organizations", organizationId, {...})`, then `logAudit`. Pass **camelCase** keys to `db.patch` — its implementation runs `mapRowToSnake(updates)` internally, so `suspendedReason` → `suspended_reason`, `seatLimitOverride` → `seat_limit_override`, `updatedAt` → `updated_at`, `ownerId` → `owner_id`. Example:

```ts
export const setOrganizationStatus = action({
  args: {
    organizationId: v.string(),
    status: v.union(v.literal("active"), v.literal("suspended")),
    reason: v.optional(v.string()),
  },
  returns: v.object({ status: v.union(v.literal("active"), v.literal("suspended")) }),
  handler: async (ctx, args) => {
    const { userId } = await ctx.runAction(internal._helpers.authAction.verifyPlatformAdmin, {});
    // Supabase-only: these admin fields are read exclusively via createSupabaseDb
    // (verifyOrgAccess / checkSeatLimitAction). No Convex ctx.db mirror is consulted.
    const db = createSupabaseDb();
    await db.patch("organizations", args.organizationId, {
      status: args.status,
      suspendedReason: args.status === "suspended" ? (args.reason ?? null) : null,
      updatedAt: Date.now(),
    });
    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: String(userId),
      action: args.status === "suspended" ? "organization_suspended" : "organization_reactivated",
      entityType: "organization",
      entityId: args.organizationId,
    });
    return { status: args.status };
  },
});
```

> CASING RULE (both directions): `.query().collect()`/`.get()` RETURN camelCase (snake→camel on read); `.patch()`/`.insert()` ACCEPT camelCase and convert camel→snake on write (`mapRowToSnake`). So use camelCase everywhere at the `createSupabaseDb` boundary. `updateOrganizationProfile` patches `{ name?, website?, ownerId? }` (camelCase); `setSeatLimitOverride` patches `{ seatLimitOverride: number | null, updatedAt }`.

`updateOrganizationProfile`: if `ownerId` provided, first verify it appears in the org's `teamMemberships` (Supabase query) and throw `"New owner must be a member of the organization"` otherwise; patch `name`/`website`/`owner_id` (only provided fields). `setSeatLimitOverride`: patch `seat_limit_override` to the number or `null`; audit `organization_seat_override_set`.

- [ ] **Step 5: Honor the override in `checkSeatLimitAction`.** In `convex/_helpers/seatLimits.ts` `checkSeatLimitAction`, after fetching `org` and computing `seatLimit` from the subscription/plan lookup, apply:

```ts
    // db.get returns camelCase (snake→camel on read), so read seatLimitOverride.
    const override = (org as { seatLimitOverride?: number | null }).seatLimitOverride;
    const effectiveLimit = typeof override === "number"
      ? Math.max(seatLimit, override)
      : seatLimit;
    return { currentSeats, seatLimit: effectiveLimit, canAddMore: currentSeats < effectiveLimit };
```

(Max-wins keeps the existing philosophy; an override can raise but not silently lower the limit.)

- [ ] **Step 6: Run tests** — expect PASS. Also `cd convex && npx vitest run seatLimit` if such a test exists, to confirm no regression.

- [ ] **Step 7: tsc + commit.** `feat(admin): org suspend/profile/seat-override write actions (SP2 T4)`.

---

### Task 5: Frontend — Organizations list route

**Files:**
- Create: `src/routes/_app/_auth/admin.organizations.tsx`
- Modify: `src/routes/_app/_auth/admin.index.tsx` (add "Organizacje" tile/link)
- Test: manual/visual (frontend has no unit harness for routes here)

**Interfaces:**
- Consumes: `api.admin.organizations.listOrganizations`, `api.app.getIsPlatformAdmin`.

- [ ] **Step 1: Create the route.** Copy the structure of `src/routes/_app/_auth/admin.entitlements.tsx` verbatim (createFileRoute path `/_app/_auth/admin/organizations`, the `getIsPlatformAdmin` gate + 403 card, `useAction`+`useQuery`). Render a `Card` + `Table` with columns: Nazwa, Właściciel (ownerEmail), Członkowie (memberCount), Status (Badge: green "Aktywna" / red "Zawieszona"), Plan, CRM/Gabinet (Badge per active), and a "Szczegóły" link to `/admin/organizations/$orgId`. Add a simple client-side search `Input` filtering by name/ownerEmail.

- [ ] **Step 2: Link from the admin hub.** In `admin.index.tsx`, add a card/link "Organizacje" → `/admin/organizations` alongside the existing entitlements/users tiles.

- [ ] **Step 3: Verify build.** `npm run build` (or `npx tsc -p tsconfig.json` for the frontend) compiles. Route table renders with the query.

- [ ] **Step 4: Commit.** `feat(admin): Organizations list route + admin hub link (SP2 T5)`.

---

### Task 6: Frontend — Organization detail route

**Files:**
- Create: `src/routes/_app/_auth/admin.organizations.$orgId.tsx`
- Test: manual/visual

**Interfaces:**
- Consumes: `api.admin.organizations.getOrganizationDetail`, `setOrganizationStatus`, `updateOrganizationProfile`, `setSeatLimitOverride`.

- [ ] **Step 1: Create the detail route** at path `/_app/_auth/admin/organizations/$orgId`, same admin gate. Layout with `Card`s:
  - Profil: editable `Input`s for name/website + owner select (from members); "Zapisz" → `updateOrganizationProfile` mutation.
  - Status: current Badge + "Zawieś"/"Reaktywuj" button; suspend opens a `Dialog` with a reason `Textarea` → `setOrganizationStatus`.
  - Miejsca (seats): show `seatUsage.currentSeats / effectiveSeatLimit`, an override `Input` (number, empty = brak) → `setSeatLimitOverride`.
  - Członkowie: `Table` of members (name, email, role Badge, joinedAt).
  - Uprawnienia (entitlements): show CRM/Gabinet Badges + a link to `/admin/entitlements` for editing (reuse SP1; do not duplicate the toggle logic here).

- [ ] **Step 2: Wire mutations** with `useMutation` + `queryClient.invalidateQueries` on the detail query key + `toast` (mirror entitlements). Guard destructive "Zawieś" behind the reason dialog.

- [ ] **Step 3: Verify build** compiles; detail renders for a real org id.

- [ ] **Step 4: Commit.** `feat(admin): Organization detail route with operator actions (SP2 T6)`.

---

### Task 7: Impersonation — read-only support view (heaviest, last)

**Files:**
- Modify: `convex/supabase/jwt.ts` (add `mintImpersonationToken`)
- Create/Modify: frontend impersonation state (a small context/provider + banner) and an "Wejdź jako" button on the detail route.
- Test: `tests/convex/impersonation.test.ts` (new)

**Interfaces:**
- Consumes: `verifyPlatformAdmin`, `logAudit`, `SUPABASE_JWT_SECRET`.
- Produces: `mintImpersonationToken({ organizationId }): { token, expiresAt }` — a Supabase JWT with `sub = adminUserId`, `org_id = targetOrg`, `imp: true`, `role: "authenticated"`.

- [ ] **Step 1: Write failing test.** `tests/convex/impersonation.test.ts`: (a) non-admin caller of `mintImpersonationToken` rejects with `/platform admin/i`; (b) admin caller gets a token string; (c) DOCUMENT the read-only guarantee: assert that the impersonating admin (NOT a member of the target org) still fails `verifyOrgAccess`-backed writes on that org (e.g. a write mutation rejects), proving writes don't leak. Follow harness from `orgSuspension.test.ts`.

- [ ] **Step 2: Run** — expect FAIL.

- [ ] **Step 3: Implement `mintImpersonationToken`.** In `convex/supabase/jwt.ts`, model it on `mintSupabaseToken` but replace the membership check with `ctx.runAction(internal._helpers.authAction.verifyPlatformAdmin, {})`, sign with claims `{ sub: String(userId), org_id: args.organizationId, role: "authenticated", imp: true }`, and `logAudit` (`organization_impersonation_started`). Do NOT modify `verifyOrgAccess`.

```ts
export const mintImpersonationToken = action({
  args: { organizationId: v.string() },
  returns: v.object({ token: v.string(), expiresAt: v.number() }),
  handler: async (ctx, args) => {
    const { userId } = await ctx.runAction(internal._helpers.authAction.verifyPlatformAdmin, {});
    const secret = new TextEncoder().encode(SUPABASE_JWT_SECRET);
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 3600;
    const token = await new SignJWT({
      sub: String(userId), org_id: args.organizationId, role: "authenticated", imp: true,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer("supabase").setIssuedAt(now).setExpirationTime(expiresAt).sign(secret);
    await logAudit(ctx, {
      organizationId: args.organizationId, userId: String(userId),
      action: "organization_impersonation_started", entityType: "organization",
      entityId: args.organizationId,
    });
    return { token, expiresAt };
  },
});
```

- [ ] **Step 4: Run tests** — expect PASS.

- [ ] **Step 5: Frontend impersonation.** Add a minimal impersonation layer: on "Wejdź jako" (detail route) call `mintImpersonationToken`, store `{ token, orgId, orgName }` in a context (e.g. sessionStorage-backed `ImpersonationProvider`), and have the Supabase token hook (`src/hooks/use-supabase-token.ts`) prefer the impersonation token when active. Render a persistent top banner: "Podgląd jako operator: {orgName} — tryb tylko-do-odczytu. [Wyjdź]". "Wyjdź" clears the state. Document (banner + code comment) that write actions and Convex-action-backed reads are unavailable in this mode by design.

> NOTE for implementer: inspect `src/hooks/use-supabase-token.ts` + `src/components/supabase-provider.tsx` before wiring — the override must not break the normal (non-impersonating) token refresh. If the integration is more invasive than a token-source swap, STOP and report; impersonation can ship as a follow-up without blocking SP2 T1–T6.

- [ ] **Step 6: Verify** build compiles; manual: admin enters a real org, sees data read-only + banner, "Wyjdź" restores normal session.

- [ ] **Step 7: tsc + commit.** `feat(admin): read-only org impersonation (SP2 T7)`.

---

## Rollout (after all tasks + final review)

Migration 00150 applies via CI on merge to main (never hand-run DDL on the shared DB). Convex deploy to `helpful-mule-867` is manual (needs TTY) — request it from the user when SP2 is merged and tsc-clean. Verify: `/admin/organizations` lists orgs; suspend a throwaway/test org and confirm its login is blocked, then reactivate.
