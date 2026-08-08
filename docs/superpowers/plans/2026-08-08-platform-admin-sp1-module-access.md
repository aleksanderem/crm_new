# Platform Admin SP1 — Module Access & Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give platform admins a UI to grant/revoke module access (CRM, Gabinet) per organization, backfill existing orgs, and re-enable the module-access enforcement that is currently disabled by emergency stopgaps.

**Architecture:** Entitlements are rows in the existing Convex `productSubscriptions` table (the table the enforcement already reads). Admin reads that need org data (in Supabase) are Convex **actions**; entitlement writes are Convex **internalMutations** (Convex-only table). A platform-admin-gated page under `/admin` renders the org×module grid. Enforcement (`getActiveProducts`, `verifyProductAccess`) is flipped back on only after existing orgs are backfilled.

**Tech Stack:** Convex (actions/queries/mutations, convex-test + Vitest), React 19 + TanStack Router/Query, shadcn/ui, Playwright.

## Global Constraints

- Build on top of **PR #4345** (`fix/unblock-gabinet-and-pln-schema`) merged to `main` — it contains the stopgaps this plan reverts (`verifyProductAccess` fail-open, `getActiveProducts` catalog fallback). Do not start the enforcement flip until #4345 is merged and this branch is rebased on it.
- The serving Convex deployment is **`helpful-mule-867`**; deploy with `npx convex dev --once` (NOT `convex deploy`, which targets the unused `pleasant-elephant-723`).
- `organizations`, `teamMemberships`, `gabinet_*` are in Supabase (TABLE_MAP); a Convex **query** cannot read them — use **actions** + `createSupabaseDb()`. `productSubscriptions` is Convex-only — read/write it in query/mutation ctx.
- Platform-admin gate: `await ctx.runAction(internal._helpers.authAction.verifyPlatformAdmin, {})` → returns `{ userId: Id<"users"> }`; throws for non-admins.
- Entitlement product ids are exactly `"crm"` and `"gabinet"` (match `platformProducts.productId`). CRM is the baseline (auto-granted, never revoked in UI). Revoke = set `status: "canceled"` (never delete).
- Run Convex tests with `npm run test:unit` (cwd is `convex/`). Test files live in `tests/convex/`.
- No new npm dependencies. Reuse shadcn components in `src/components/ui/`.
- Convex functions use the object form `{ args, handler }` (a lint hook enforces this).

---

## File Structure

- Modify `convex/schema/platform.ts` — add `source`, `grantedByUserId`, `note` to `productSubscriptions`.
- Create `convex/admin/entitlements.ts` — `setEntitlement` (action), `_upsertEntitlement` (internalMutation), `listOrgEntitlements` (action), `_listEntitlementsInternal` (internalQuery).
- Modify `convex/organizations.ts` — auto-grant CRM in `create`.
- Create `convex/migrations/backfillEntitlements.ts` — one-off backfill action.
- Modify `convex/productSubscriptions.ts` — remove catalog fallback (enforcement flip).
- Modify `convex/_helpers/products.ts` — restore `verifyProductAccess` throw (enforcement flip).
- Create `src/routes/_app/_auth/admin.entitlements.tsx` — admin grid.
- Modify `src/routes/_app/_auth/admin.index.tsx` — add card link.
- Create tests: `tests/convex/entitlements.test.ts`, `tests/convex/backfillEntitlements.test.ts`, `tests/convex/enforcementFlip.test.ts`, `e2e/admin/entitlements.spec.ts`.

---

### Task 1: Entitlement write path (schema + upsert mutation + setEntitlement action)

**Files:**
- Modify: `convex/schema/platform.ts:95-115` (productSubscriptions table)
- Create: `convex/admin/entitlements.ts`
- Test: `tests/convex/entitlements.test.ts`

