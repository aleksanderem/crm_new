# Platform Admin — SP4 Plans & Products Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Platform-admin panel to view + edit the Convex-only `plans` and `platformProducts` catalogs — plan `name`/`description`/`seatLimit` and product `name`/`description`/`isActive`. No Stripe writes, no price/plan creation (SP5).

**Architecture:** Convex `action`s guarded by `verifyPlatformAdmin`, delegating to internal `query`/`mutation` on `ctx.db` (these tables are Convex-only — NOT Supabase). Frontend mirrors the existing `admin.*` routes.

**Tech Stack:** Convex (actions/internalQuery/internalMutation), React 19 + TanStack Router/Query, shadcn/ui.

## Global Constraints

- Every new backend `action` calls `await ctx.runAction(internal._helpers.authAction.verifyPlatformAdmin, {})` as its FIRST statement; capture `{ userId }`.
- Read/write `plans` and `platformProducts` via Convex `ctx.db` inside `internalQuery`/`internalMutation` (called from the action via `ctx.runQuery`/`ctx.runMutation`). Do NOT use `createSupabaseDb()` for these tables — they are Convex-only.
- Update actions MUST only patch the allowed fields: plans → `name`/`description`/`seatLimit`; products → `name`/`description`/`isActive` (+ `updatedAt` for products). NEVER accept or patch `prices`, `stripeId`/`stripeProductId`, plan `key`, `productKey`, or `productId`.
- `seatLimit` must be validated as a positive integer (`Number.isInteger(n) && n > 0`); reject otherwise.
- Do NOT call `logAudit` (its `audit_log.organization_id` is a NOT NULL FK to organizations; a platform-level change has no org). Emit a `console.info("[admin/plans] <action> ...")` line instead.
- Convex tests: `cd convex && npx vitest run <name>`. Keep `npx tsc -p convex/tsconfig.json` clean.
- Frontend: verify with `npx tsc -p tsconfig.app.json --noEmit` (now works — the crash is fixed) AND `npx vite build`.
- Reuse only existing `src/components/ui/*`. No installs. No schema change, no migration.

---

### Task 1: Backend — plans list + update

**Files:**
- Create: `convex/admin/plans.ts`
- Test: `tests/convex/adminPlans.test.ts` (new)

**Interfaces:**
- Produces: `listPlans()`, `updatePlan({ planId, name?, description?, seatLimit? })`, and internal `_listPlans` / `_updatePlan`.

- [ ] **Step 1: Inspect the real shapes first.** Read `convex/schema/platform.ts` for the `plans` table (`key`, `productKey`, `stripeId`, `name`, `description`, `seatLimit`, `prices`) and the exact `pricesValidator` shape (prices are `{ month: { usd:{stripeId,amount}, eur:{...}, pln:{...} }, year:{...} }` — confirm). Read `convex/admin/organizations.ts` for the action+guard style and `convex/admin/entitlements.ts` for `returns:` validator style.

- [ ] **Step 2: Write failing tests.** Create `tests/convex/adminPlans.test.ts`. Use the harness from `tests/convex/adminOrganizations.test.ts` (`createTestCtx`, `seedTestUser`; make the caller a platform admin by inserting the Supabase `users` row `{ _id: String(userId), name, email, isPlatformAdmin: true }`). Seed a plan directly with `t.run(async (ctx) => ctx.db.insert("plans", {...}))` (a valid plan doc — key:"pro", productKey:"crm", stripeId:"prod_x", name, description, seatLimit:25, prices:{month:{usd:{stripeId:"p",amount:2900},eur:{stripeId:"p",amount:2900},pln:{stripeId:"p",amount:11900}},year:{...}}}). Tests: (a) `listPlans` by a non-admin rejects `/platform admin/i`; (b) admin `listPlans` returns the seeded plan with `seatLimit` 25; (c) `updatePlan({planId, seatLimit:40, name:"X"})` then re-list shows seatLimit 40 + name X and prices UNCHANGED; (d) `updatePlan({planId, seatLimit:0})` rejects `/seat/i` (or a positive-int error); (e) `updatePlan` cannot change prices — there is no arg for it (type-level) — assert seatLimit-only update leaves `prices` intact.