**Interfaces:**
- Consumes: `internal._helpers.authAction.verifyPlatformAdmin` → `{ userId: Id<"users"> }`; `logAudit(ctx, {...})` from `convex/auditLog.ts`.
- Produces:
  - `internal.admin.entitlements._upsertEntitlement` (internalMutation) args `{ organizationId: Id<"organizations">, productId: "crm"|"gabinet", grant: boolean, grantedByUserId: Id<"users"> }` → returns `{ status: "active"|"canceled" }`.
  - `api.admin.entitlements.setEntitlement` (action) args `{ organizationId: Id<"organizations">, productId: "crm"|"gabinet", grant: boolean }` → returns `{ status: "active"|"canceled" }`.

- [ ] **Step 1: Add schema fields**

In `convex/schema/platform.ts`, inside the `productSubscriptions` `defineTable({...})` object (after `trialEndDate`, before `createdAt`), add:

```ts
    source: v.optional(v.union(v.literal("manual"), v.literal("stripe"))),
    grantedByUserId: v.optional(v.id("users")),
    note: v.optional(v.string()),
```

- [ ] **Step 2: Write the failing test**

Create `tests/convex/entitlements.test.ts`:

```ts
import { afterEach, describe, expect, test } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

// Make the seeded user a platform admin by inserting them into the in-memory
// Supabase users table with is_platform_admin=true (verifyPlatformAdmin reads
// the Supabase users row, which seedTestUser does not create).
async function makePlatformAdmin(userId: string) {
  await createSupabaseDb().insert("users", {
    _id: userId,
    name: "Admin",
    email: `admin-${userId}@example.com`,
    isPlatformAdmin: true,
  });
}

describe("admin/entitlements.setEntitlement", () => {
  test("grant creates an active manual entitlement with audit", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await makePlatformAdmin(String(userId));

    const res = await t
      .withIdentity(identity)
      .action(api.admin.entitlements.setEntitlement, {
        organizationId,
        productId: "gabinet",
        grant: true,
      });
    expect(res.status).toBe("active");

    const row = await t.run(async (ctx) =>
      ctx.db
        .query("productSubscriptions")
        .withIndex("by_orgAndProduct", (q) =>
          q.eq("organizationId", organizationId).eq("productId", "gabinet"),
        )
        .unique(),
    );
    expect(row?.status).toBe("active");
    expect(row?.source).toBe("manual");
    expect(String(row?.grantedByUserId)).toBe(String(userId));

    const audit = await t.run(async (ctx) =>
      ctx.db.query("auditLog").collect(),
    );
    expect(audit.some((a) => a.action === "product_access_granted")).toBe(true);
  });

  test("revoke flips an existing entitlement to canceled", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await makePlatformAdmin(String(userId));

    await t.withIdentity(identity).action(api.admin.entitlements.setEntitlement, {
      organizationId, productId: "gabinet", grant: true,
    });
    const res = await t
      .withIdentity(identity)
      .action(api.admin.entitlements.setEntitlement, {
        organizationId, productId: "gabinet", grant: false,
      });
    expect(res.status).toBe("canceled");

    const row = await t.run(async (ctx) =>
      ctx.db
        .query("productSubscriptions")
        .withIndex("by_orgAndProduct", (q) =>
          q.eq("organizationId", organizationId).eq("productId", "gabinet"),
        )
        .unique(),
    );
    expect(row?.status).toBe("canceled");
  });

  test("rejects non-platform-admin callers", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    // Insert Supabase user WITHOUT platform admin.
    await createSupabaseDb().insert("users", {
      _id: String(userId), name: "Nobody", email: "nobody@example.com",
      isPlatformAdmin: false,
    });
    await expect(
      t.withIdentity(identity).action(api.admin.entitlements.setEntitlement, {
        organizationId, productId: "gabinet", grant: true,
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:unit -- entitlements`
Expected: FAIL — `api.admin.entitlements.setEntitlement` does not exist.

- [ ] **Step 4: Implement the write path**

Create `convex/admin/entitlements.ts`:

```ts
import { v } from "convex/values";
import { action, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { logAudit } from "../auditLog";

const productIdValidator = v.union(v.literal("crm"), v.literal("gabinet"));

// Convex-side upsert of a per-org product entitlement. Convex-only table.
export const _upsertEntitlement = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    productId: productIdValidator,
    grant: v.boolean(),
    grantedByUserId: v.id("users"),
  },
  handler: async (ctx, args): Promise<{ status: "active" | "canceled" }> => {
    const status = args.grant ? "active" : "canceled";
    const now = Date.now();
    const existing = await ctx.db
      .query("productSubscriptions")
      .withIndex("by_orgAndProduct", (q) =>
        q.eq("organizationId", args.organizationId).eq("productId", args.productId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status,
        source: "manual",
        grantedByUserId: args.grantedByUserId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("productSubscriptions", {
        organizationId: args.organizationId,
        productId: args.productId,
        status,
        cancelAtPeriodEnd: false,
        source: "manual",
        grantedByUserId: args.grantedByUserId,
        createdAt: now,
        updatedAt: now,
      });
    }

    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: args.grantedByUserId,
      action: args.grant ? "product_access_granted" : "product_access_revoked",
      entityType: "productSubscription",
      entityId: args.productId,
    });

    return { status };
  },
});

// Platform-admin: grant or revoke a module for an org.
export const setEntitlement = action({
  args: {
    organizationId: v.id("organizations"),
    productId: productIdValidator,
    grant: v.boolean(),
  },
  handler: async (ctx, args): Promise<{ status: "active" | "canceled" }> => {
    const { userId } = await ctx.runAction(
      internal._helpers.authAction.verifyPlatformAdmin,
      {},
    );
    return await ctx.runMutation(internal.admin.entitlements._upsertEntitlement, {
      organizationId: args.organizationId,
      productId: args.productId,
      grant: args.grant,
      grantedByUserId: userId,
    });
  },
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:unit -- entitlements`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck**

Run: `npx tsc -p convex/tsconfig.json`
Expected: exit 0, 0 errors.

- [ ] **Step 7: Commit**

```bash
git add convex/schema/platform.ts convex/admin/entitlements.ts tests/convex/entitlements.test.ts
git commit -m "feat(admin): entitlement write path — setEntitlement + upsert + audit"
```

---

### Task 2: Entitlement listing (internalQuery + listOrgEntitlements action)

**Files:**
- Modify: `convex/admin/entitlements.ts`
- Test: `tests/convex/entitlements.test.ts` (add a describe block)

**Interfaces:**
- Consumes: `createSupabaseDb()` (`convex/_helpers/supabaseDb.ts`) — `.query(table).collect()`, `.query(table).eq(field, value).collect()`.
- Produces:
  - `internal.admin.entitlements._listEntitlementsInternal` (internalQuery) args `{}` → `Array<{ organizationId: string; productId: string; status: string }>`.
  - `api.admin.entitlements.listOrgEntitlements` (action) args `{}` → `Array<{ organizationId: string; name: string; memberCount: number; crm: "active"|"canceled"|"none"; gabinet: "active"|"canceled"|"none" }>`.

- [ ] **Step 1: Write the failing test**

Append to `tests/convex/entitlements.test.ts`:

```ts
describe("admin/entitlements.listOrgEntitlements", () => {
  test("merges orgs with their entitlement status", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await createSupabaseDb().insert("users", {
      _id: String(userId), name: "Admin", email: "a@example.com",
      isPlatformAdmin: true,
    });
    await t.withIdentity(identity).action(api.admin.entitlements.setEntitlement, {
      organizationId, productId: "gabinet", grant: true,
    });

    const rows = await t
      .withIdentity(identity)
      .action(api.admin.entitlements.listOrgEntitlements, {});
    const org = rows.find((r) => r.organizationId === String(organizationId));
    expect(org).toBeTruthy();
    expect(org?.name).toBe("Test Org");
    expect(org?.gabinet).toBe("active");
    expect(org?.crm).toBe("none");
    expect(org?.memberCount).toBe(1);
  });

  test("rejects non-platform-admin callers", async () => {
    const t = createTestCtx();
    const { userId, identity } = await seedTestUser(t);
    await createSupabaseDb().insert("users", {
      _id: String(userId), name: "N", email: "n@example.com", isPlatformAdmin: false,
    });
    await expect(
      t.withIdentity(identity).action(api.admin.entitlements.listOrgEntitlements, {}),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- entitlements`