- [ ] **Step 3: Run** — `cd convex && npx vitest run adminPlans`. Expect FAIL (module missing).

- [ ] **Step 4: Implement `convex/admin/plans.ts`.** Internal query + mutation on `ctx.db`, actions guard then delegate:

```ts
import { v } from "convex/values";
import { action, internalQuery, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

export const _listPlans = internalQuery({
  args: {},
  handler: async (ctx) => {
    const plans = await ctx.db.query("plans").collect();
    return plans.map((p) => ({
      _id: String(p._id),
      key: p.key,
      productKey: p.productKey ?? null,
      name: p.name,
      description: p.description,
      seatLimit: p.seatLimit,
      stripeId: p.stripeId,
      prices: p.prices, // read-only display
    }));
  },
});

export const listPlans = action({
  args: {},
  handler: async (ctx) => {
    await ctx.runAction(internal._helpers.authAction.verifyPlatformAdmin, {});
    return await ctx.runQuery(internal.admin.plans._listPlans, {});
  },
});

export const _updatePlan = internalMutation({
  args: {
    planId: v.id("plans"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    seatLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = args.name;
    if (args.description !== undefined) patch.description = args.description;
    if (args.seatLimit !== undefined) patch.seatLimit = args.seatLimit;
    await ctx.db.patch(args.planId, patch);
  },
});

export const updatePlan = action({
  args: {
    planId: v.id("plans"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    seatLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId } = await ctx.runAction(internal._helpers.authAction.verifyPlatformAdmin, {});
    if (args.seatLimit !== undefined && !(Number.isInteger(args.seatLimit) && args.seatLimit > 0)) {
      throw new Error("seatLimit must be a positive integer");
    }
    await ctx.runMutation(internal.admin.plans._updatePlan, {
      planId: args.planId,
      name: args.name,
      description: args.description,
      seatLimit: args.seatLimit,
    });
    console.info(`[admin/plans] plan_updated planId=${args.planId} by=${userId}`);
    return { ok: true };
  },
});
```

Add `returns:` validators on the actions to match the codebase style (mirror entitlements/organizations). The `prices` field in the `_listPlans` return validator can be `v.any()` to avoid re-declaring the nested price shape (it is display-only).

- [ ] **Step 5: Run tests** — expect PASS. `npx tsc -p convex/tsconfig.json` clean.

- [ ] **Step 6: Commit** — `feat(admin): plans list + update actions (SP4 T1)`.

---

### Task 2: Backend — products list + update

**Files:**
- Modify: `convex/admin/plans.ts` (add product functions)
- Test: `tests/convex/adminPlans.test.ts` (extend)

**Interfaces:**
- Produces: `listProducts()`, `updateProduct({ productDocId, name?, description?, isActive? })`, internal `_listProducts` / `_updateProduct`.

- [ ] **Step 1: Write failing tests.** Extend `adminPlans.test.ts`: seed a `platformProducts` doc via `t.run` (`{ productId:"crm", name:"CRM", description:"...", isActive:true, prices:{month:{usd:29,eur:29,pln:119},year:{usd:290,eur:290,pln:1190}}, createdAt:1, updatedAt:1 }`). Tests: (a) non-admin `listProducts` rejects; (b) admin `listProducts` returns the product with `isActive:true`; (c) `updateProduct({productDocId, isActive:false, name:"CRM+"})` then re-list shows isActive false + name CRM+ and prices unchanged; (d) `updateProduct` does not accept a `prices` arg (type-level) — a name/isActive update leaves `prices` intact.

- [ ] **Step 2: Run** — `cd convex && npx vitest run adminPlans`. Expect FAIL for new cases.

- [ ] **Step 3: Implement** the product functions in `convex/admin/plans.ts`, mirroring the plan ones:

```ts
export const _listProducts = internalQuery({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("platformProducts").collect();
    return products.map((p) => ({
      _id: String(p._id),
      productId: p.productId,
      name: p.name,
      description: p.description,
      isActive: p.isActive,
      prices: p.prices,
    }));
  },
});

export const listProducts = action({
  args: {},
  handler: async (ctx) => {
    await ctx.runAction(internal._helpers.authAction.verifyPlatformAdmin, {});
    return await ctx.runQuery(internal.admin.plans._listProducts, {});
  },
});

export const _updateProduct = internalMutation({
  args: {
    productDocId: v.id("platformProducts"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = args.name;
    if (args.description !== undefined) patch.description = args.description;
    if (args.isActive !== undefined) patch.isActive = args.isActive;
    await ctx.db.patch(args.productDocId, patch);
  },
});

export const updateProduct = action({
  args: {
    productDocId: v.id("platformProducts"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId } = await ctx.runAction(internal._helpers.authAction.verifyPlatformAdmin, {});
    await ctx.runMutation(internal.admin.plans._updateProduct, {
      productDocId: args.productDocId,
      name: args.name,
      description: args.description,
      isActive: args.isActive,
    });
    console.info(`[admin/plans] product_updated productDocId=${args.productDocId} by=${userId}`);
    return { ok: true };
  },
});
```

- [ ] **Step 4: Run tests** — expect PASS. tsc convex clean.

- [ ] **Step 5: Commit** — `feat(admin): products list + update actions (SP4 T2)`.

---

### Task 3: Frontend — Plans & Products admin route

**Files:**
- Create: `src/routes/_app/_auth/admin.plans.tsx`
- Modify: `src/routes/_app/_auth/admin.index.tsx` (add "Plany i produkty" tile → `/admin/plans`)

**Interfaces:**
- Consumes: `api.admin.plans.listPlans` / `updatePlan` / `listProducts` / `updateProduct`, `api.app.getIsPlatformAdmin`.

- [ ] **Step 1: Create the route** at `createFileRoute("/_app/_auth/admin/plans")`, copying the admin gate + 403 card + loading from `src/routes/_app/_auth/admin.organizations.tsx`. Two `Card` sections:
  - **Plany**: `useAction(api.admin.plans.listPlans)` + `useQuery` (queryKey `["admin","plans"]`, enabled on admin). `Table`: Produkt (`productKey`), Plan (`key` Badge), Nazwa, Miejsca (`seatLimit`), Cena/mies (read-only: `prices?.month?.pln?.amount` formatted as PLN with `/100`, else "—"), "Edytuj". Edit `Dialog` with `Input` name, `Textarea` description, number `Input` seatLimit → `useMutation` on `updatePlan` + `queryClient.invalidateQueries(["admin","plans"])` + `toast`. Show `key`/`productKey`/price read-only in the dialog.
  - **Produkty**: `useAction(api.admin.plans.listProducts)` + `useQuery` (`["admin","products"]`). `Table`: Produkt (`productId`), Nazwa, Opis, Aktywny (`Switch` bound to `isActive`, toggling calls `updateProduct({productDocId, isActive})` directly + invalidate + toast), Cena/mies (read-only `prices?.month?.pln`). "Edytuj" dialog for name/description.

- [ ] **Step 2: Add the hub tile** in `admin.index.tsx` — a card/link "Plany i produkty" → `/admin/plans`, same grid pattern as the existing tiles.

- [ ] **Step 3: Regenerate the TanStack route tree** (`npx vite build` regenerates `src/routeTree.gen.ts` and confirms the bundle builds). Then `npx tsc -p tsconfig.app.json --noEmit` MUST be clean (the compiler crash is fixed as of the tsc-crash PR, so a real typecheck runs).

- [ ] **Step 4: Commit** — `feat(admin): Plans & Products admin route + hub tile (SP4 T3)`.

---

## Rollout

No migration, no schema change. Convex deploy to `helpful-mule-867` is manual (needs TTY) — request it after merge so the new actions go live. Verify: `/admin/plans` lists plans + products; editing a plan's seatLimit changes it (and thus seat enforcement); toggling a product's `isActive` persists.