Expected: FAIL — `listOrgEntitlements` does not exist.

- [ ] **Step 3: Implement listing**

Append to `convex/admin/entitlements.ts` (add `internalQuery` to the `_generated/server` import and `createSupabaseDb` from `../_helpers/supabaseDb`):

```ts
import { internalQuery } from "../_generated/server";
import { createSupabaseDb } from "../_helpers/supabaseDb";

type EntStatus = "active" | "canceled" | "none";

export const _listEntitlementsInternal = internalQuery({
  args: {},
  handler: async (
    ctx,
  ): Promise<Array<{ organizationId: string; productId: string; status: string }>> => {
    const rows = await ctx.db.query("productSubscriptions").collect();
    return rows.map((r) => ({
      organizationId: String(r.organizationId),
      productId: r.productId,
      status: r.status,
    }));
  },
});

export const listOrgEntitlements = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<
    Array<{
      organizationId: string;
      name: string;
      memberCount: number;
      crm: EntStatus;
      gabinet: EntStatus;
    }>
  > => {
    await ctx.runAction(internal._helpers.authAction.verifyPlatformAdmin, {});
    const db = createSupabaseDb();
    const orgs = await db.query("organizations").collect();
    const memberships = await db.query("teamMemberships").collect();
    const ents = await ctx.runQuery(
      internal.admin.entitlements._listEntitlementsInternal,
      {},
    );

    const statusFor = (orgId: string, productId: string): EntStatus => {
      const e = ents.find(
        (x) => x.organizationId === orgId && x.productId === productId,
      );
      if (!e) return "none";
      return e.status === "active" || e.status === "trialing" ? "active" : "canceled";
    };

    return orgs
      .map((o) => {
        const orgId = String(o._id);
        return {
          organizationId: orgId,
          name: (o.name as string) ?? "(no name)",
          memberCount: memberships.filter(
            (m) => String(m.organizationId) === orgId,
          ).length,
          crm: statusFor(orgId, "crm"),
          gabinet: statusFor(orgId, "gabinet"),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- entitlements`
Expected: PASS (5 tests total).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc -p convex/tsconfig.json` (expect 0 errors), then:

```bash
git add convex/admin/entitlements.ts tests/convex/entitlements.test.ts
git commit -m "feat(admin): listOrgEntitlements — org x module grid backend"
```

---

### Task 3: Auto-grant CRM on org creation

**Files:**
- Modify: `convex/organizations.ts:51-90` (the `_createOrgInternal` internalMutation)
- Test: `tests/convex/entitlements.test.ts` (add a describe block)

**Interfaces:**
- Consumes: nothing new — inserts the CRM `productSubscriptions` row directly in the mutation ctx, mirroring `_upsertEntitlement`'s insert shape (Task 1). Placed in `_createOrgInternal` because it already has the creator `user` (from `requireUser`) and `ctx.db`.

- [ ] **Step 1: Write the failing test**

Append to `tests/convex/entitlements.test.ts`:

```ts
describe("organizations.create — CRM baseline grant", () => {
  test("new org receives an active CRM entitlement", async () => {
    const t = createTestCtx();
    const { userId, identity } = await seedTestUser(t);
    // seedTestUser already made an org named "test-org"; create a second.
    const orgId = await t
      .withIdentity(identity)
      .action(api.organizations.create, {
        name: "Second Org",
        slug: "second-org",
      });

    const row = await t.run(async (ctx) =>
      ctx.db
        .query("productSubscriptions")
        .withIndex("by_orgAndProduct", (q) =>
          q.eq("organizationId", orgId as any).eq("productId", "crm"),
        )
        .unique(),
    );
    expect(row?.status).toBe("active");
    expect(row?.source).toBe("manual");
    expect(String(row?.grantedByUserId)).toBe(String(userId));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- entitlements`
Expected: FAIL — no CRM `productSubscriptions` row after create.

- [ ] **Step 3: Implement the CRM grant**

In `convex/organizations.ts`, inside `_createOrgInternal`, after the owner `teamMemberships` insert (the `user`, `orgId`, and `now` variables are already in scope), add a direct CRM entitlement insert:

```ts
    // Grant the CRM baseline entitlement to every new org. getActiveProducts /
    // verifyProductAccess read productSubscriptions; without this a new org
    // would have no modules once enforcement is on. Direct insert (create path,
    // no pre-existing row); mirrors _upsertEntitlement's shape.
    await ctx.db.insert("productSubscriptions", {
      organizationId: orgId,
      productId: "crm",
      status: "active",
      cancelAtPeriodEnd: false,
      source: "manual",
      grantedByUserId: user._id,
      createdAt: now,
      updatedAt: now,
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- entitlements`
Expected: PASS (6 tests total).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc -p convex/tsconfig.json` (expect 0 errors), then:

```bash
git add convex/organizations.ts tests/convex/entitlements.test.ts
git commit -m "feat(admin): auto-grant CRM baseline entitlement on org create"
```

---

### Task 4: Backfill action (CRM to all, Gabinet to gabinet-data orgs)

**Files:**
- Create: `convex/migrations/backfillEntitlements.ts`
- Test: `tests/convex/backfillEntitlements.test.ts`

**Interfaces:**
- Consumes: `createSupabaseDb()`; `internal.admin.entitlements._upsertEntitlement`; `internal.admin.entitlements._listEntitlementsInternal`.
- Produces: `internal.migrations.backfillEntitlements.run` (internalAction) args `{ dryRun?: boolean }` → `{ orgs: number; crmGranted: number; gabinetGranted: number; dryRun: boolean }`.

- [ ] **Step 1: Write the failing test**

Create `tests/convex/backfillEntitlements.test.ts`:

```ts
import { afterEach, describe, expect, test } from "vitest";
import { internal } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe("migrations/backfillEntitlements.run", () => {
  test("grants CRM to all orgs and Gabinet only to orgs with gabinet data; idempotent", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);
    // Give this org gabinet data (a patient row in Supabase).
    await createSupabaseDb().insert("gabinetPatients", {
      _id: "pat_1",
      organizationId: String(organizationId),
      firstName: "Jan", lastName: "Kowalski",
      createdBy: String(userId), createdAt: Date.now(), updatedAt: Date.now(),
    });

    const res = await t.run(async () => null).then(() =>
      t.action(internal.migrations.backfillEntitlements.run, { dryRun: false }),
    );
    expect(res.crmGranted).toBeGreaterThanOrEqual(1);
    expect(res.gabinetGranted).toBeGreaterThanOrEqual(1);

    const rows = await t.run(async (ctx) =>
      ctx.db.query("productSubscriptions").collect(),
    );
    const crm = rows.find(
      (r) => String(r.organizationId) === String(organizationId) && r.productId === "crm",
    );
    const gab = rows.find(
      (r) => String(r.organizationId) === String(organizationId) && r.productId === "gabinet",
    );
    expect(crm?.status).toBe("active");
    expect(gab?.status).toBe("active");

    // Idempotent: second run grants nothing new.
    const res2 = await t.action(internal.migrations.backfillEntitlements.run, {
      dryRun: false,
    });
    expect(res2.crmGranted).toBe(0);
    expect(res2.gabinetGranted).toBe(0);
  });

  test("dryRun writes nothing", async () => {
    const t = createTestCtx();
    await seedTestUser(t);
    const res = await t.action(internal.migrations.backfillEntitlements.run, {
      dryRun: true,
    });
    expect(res.dryRun).toBe(true);
    const rows = await t.run(async (ctx) =>
      ctx.db.query("productSubscriptions").collect(),
    );
    expect(rows.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- backfillEntitlements`
Expected: FAIL — `internal.migrations.backfillEntitlements.run` does not exist.

- [ ] **Step 3: Implement the backfill**

Create `convex/migrations/backfillEntitlements.ts`:

```ts
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import type { Id } from "../_generated/dataModel";

// One-off: ensure every org has a CRM entitlement, and every org with real
// gabinet data has a Gabinet entitlement. Idempotent. Pass dryRun to count only.
export const run = internalAction({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ orgs: number; crmGranted: number; gabinetGranted: number; dryRun: boolean }> => {
    const dryRun = args.dryRun ?? false;
    const db = createSupabaseDb();
    const orgs = await db.query("organizations").collect();
    const existing = await ctx.runQuery(
      internal.admin.entitlements._listEntitlementsInternal,
      {},
    );
    const has = (orgId: string, productId: string) =>
      existing.some(
        (e) => e.organizationId === orgId && e.productId === productId,
      );

    // Any org appearing in these gabinet tables counts as "using gabinet".
    const gabinetOrgIds = new Set<string>();
    for (const table of ["gabinetPatients", "gabinetEmployees", "gabinetAppointments"] as const) {
      const rows = await db.query(table).collect();
      for (const r of rows) gabinetOrgIds.add(String((r as { organizationId: unknown }).organizationId));
    }

    // A system actor id for grantedByUserId: reuse the first org owner if present.
    let crmGranted = 0;
    let gabinetGranted = 0;
    for (const o of orgs) {
      const orgId = String(o._id);
      const grantedBy = String((o as { ownerId?: unknown }).ownerId ?? o._id);
      if (!has(orgId, "crm")) {
        crmGranted++;
        if (!dryRun) {
          await ctx.runMutation(internal.admin.entitlements._upsertEntitlement, {
            organizationId: orgId as unknown as Id<"organizations">,
            productId: "crm",
            grant: true,
            grantedByUserId: grantedBy as unknown as Id<"users">,
          });
        }
      }
      if (gabinetOrgIds.has(orgId) && !has(orgId, "gabinet")) {
        gabinetGranted++;
        if (!dryRun) {
          await ctx.runMutation(internal.admin.entitlements._upsertEntitlement, {
            organizationId: orgId as unknown as Id<"organizations">,
            productId: "gabinet",
            grant: true,
            grantedByUserId: grantedBy as unknown as Id<"users">,
          });
        }
      }
    }

    return { orgs: orgs.length, crmGranted, gabinetGranted, dryRun };
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- backfillEntitlements`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc -p convex/tsconfig.json` (expect 0 errors), then:

```bash
git add convex/migrations/backfillEntitlements.ts tests/convex/backfillEntitlements.test.ts
git commit -m "feat(admin): backfillEntitlements one-off (CRM all, Gabinet by data)"
```

---

### Task 5: Admin UI — entitlements grid + index card

**Files:**
- Create: `src/routes/_app/_auth/admin.entitlements.tsx`
- Modify: `src/routes/_app/_auth/admin.index.tsx` (add a card)
- Test: `e2e/admin/entitlements.spec.ts`

**Interfaces:**
- Consumes: `api.app.getIsPlatformAdmin` (action), `api.admin.entitlements.listOrgEntitlements` (action), `api.admin.entitlements.setEntitlement` (action).

- [ ] **Step 1: Implement the route**

Create `src/routes/_app/_auth/admin.entitlements.tsx` — mirror the gate + data-fetch pattern of `admin.users.tsx`:

```tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { formatActionError } from "@/lib/format-action-error";

export const Route = createFileRoute("/_app/_auth/admin/entitlements")({
  component: AdminEntitlements,
});

function AdminEntitlements() {
  const queryClient = useQueryClient();
  const getIsPlatformAdmin = useAction(api.app.getIsPlatformAdmin);
  const { data: adminStatus, isLoading: adminLoading } = useQuery({
    queryKey: ["isPlatformAdmin"],
    queryFn: () => getIsPlatformAdmin({}),
  });

  const listAction = useAction(api.admin.entitlements.listOrgEntitlements);
  const listQuery = useQuery({
    queryKey: ["admin", "entitlements"],
    queryFn: () => listAction({}),
    enabled: Boolean(adminStatus?.isPlatformAdmin),
  });

  const setAction = useAction(api.admin.entitlements.setEntitlement);
  const setMutation = useMutation({
    mutationFn: setAction,
    onSuccess: () => {
      toast.success("Zaktualizowano dostęp");
      queryClient.invalidateQueries({ queryKey: ["admin", "entitlements"] });
    },
    onError: (e) => toast.error(formatActionError(e)),
  });

  if (adminLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!adminStatus?.isPlatformAdmin) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <Card>
          <CardHeader>
            <CardTitle>403 — Platform admin required</CardTitle>
            <CardDescription>This page is only accessible to platform administrators.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/admin" className="text-sm underline">Back to admin</Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const rows = listQuery.data ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dostęp do modułów</h1>
        <p className="text-sm text-muted-foreground">
          Nadawaj i odbieraj moduły per organizacja. CRM jest bazowy (zawsze aktywny).
        </p>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organizacja</TableHead>
                <TableHead>Członkowie</TableHead>
                <TableHead>CRM</TableHead>
                <TableHead>Gabinet</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((org) => (
                <TableRow key={org.organizationId}>
                  <TableCell className="font-medium">{org.name}</TableCell>
                  <TableCell>{org.memberCount}</TableCell>
                  <TableCell><Badge variant="secondary">Bazowy</Badge></TableCell>
                  <TableCell>
                    <Switch
                      checked={org.gabinet === "active"}
                      disabled={setMutation.isPending}
                      onCheckedChange={(checked) => {
                        if (!checked && !window.confirm(`Odebrać Gabinet dla „${org.name}"? Odetnie to żywy moduł.`)) {
                          return;
                        }
                        setMutation.mutate({
                          organizationId: org.organizationId as never,
                          productId: "gabinet",
                          grant: checked,
                        });
                      }}
                      aria-label={`Gabinet dla ${org.name}`}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Add the card to the admin index**

In `src/routes/_app/_auth/admin.index.tsx`, add inside the `grid` div (alongside the existing cards):

```tsx
        <Link to="/admin/entitlements" className="block">
          <Card className="h-full transition hover:border-foreground/20">
            <CardHeader>
              <CardTitle>Module access</CardTitle>
              <CardDescription>
                Grant or revoke module access (CRM, Gabinet) per organization.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
```

- [ ] **Step 3: App typecheck**

Run: `npx tsc -p tsconfig.app.json`
Expected: 0 new errors in the two touched files (pre-existing repo errors elsewhere are out of scope — confirm none reference `admin.entitlements.tsx`).

- [ ] **Step 4: Write the E2E test**

Create `e2e/admin/entitlements.spec.ts` following the existing `e2e/` login helper pattern (check an existing spec for the login fixture; log in as the platform-admin test account). Assert: navigating to `/admin/entitlements` shows the "Dostęp do modułów" heading and at least one org row; toggling the Gabinet switch shows the success toast and the switch stays in the new state after refetch. Add a second case: a non-admin session sees the "403 — Platform admin required" card.

- [ ] **Step 5: Run E2E**

Run: `npx playwright test e2e/admin/entitlements.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/_app/_auth/admin.entitlements.tsx src/routes/_app/_auth/admin.index.tsx e2e/admin/entitlements.spec.ts
git commit -m "feat(admin): module-access entitlements grid page"
```

---

### Task 6: Enforcement flip (revert stopgaps) — DO LAST, AFTER BACKFILL IS RUN

**Files:**
- Modify: `convex/productSubscriptions.ts` (remove catalog fallback added by #4345)
- Modify: `convex/_helpers/products.ts` (restore `verifyProductAccess` throw)
- Test: `tests/convex/enforcementFlip.test.ts`

**Interfaces:** none new — restores prior behavior.

> DO NOT do this task until the Rollout section's backfill has been run and verified on the live deployment `helpful-mule-867`. Flipping before grants exist will re-break production.

- [ ] **Step 1: Write the failing test**

Create `tests/convex/enforcementFlip.test.ts`:

```ts
import { afterEach, describe, expect, test } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe("enforcement after flip", () => {
  test("getActiveProducts returns only granted products (no catalog fallback)", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    // Grant only CRM.
    await t.run(async (ctx) => {
      await ctx.db.insert("productSubscriptions", {
        organizationId, productId: "crm", status: "active",
        cancelAtPeriodEnd: false, source: "manual", grantedByUserId: userId,
        createdAt: Date.now(), updatedAt: Date.now(),
      });
    });
    const products = await t
      .withIdentity(identity)
      .query(api.productSubscriptions.getActiveProducts, { organizationId });
    expect(products).toEqual(["crm"]);
  });

  test("verifyGabinetAccess throws when gabinet not granted", async () => {
    const t = createTestCtx();
    const { organizationId } = await seedTestUser(t);
    await expect(
      t.run(async (ctx) =>
        ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
          organizationId,
        }),
      ),
    ).rejects.toThrow(/No active subscription/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- enforcementFlip`
Expected: FAIL — `getActiveProducts` returns the catalog fallback (`["crm","gabinet"]`) and `verifyGabinetAccess` does not throw (fail-open), because #4345's stopgaps are still in place.

- [ ] **Step 3: Remove the catalog fallback**

In `convex/productSubscriptions.ts`, `getActiveProducts` handler, delete the fallback block so it ends at the mapped active list:

```ts
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const subs = await ctx.db
      .query("productSubscriptions")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    return subs
      .filter((s) => s.status === "active" || s.status === "trialing")
      .map((s) => s.productId);
  },
```

- [ ] **Step 4: Restore verifyProductAccess throw**

In `convex/_helpers/products.ts`, restore the missing-subscription throw:

```ts
  const subscription = await ctx.db
    .query("productSubscriptions")
    .withIndex("by_orgAndProduct", (q) =>
      q.eq("organizationId", organizationId).eq("productId", productId),
    )
    .first();

  if (!subscription) {
    throw new Error(`No active subscription for product: ${productId}`);
  }
  if (subscription.status !== "active" && subscription.status !== "trialing") {
    throw new Error(`Subscription for ${productId} is ${subscription.status}`);
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:unit -- enforcementFlip`
Expected: PASS (2 tests).

- [ ] **Step 6: Full convex test suite + typecheck**

Run: `npm run test:unit` (expect all green) and `npx tsc -p convex/tsconfig.json` (expect 0 errors).

- [ ] **Step 7: Commit**

```bash
git add convex/productSubscriptions.ts convex/_helpers/products.ts tests/convex/enforcementFlip.test.ts
git commit -m "feat(admin): re-enable module enforcement (revert #4345 stopgaps)"
```

---

## Rollout (ordered live steps — enforcement is being turned on)

Perform after Tasks 1–5 are merged and deployed, and before/around Task 6:

1. Merge Tasks 1–5 to `main`; deploy to the live deployment: `npx convex dev --once` (targets `helpful-mule-867`). At this point the stopgaps are still active — no lock-out.
2. Dry-run the backfill against the live deployment and review counts:
   `npx convex run migrations/backfillEntitlements:run '{"dryRun":true}'`
   Confirm `orgs`, `crmGranted`, `gabinetGranted` look right.
3. Run it for real: `npx convex run migrations/backfillEntitlements:run '{"dryRun":false}'`.
4. Verify grants: in the Convex dashboard (or a one-off query) confirm every org has a CRM `productSubscriptions` row and every gabinet-using org has a Gabinet row.
5. Deploy Task 6 (the flip) with `npx convex dev --once`.
6. Verify live in-browser on `www.quera-dev.helloalex.pl`: a granted org shows the module nav and Gabinet loads; use `/admin/entitlements` to revoke Gabinet for a disposable test org and confirm it disappears from that org's nav and its gabinet functions are blocked.
```
