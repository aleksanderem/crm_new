# Configurable Payment Methods (Gabinet) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded payment methods (≈9 UI selectors + backend validators) with one org-scoped, admin-managed source of truth that preserves every current behaviour.

**Architecture:** New org-scoped table `gabinetPaymentMethods` (Convex schema → Supabase `gabinet_payment_methods`), mirroring the `gabinetLeaveTypes` stack (schema → migration → TABLE_MAP → mapper → hook → Convex action CRUD → settings page). Payment rows keep storing the method as a stable string **key**; the `payments.payment_method` column is relaxed from a Postgres enum to TEXT. Method-specific behaviour (amount-lock, package-coverage, refund exclusion) becomes data flags read from the single source instead of hardcoded keys.

**Tech Stack:** React 19, TanStack Router/Query, shadcn/ui, Convex actions (Supabase-primary via `createSupabaseDb`), self-hosted Supabase (Postgres), i18next (PL/EN), Vitest + convex-test.

## Global Constraints

- Convex unit tests run via `npm run test:unit` (cwd `convex/`); never bare `vitest`.
- Convex data writes go through `createSupabaseDb()` (service-role); browser reads go through `use-supabase-*` hooks (RLS via `current_org_id()`).
- New Supabase migration number is **00024**. New tables read by the browser need `current_org_id()` RLS policies (mirror `gabinet_leave_types`).
- After any migration, apply it to the DB and run `node scripts/gen-db-types.mjs` to regenerate `src/lib/supabase/database.types.ts` + `database.columns.ts`.
- `database.types.ts` is generated — never hand-edit.
- Permission gate for settings CRUD: owner/admin role check (mirror `convex/gabinet/leaveTypes.ts`).
- Method **keys**: system keys are fixed (`cash`, `card`, `transfer`, `package`, `gratis`, `barter`, `other`); custom keys are slugified and unique per org.
- Seed reproduces today 1:1 (see seed table in the spec).
- TanStack file-route convention: `_layout.gabinet.settings.*.tsx`.

Spec: `docs/superpowers/specs/2026-06-25-gabinet-configurable-payment-methods-design.md`.

---

## File Structure

Create:
- `supabase/migrations/00024_gabinet_payment_methods.sql`
- `convex/gabinet/paymentMethods.ts` — CRUD + seed action
- `src/lib/supabase/mappers/gabinet/payment-methods.ts`
- `src/hooks/use-supabase-gabinet-payment-methods.ts`
- `src/components/gabinet/payment-method-select.tsx` — shared selector + behaviour helpers
- `src/routes/_app/_auth/dashboard/_layout.gabinet.settings.payment-methods.tsx`
- `tests/convex/gabinet/paymentMethods.test.ts`

Modify:
- `convex/schema/gabinet.ts` — add `gabinetPaymentMethods` table
- `convex/_helpers/supabaseRows.ts` — add `GabinetPaymentMethodRow`
- `convex/_helpers/supabaseDb.ts` — TABLE_MAP entry
- `src/lib/supabase/query-keys.ts` — `gabinetPaymentMethods` key
- `convex/payments.ts` — relax `paymentMethodValidator`, add validation
- `convex/schema/crm.ts` — relax `payments.paymentMethod` union
- 9 selector sites (Tasks 9–11)
- `public/locales/{pl,en}/translation.json` — settings-page labels

---

## PHASE 1 — DATA LAYER

### Task 1: Convex schema table + row type

**Files:**
- Modify: `convex/schema/gabinet.ts` (add table near `gabinetLeaveTypes`, ~line 328)
- Modify: `convex/_helpers/supabaseRows.ts:18` (add row type)

**Interfaces:**
- Produces: Convex table `gabinetPaymentMethods`; type `GabinetPaymentMethodRow`.

- [ ] **Step 1: Add the table to `convex/schema/gabinet.ts`** (inside the gabinet tables object, alongside `gabinetLeaveTypes`):

```ts
gabinetPaymentMethods: defineTable({
  organizationId: v.id("organizations"),
  key: v.string(),
  name: v.string(),
  isSystem: v.boolean(),
  isActive: v.boolean(),
  order: v.number(),
  availableForSettlement: v.boolean(),
  availableForSales: v.boolean(),
  availableForRefund: v.boolean(),
  locksAmountToTreatmentPrice: v.boolean(),
  isPackageCoverage: v.boolean(),
  createdBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_org", ["organizationId"])
  .index("by_orgAndActive", ["organizationId", "isActive"])
  .index("by_orgAndKey", ["organizationId", "key"]),
```

- [ ] **Step 2: Add the row type to `convex/_helpers/supabaseRows.ts`** (near line 18):

```ts
export type GabinetPaymentMethodRow = SupabaseRow<"gabinetPaymentMethods">;
```

- [ ] **Step 3: Typecheck convex**

Run: `npx tsc -p convex/tsconfig.json --noEmit --pretty false`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add convex/schema/gabinet.ts convex/_helpers/supabaseRows.ts
git commit -m "feat(payments): add gabinetPaymentMethods convex schema table"
```

---

### Task 2: Supabase migration 00024 + TABLE_MAP + regenerate types

**Files:**
- Create: `supabase/migrations/00024_gabinet_payment_methods.sql`
- Modify: `convex/_helpers/supabaseDb.ts:64` (TABLE_MAP)
- Modify (generated): `src/lib/supabase/database.types.ts`, `database.columns.ts`

**Interfaces:**
- Produces: Supabase table `gabinet_payment_methods`; `payments.payment_method` is now TEXT; TABLE_MAP entry `gabinetPaymentMethods → gabinet_payment_methods`.

- [ ] **Step 1: Write the migration** `supabase/migrations/00024_gabinet_payment_methods.sql`:

```sql
-- Configurable payment methods (Gabinet). Org-scoped definition table that
-- replaces the hardcoded payment_method lists across the UI and the
-- payment_method_enum constraint. System methods are seeded lazily on first
-- read (convex/gabinet/paymentMethods.list).

CREATE TABLE IF NOT EXISTS gabinet_payment_methods (
  id                              TEXT PRIMARY KEY,
  organization_id                 TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key                             TEXT NOT NULL,
  name                            TEXT NOT NULL,
  is_system                       BOOLEAN NOT NULL,
  is_active                       BOOLEAN NOT NULL,
  "order"                         INTEGER NOT NULL,
  available_for_settlement        BOOLEAN NOT NULL,
  available_for_sales             BOOLEAN NOT NULL,
  available_for_refund            BOOLEAN NOT NULL,
  locks_amount_to_treatment_price BOOLEAN NOT NULL,
  is_package_coverage             BOOLEAN NOT NULL,
  created_by                      TEXT NOT NULL REFERENCES users(id),
  created_at                      BIGINT NOT NULL,
  updated_at                      BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS gabinet_payment_methods_org_idx
  ON gabinet_payment_methods (organization_id);
CREATE INDEX IF NOT EXISTS gabinet_payment_methods_org_active_idx
  ON gabinet_payment_methods (organization_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS gabinet_payment_methods_org_key_idx
  ON gabinet_payment_methods (organization_id, key);

ALTER TABLE gabinet_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY gabinet_payment_methods_select ON gabinet_payment_methods
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gabinet_payment_methods_insert ON gabinet_payment_methods
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_payment_methods_update ON gabinet_payment_methods
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_payment_methods_delete ON gabinet_payment_methods
  FOR DELETE USING (current_org_id() = organization_id);

-- Relax the payments.payment_method enum so custom method keys are allowed.
-- Existing values (cash/card/transfer/package/gratis/barter/other) stay valid.
-- The now-unused payment_method_enum type is intentionally left in place.
ALTER TABLE payments ALTER COLUMN payment_method TYPE TEXT;
```

- [ ] **Step 2: Add TABLE_MAP entry** in `convex/_helpers/supabaseDb.ts` (alongside line 64 `gabinetLeaveTypes: "gabinet_leave_types",`):

```ts
gabinetPaymentMethods: "gabinet_payment_methods",
```

- [ ] **Step 3: Apply the migration to the DB**

Apply `00024` via the project's migration path (POST `${SUPABASE_URL}/pg/query` with the service-role JWT, or the Supabase SQL editor). Then record it:

```sql
INSERT INTO supabase_migrations.schema_migrations (version, name, applied_at)
VALUES ('00024','gabinet_payment_methods', now()) ON CONFLICT (version) DO NOTHING;
```

Verify: `SELECT public.app_schema_version();` → `00024`.

- [ ] **Step 4: Regenerate Supabase types**

Run: `node scripts/gen-db-types.mjs`
Expected: "Migrations: 24", a `GabinetPaymentMethodRow`-compatible entry exists, no error.

- [ ] **Step 5: Typecheck**

Run: `npx tsc -p convex/tsconfig.json --noEmit --pretty false` then `npx tsc -p tsconfig.app.json --noEmit --pretty false`
Expected: 0 errors both.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/00024_gabinet_payment_methods.sql convex/_helpers/supabaseDb.ts src/lib/supabase/database.types.ts src/lib/supabase/database.columns.ts
git commit -m "feat(payments): supabase migration + table map for gabinet_payment_methods"
```

---

### Task 3: Mapper + query key + read hook

**Files:**
- Create: `src/lib/supabase/mappers/gabinet/payment-methods.ts`
- Modify: `src/lib/supabase/query-keys.ts` (near line 81)
- Create: `src/hooks/use-supabase-gabinet-payment-methods.ts`

**Interfaces:**
- Produces: `MappedGabinetPaymentMethod`, `mapGabinetPaymentMethodFromSupabase`, `useSupabaseGabinetPaymentMethodsList(orgId, { activeOnly })`.

- [ ] **Step 1: Mapper** `src/lib/supabase/mappers/gabinet/payment-methods.ts`:

```ts
import type { GabinetPaymentMethodRow } from "../../database.types";
import { createEntityMapper } from "../generic";

export interface MappedGabinetPaymentMethod {
  _id: string;
  _creationTime: number;
  organizationId: string;
  key: string;
  name: string;
  isSystem: boolean;
  isActive: boolean;
  order: number;
  availableForSettlement: boolean;
  availableForSales: boolean;
  availableForRefund: boolean;
  locksAmountToTreatmentPrice: boolean;
  isPackageCoverage: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

const mapper = createEntityMapper<
  GabinetPaymentMethodRow,
  MappedGabinetPaymentMethod
>({});

export const mapGabinetPaymentMethodFromSupabase = (
  row: GabinetPaymentMethodRow,
): MappedGabinetPaymentMethod => {
  const mapped = mapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
};
export const mapGabinetPaymentMethodToSupabase = mapper.mapToSupabase;
```

- [ ] **Step 2: Query key** — add to `src/lib/supabase/query-keys.ts` near line 81:

```ts
gabinetPaymentMethods: entityKeys("gabinetPaymentMethods"),
```

- [ ] **Step 3: Hook** `src/hooks/use-supabase-gabinet-payment-methods.ts` (mirror `use-supabase-gabinet-leave-types.ts`, ordered by `order`):

```ts
import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  mapGabinetPaymentMethodFromSupabase,
  type MappedGabinetPaymentMethod,
} from "@/lib/supabase/mappers/gabinet/payment-methods";

interface Options {
  enabled?: boolean;
  activeOnly?: boolean;
}

export function useSupabaseGabinetPaymentMethodsList(
  organizationId: string,
  options: Options = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, activeOnly } = options;

  return useQuery<MappedGabinetPaymentMethod[], Error>({
    queryKey: [
      ...supabaseKeys.gabinetPaymentMethods.list(organizationId),
      activeOnly ?? "all",
    ],
    queryFn: async (): Promise<MappedGabinetPaymentMethod[]> => {
      if (!client) throw new Error("Supabase client not ready");
      let query = client
        .from("gabinet_payment_methods")
        .select("*")
        .eq("organization_id", organizationId);
      if (activeOnly !== undefined) query = query.eq("is_active", activeOnly);
      const { data, error } = await query.order("order", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapGabinetPaymentMethodFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<MappedGabinetPaymentMethod[], Error>);
}
```

- [ ] **Step 4: Typecheck app**

Run: `npx tsc -p tsconfig.app.json --noEmit --pretty false`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/mappers/gabinet/payment-methods.ts src/lib/supabase/query-keys.ts src/hooks/use-supabase-gabinet-payment-methods.ts
git commit -m "feat(payments): supabase mapper, query key, and read hook for payment methods"
```

---

## PHASE 2 — BACKEND

### Task 4: Convex CRUD + lazy seed action

**Files:**
- Create: `convex/gabinet/paymentMethods.ts`
- Create: `tests/convex/gabinet/paymentMethods.test.ts`

**Interfaces:**
- Consumes: `createSupabaseDb()`, `internal._helpers.authAction.verifyOrgAccess`, `GabinetPaymentMethodRow`.
- Produces actions: `list({organizationId, activeOnly?, context?})` (lazy-seeds system methods when the org has none), `create`, `update`, `remove`, `reorder`, `seed`. Plus exported const `SYSTEM_PAYMENT_METHODS`.

The seed list (order matches the spec table):

```ts
export const SYSTEM_PAYMENT_METHODS = [
  { key: "cash",     name: "Gotówka",     settle: true,  sales: true,  refund: true,  lock: false, pkg: false },
  { key: "card",     name: "Karta",       settle: true,  sales: true,  refund: true,  lock: false, pkg: false },
  { key: "transfer", name: "Przelew",     settle: true,  sales: true,  refund: true,  lock: false, pkg: false },
  { key: "package",  name: "Seria/Karnet",settle: true,  sales: false, refund: false, lock: false, pkg: true  },
  { key: "gratis",   name: "Gratis",      settle: true,  sales: false, refund: false, lock: true,  pkg: false },
  { key: "barter",   name: "Barter",      settle: true,  sales: false, refund: false, lock: true,  pkg: false },
  { key: "other",    name: "Inna",        settle: true,  sales: true,  refund: true,  lock: false, pkg: false },
] as const;
```

- [ ] **Step 1: Write the failing tests** `tests/convex/gabinet/paymentMethods.test.ts` (mirror existing `tests/convex/**` setup; `_setup.ts` installs the in-memory Supabase stub). Cover: lazy seed creates 7 system methods on first `list`; second `list` does not duplicate; `create` adds a custom method with default flags + slug key; `remove` rejects a system method; `update` rejects behaviour/context edits on a system row but allows name; `reorder` updates order.

```ts
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../../convex/schema";
import { api } from "../../../convex/_generated/api";
import { setupOrgAndUser } from "../helpers"; // existing helper used by other gabinet tests

describe("gabinet/paymentMethods", () => {
  it("lazy-seeds 7 system methods on first list and is idempotent", async () => {
    const t = convexTest(schema);
    const { organizationId, asUser } = await setupOrgAndUser(t);
    const first = await asUser.action(api.gabinet.paymentMethods.list, { organizationId });
    expect(first).toHaveLength(7);
    expect(first.filter((m) => m.isSystem)).toHaveLength(7);
    const second = await asUser.action(api.gabinet.paymentMethods.list, { organizationId });
    expect(second).toHaveLength(7);
  });

  it("creates a custom method with a slug key and default flags", async () => {
    const t = convexTest(schema);
    const { organizationId, asUser } = await setupOrgAndUser(t);
    await asUser.action(api.gabinet.paymentMethods.list, { organizationId });
    const id = await asUser.action(api.gabinet.paymentMethods.create, {
      organizationId, name: "Voucher", availableForRefund: false,
    });
    const all = await asUser.action(api.gabinet.paymentMethods.list, { organizationId });
    const created = all.find((m) => m._id === id);
    expect(created?.key).toBe("voucher");
    expect(created?.isSystem).toBe(false);
    expect(created?.availableForSettlement).toBe(true);
    expect(created?.availableForSales).toBe(true);
    expect(created?.locksAmountToTreatmentPrice).toBe(false);
  });

  it("rejects deleting a system method", async () => {
    const t = convexTest(schema);
    const { organizationId, asUser } = await setupOrgAndUser(t);
    const seeded = await asUser.action(api.gabinet.paymentMethods.list, { organizationId });
    const cash = seeded.find((m) => m.key === "cash")!;
    await expect(
      asUser.action(api.gabinet.paymentMethods.remove, { organizationId, paymentMethodId: cash._id }),
    ).rejects.toThrow();
  });
});
```

> If `setupOrgAndUser`/`../helpers` does not exist, mirror the auth/org bootstrap used by a sibling test in `tests/convex/gabinet/` (e.g. `leaveTypes`/`appointments` tests) — do not invent a new harness.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit -- gabinet/paymentMethods`
Expected: FAIL ("api.gabinet.paymentMethods.list is not a function" / module missing).

- [ ] **Step 3: Implement** `convex/gabinet/paymentMethods.ts`:

```ts
import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { logError } from "../_helpers/logged";
import type { GabinetPaymentMethodRow } from "../_helpers/supabaseRows";

export const SYSTEM_PAYMENT_METHODS = [
  { key: "cash",     name: "Gotówka",      settle: true,  sales: true,  refund: true,  lock: false, pkg: false },
  { key: "card",     name: "Karta",        settle: true,  sales: true,  refund: true,  lock: false, pkg: false },
  { key: "transfer", name: "Przelew",      settle: true,  sales: true,  refund: true,  lock: false, pkg: false },
  { key: "package",  name: "Seria/Karnet", settle: true,  sales: false, refund: false, lock: false, pkg: true  },
  { key: "gratis",   name: "Gratis",       settle: true,  sales: false, refund: false, lock: true,  pkg: false },
  { key: "barter",   name: "Barter",       settle: true,  sales: false, refund: false, lock: true,  pkg: false },
  { key: "other",    name: "Inna",         settle: true,  sales: true,  refund: true,  lock: false, pkg: false },
] as const;

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "method";
}

async function seedIfEmpty(
  db: ReturnType<typeof createSupabaseDb>,
  organizationId: string,
  userId: string,
): Promise<void> {
  const existing = await db.query("gabinetPaymentMethods")
    .eq("organizationId", organizationId).first();
  if (existing) return;
  const now = Date.now();
  for (let i = 0; i < SYSTEM_PAYMENT_METHODS.length; i++) {
    const m = SYSTEM_PAYMENT_METHODS[i];
    await db.insert("gabinetPaymentMethods", {
      organizationId, key: m.key, name: m.name,
      isSystem: true, isActive: true, order: i,
      availableForSettlement: m.settle, availableForSales: m.sales, availableForRefund: m.refund,
      locksAmountToTreatmentPrice: m.lock, isPackageCoverage: m.pkg,
      createdBy: userId, createdAt: now, updatedAt: now,
    });
  }
}

export const list = action({
  args: {
    organizationId: v.id("organizations"),
    activeOnly: v.optional(v.boolean()),
    context: v.optional(
      v.union(v.literal("settlement"), v.literal("sales"), v.literal("refund")),
    ),
  },
  handler: async (ctx, args): Promise<GabinetPaymentMethodRow[]> => {
    const auth = await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const db = createSupabaseDb();
    await seedIfEmpty(db, String(args.organizationId), auth.userId);
    let q = db.query("gabinetPaymentMethods").eq("organizationId", String(args.organizationId));
    if (args.activeOnly) q = q.eq("isActive", true);
    let rows = (await q.collect()) as GabinetPaymentMethodRow[];
    if (args.context === "settlement") rows = rows.filter((r) => r.availableForSettlement);
    else if (args.context === "sales") rows = rows.filter((r) => r.availableForSales);
    else if (args.context === "refund") rows = rows.filter((r) => r.availableForRefund);
    return rows.sort((a, b) => (a.order as number) - (b.order as number));
  },
});

async function requireAdmin(ctx: Parameters<typeof action>[0] extends never ? never : any, organizationId: string) {
  const auth = await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, { organizationId });
  if (auth.role !== "owner" && auth.role !== "admin") throw new Error("Admin access required");
  return auth;
}

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    availableForSettlement: v.optional(v.boolean()),
    availableForSales: v.optional(v.boolean()),
    availableForRefund: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    try {
      const auth = await requireAdmin(ctx, String(args.organizationId));
      const db = createSupabaseDb();
      await seedIfEmpty(db, String(args.organizationId), auth.userId);
      const all = (await db.query("gabinetPaymentMethods")
        .eq("organizationId", String(args.organizationId)).collect()) as GabinetPaymentMethodRow[];
      // unique key per org
      const base = slugify(args.name);
      let key = base, n = 2;
      while (all.some((m) => m.key === key)) key = `${base}-${n++}`;
      const maxOrder = all.reduce((mx, m) => Math.max(mx, m.order as number), -1);
      const now = Date.now();
      return await db.insert("gabinetPaymentMethods", {
        organizationId: String(args.organizationId), key, name: args.name,
        isSystem: false, isActive: true, order: maxOrder + 1,
        availableForSettlement: args.availableForSettlement ?? true,
        availableForSales: args.availableForSales ?? true,
        availableForRefund: args.availableForRefund ?? false,
        locksAmountToTreatmentPrice: false, isPackageCoverage: false,
        createdBy: auth.userId, createdAt: now, updatedAt: now,
      });
    } catch (err) {
      await logError(ctx, err, { scope: "gabinet.paymentMethods", fnName: "create", argsJson: JSON.stringify(args), organizationId: args.organizationId });
      throw err;
    }
  },
});

export const update = action({
  args: {
    organizationId: v.id("organizations"),
    paymentMethodId: v.string(),
    name: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    order: v.optional(v.number()),
    availableForSettlement: v.optional(v.boolean()),
    availableForSales: v.optional(v.boolean()),
    availableForRefund: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    try {
      await requireAdmin(ctx, String(args.organizationId));
      const db = createSupabaseDb();
      const row = (await db.get("gabinetPaymentMethods", args.paymentMethodId)) as GabinetPaymentMethodRow | null;
      if (!row || String(row.organizationId) !== String(args.organizationId)) throw new Error("Payment method not found");
      const patch: Record<string, unknown> = { updatedAt: Date.now() };
      if (args.name !== undefined) patch.name = args.name;
      if (args.isActive !== undefined) patch.isActive = args.isActive;
      if (args.order !== undefined) patch.order = args.order;
      // Context flags editable only for custom methods (system flags are locked).
      if (!row.isSystem) {
        if (args.availableForSettlement !== undefined) patch.availableForSettlement = args.availableForSettlement;
        if (args.availableForSales !== undefined) patch.availableForSales = args.availableForSales;
        if (args.availableForRefund !== undefined) patch.availableForRefund = args.availableForRefund;
      }
      await db.patch("gabinetPaymentMethods", args.paymentMethodId, patch);
      return args.paymentMethodId;
    } catch (err) {
      await logError(ctx, err, { scope: "gabinet.paymentMethods", fnName: "update", argsJson: JSON.stringify(args), organizationId: args.organizationId });
      throw err;
    }
  },
});

export const remove = action({
  args: { organizationId: v.id("organizations"), paymentMethodId: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, String(args.organizationId));
    const db = createSupabaseDb();
    const row = (await db.get("gabinetPaymentMethods", args.paymentMethodId)) as GabinetPaymentMethodRow | null;
    if (!row || String(row.organizationId) !== String(args.organizationId)) throw new Error("Payment method not found");
    if (row.isSystem) throw new Error("System payment methods cannot be deleted");
    await db.delete("gabinetPaymentMethods", args.paymentMethodId);
  },
});

export const reorder = action({
  args: {
    organizationId: v.id("organizations"),
    orderedIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, String(args.organizationId));
    const db = createSupabaseDb();
    const now = Date.now();
    for (let i = 0; i < args.orderedIds.length; i++) {
      const row = (await db.get("gabinetPaymentMethods", args.orderedIds[i])) as GabinetPaymentMethodRow | null;
      if (!row || String(row.organizationId) !== String(args.organizationId)) continue;
      await db.patch("gabinetPaymentMethods", args.orderedIds[i], { order: i, updatedAt: now });
    }
  },
});

export const seed = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const auth = await requireAdmin(ctx, String(args.organizationId));
    const db = createSupabaseDb();
    await seedIfEmpty(db, String(args.organizationId), auth.userId);
  },
});
```

> Verify `createSupabaseDb()` exposes `delete(table, id)`. If hard delete is named differently or unavailable, fall back to soft-delete (`patch` `isActive:false`) for `remove` — but keep the `isSystem` guard. Check `convex/_helpers/supabaseDb.ts` before implementing.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- gabinet/paymentMethods`
Expected: PASS (all cases).

- [ ] **Step 5: Typecheck convex**

Run: `npx tsc -p convex/tsconfig.json --noEmit --pretty false`
Expected: 0 errors. (Fix the `requireAdmin` helper typing if needed — inline the admin check per action like `leaveTypes.ts` if the helper is awkward.)

- [ ] **Step 6: Commit**

```bash
git add convex/gabinet/paymentMethods.ts tests/convex/gabinet/paymentMethods.test.ts
git commit -m "feat(payments): convex CRUD + lazy seed for gabinet payment methods"
```

---

### Task 5: Relax validators + add method validation

**Files:**
- Modify: `convex/payments.ts:18-26` (validator) + payment-write handlers
- Modify: `convex/schema/crm.ts:463-471` (payments table union)

**Interfaces:**
- Consumes: `createSupabaseDb()`.
- Produces: `paymentMethodValidator = v.string()`; a helper `assertMethodUsable(db, organizationId, key, { refund })`.

- [ ] **Step 1: Relax `paymentMethodValidator`** in `convex/payments.ts` (replace the union with):

```ts
const paymentMethodValidator = v.string();
```

- [ ] **Step 2: Relax the schema union** in `convex/schema/crm.ts:463-471` (replace the `paymentMethod: v.union(...)` with):

```ts
paymentMethod: v.string(),
```

- [ ] **Step 3: Add validation helper** near the top of `convex/payments.ts` (after the validator):

```ts
async function assertMethodUsable(
  db: ReturnType<typeof createSupabaseDb>,
  organizationId: string,
  key: string,
  opts: { refund?: boolean } = {},
): Promise<void> {
  const row = await db.query("gabinetPaymentMethods")
    .eq("organizationId", organizationId).eq("key", key).first();
  if (!row || !row.isActive) throw new Error(`Unknown or inactive payment method: ${key}`);
  if (opts.refund && !row.availableForRefund) {
    throw new Error(`Payment method not allowed for refunds: ${key}`);
  }
}
```

- [ ] **Step 4: Call the helper in the payment-write handlers.** In `convex/payments.ts`, in each handler that accepts `paymentMethod` and writes a payment (the create/record/markPaid/splitMarkPaid paths), after `verifyOrgAccess` and obtaining `const db = createSupabaseDb()`, add:

```ts
await assertMethodUsable(db, String(args.organizationId), args.paymentMethod);
```

In the refund handlers (`refund`, `refundCredit`), pass the refund flag:

```ts
await assertMethodUsable(db, String(args.organizationId), args.paymentMethod, { refund: true });
```

> Find each call site by searching `paymentMethod:` and `paymentMethod ` usages in `convex/payments.ts` (lines ~121, 187, 271/287, 309, 388, 442, 492-494, 1122 per the map). Only add the assert in handlers that CREATE/record a payment with a method; skip pure read/summary handlers. For split payments, assert both `firstMethod` and `secondMethod`.

- [ ] **Step 5: Run payments tests + typecheck**

Run: `npm run test:unit -- payments` then `npx tsc -p convex/tsconfig.json --noEmit --pretty false`
Expected: existing payment tests pass (they seed methods via the in-memory stub on first list; if a test records a payment without seeding methods first, update that test to call `gabinet.paymentMethods.list`/`seed` in setup), 0 type errors.

- [ ] **Step 6: Commit**

```bash
git add convex/payments.ts convex/schema/crm.ts
git commit -m "feat(payments): validate payment method against gabinet payment methods table"
```

---

## PHASE 3 — ADMIN UI

### Task 6: Settings "Payment methods" page

**Files:**
- Create: `src/routes/_app/_auth/dashboard/_layout.gabinet.settings.payment-methods.tsx`
- Modify: `public/locales/pl/translation.json`, `public/locales/en/translation.json` (add `gabinet.settings.paymentMethods.*` labels)

**Interfaces:**
- Consumes: `useSupabaseGabinetPaymentMethodsList`, `useOrganization`, `useAction(api.gabinet.paymentMethods.*)`, `<PermissionGate feature="gabinet_settings" ...>`.

- [ ] **Step 1: Build the page** mirroring `src/routes/_app/_auth/dashboard/_layout.gabinet.settings.leave-types.tsx`. Requirements:
  - Route id `'/_app/_auth/dashboard/_layout/gabinet/settings/payment-methods'` (follow how `leave-types.tsx` declares `createFileRoute`).
  - Wrap content in `<PermissionGate feature="gabinet_settings" action="view">`.
  - List methods ordered by `order` (use `useSupabaseGabinetPaymentMethodsList(organizationId)` — no `activeOnly`). Each row shows: name, a "Systemowa" badge when `isSystem`, context badges (Rozliczenie / Sprzedaż / Zwrot) from the three flags, an active toggle (calls `update`), and edit/delete actions.
  - Delete shown only for `!isSystem` (calls `remove`); confirm dialog.
  - Create dialog: name + three context checkboxes (default settle+sales on, refund off) → `create`.
  - Edit dialog: name + active + order; for `!isSystem` also the three context checkboxes; for `isSystem` the context checkboxes are rendered disabled (read-only). Behaviour flags (lock/package) are never editable — optionally show them as read-only info on system rows.
  - Invalidate `supabaseKeys.gabinetPaymentMethods.list(organizationId)` after each mutation (mirror how leave-types invalidates its query).
  - Use `useAction` from `convex/react` for create/update/remove (these are Convex actions, like leave-types).

> Keep the file focused (single responsibility: manage payment methods). Reuse the dialog/card/badge primitives already imported by `leave-types.tsx`.

- [ ] **Step 2: Add i18n keys** under `gabinet.settings` in both `pl` and `en` translation files, e.g. `paymentMethods.title`, `.add`, `.name`, `.system`, `.contextSettlement`, `.contextSales`, `.contextRefund`, `.active`, `.deleteConfirm`. (PL values in Polish, EN in English.)

- [ ] **Step 3: Typecheck app + route tree**

Run: `npx tsc -p tsconfig.app.json --noEmit --pretty false`
Expected: 0 errors (TanStack route generation picks up the new file via the dev/build route generator; if the project commits `routeTree.gen.ts`, regenerate it the way the repo does — check how other settings routes were added).

- [ ] **Step 4: Commit**

```bash
git add src/routes/_app/_auth/dashboard/_layout.gabinet.settings.payment-methods.tsx public/locales/pl/translation.json public/locales/en/translation.json
git commit -m "feat(payments): gabinet settings page to manage payment methods"
```

---

### Task 7: Link the settings page in navigation

**Files:**
- Modify: the gabinet settings nav/list (find where `leave-types` is linked — search `settings/leave-types` or `settings.leave-types` in `src/components/**` and `convex/gabinet/_registry.ts`).

- [ ] **Step 1: Add a nav entry** for `/dashboard/gabinet/settings/payment-methods` next to the leave-types entry, using a wallet/credit-card icon and a `gabinet.settings.paymentMethods.title` label. Mirror the existing entry exactly.

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit --pretty false`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(payments): add Payment methods to gabinet settings nav"
```

---

## PHASE 4 — FRONTEND CONSUMPTION

### Task 8: Shared selector + behaviour helpers

**Files:**
- Create: `src/components/gabinet/payment-method-select.tsx`

**Interfaces:**
- Consumes: `useSupabaseGabinetPaymentMethodsList`, `MappedGabinetPaymentMethod`.
- Produces:
  - `usePaymentMethods(organizationId, context)` → `MappedGabinetPaymentMethod[]` (active, context-filtered, ordered).
  - `<PaymentMethodSelect organizationId context value onChange disabled? />` (shadcn `Select`; options from the hook; label = `name`; value = `key`).
  - `findMethod(methods, key)` helper.

- [ ] **Step 1: Implement** `src/components/gabinet/payment-method-select.tsx`:

```tsx
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useSupabaseGabinetPaymentMethodsList,
} from "@/hooks/use-supabase-gabinet-payment-methods";
import type { MappedGabinetPaymentMethod } from "@/lib/supabase/mappers/gabinet/payment-methods";

export type PaymentMethodContext = "settlement" | "sales" | "refund";

export function usePaymentMethods(
  organizationId: string,
  context: PaymentMethodContext,
): MappedGabinetPaymentMethod[] {
  const { data = [] } = useSupabaseGabinetPaymentMethodsList(organizationId, {
    activeOnly: true,
  });
  return data.filter((m) =>
    context === "settlement" ? m.availableForSettlement
    : context === "sales" ? m.availableForSales
    : m.availableForRefund,
  );
}

export function findMethod(
  methods: MappedGabinetPaymentMethod[],
  key: string,
): MappedGabinetPaymentMethod | undefined {
  return methods.find((m) => m.key === key);
}

export function PaymentMethodSelect({
  organizationId, context, value, onChange, disabled,
}: {
  organizationId: string;
  context: PaymentMethodContext;
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
}) {
  const methods = usePaymentMethods(organizationId, context);
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        {methods.map((m) => (
          <SelectItem key={m.key} value={m.key}>{m.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit --pretty false`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/gabinet/payment-method-select.tsx
git commit -m "feat(payments): shared PaymentMethodSelect + usePaymentMethods helper"
```

---

### Task 9: Migrate the three SETTLEMENT selectors + behaviour flags

**Files (modify):**
- `src/routes/_app/_auth/dashboard/_layout.gabinet.appointments.$appointmentId.lazy.tsx` (selector ~2958; locked-amount logic ~1246-1251 / amount input / select onValueChange)
- `src/components/gabinet/calendar/appointment-preview-content.tsx` (selectors ~2186 + ~2342; package-coverage note ~2206)
- `src/routes/_app/_auth/dashboard/_layout.gabinet.patients.$patientId.tsx` (add-payment selector ~2002-2039; locked-amount ~614-618)

**Interfaces:**
- Consumes: `usePaymentMethods(orgId, "settlement")`, `findMethod`, `PaymentMethodSelect`.

For EACH of the three settlement dialogs:

- [ ] **Step 1: Replace the hardcoded `<SelectItem>` list** with `<PaymentMethodSelect organizationId={organizationId} context="settlement" value={method} onChange={setMethod} />` (or map over `usePaymentMethods(...,"settlement")` if the surrounding markup must stay). Keep the existing state variable; its value is now a method `key` string.

- [ ] **Step 2: Replace key-based behaviour checks with flag lookups.** Compute `const methods = usePaymentMethods(organizationId, "settlement");` and `const selected = findMethod(methods, paymentMethod);` then:
  - Replace `paymentMethod === "gratis" || paymentMethod === "barter"` with `!!selected?.locksAmountToTreatmentPrice` (drives locked amount + no split + no credit — keep the exact same downstream logic, only the condition changes).
  - Replace `paymentMethod === "package"` checks with `!!selected?.isPackageCoverage` (package-coverage note + no-cash logic).

- [ ] **Step 3: Default value.** Where state initialised to `"cash"`, keep `"cash"` (the seeded system key always exists). When the methods load, if the current value is not in the list, fall back to the first method's key (guard against an org that deactivated cash).

- [ ] **Step 4: Typecheck after each file**

Run: `npx tsc -p tsconfig.app.json --noEmit --pretty false`
Expected: 0 errors.

- [ ] **Step 5: Commit (once all three settlement dialogs done)**

```bash
git add -A
git commit -m "feat(payments): settlement dialogs read methods + behaviour from single source"
```

> Result: both settle dialogs now show identical methods (the original complaint); gratis/barter appear in the calendar-preview dialog too; amount-lock and package-coverage are flag-driven.

---

### Task 10: Migrate the SALES selectors

**Files (modify):**
- `src/components/gabinet/patient-packages-card.tsx` (type at :46; selectors ~520-523 + 2 split)
- `src/components/gabinet/treatment-purchase-drawer.tsx` (type at :37; selectors ~388-396)
- `src/components/gabinet/sell-package-panel.tsx` (selectors ~239-245)
- `src/components/gabinet/package-purchase-drawer.tsx` (selectors ~360 + ~440 + ~474)

- [ ] **Step 1:** In each file, remove the local `type PaymentMethod = "cash" | ...` and use the method `key` string. Replace each hardcoded `<SelectItem>` list (main + split first/second) with options from `usePaymentMethods(organizationId, "sales")` (map to `<SelectItem value={m.key}>{m.name}</SelectItem>`), or `<PaymentMethodSelect context="sales" .../>` where a plain select fits.

- [ ] **Step 2:** Keep default `"cash"`; add the same not-in-list fallback as Task 9 Step 3.

- [ ] **Step 3: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit --pretty false`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(payments): sales/purchase flows read methods from single source"
```

> Result: `Inna` now appears in treatment-purchase and sell-package flows (intended consistency change).

---

### Task 11: Migrate the REFUND selector

**Files (modify):**
- `src/routes/_app/_auth/dashboard/_layout.gabinet.patients.$patientId.tsx` (refund state :140-142; selector ~1930-1945)

- [ ] **Step 1:** Replace the refund-method state type with a `string` (key). Replace the refund `<SelectItem>` list with `<PaymentMethodSelect context="refund" .../>` (or map `usePaymentMethods(organizationId, "refund")`). Default `"cash"`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit --pretty false`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(payments): refund dialog reads refund-eligible methods from single source"
```

---

### Task 12: Cleanup + final verification

**Files (modify):**
- Any remaining hardcoded payment-method literals/types found by grep.
- `public/locales/{pl,en}/translation.json` — leave `gabinet.payments.methods.*` (still used as the seed source / display fallback); remove `gabinet.packages.paymentMethods.*` only if no longer referenced.

- [ ] **Step 1: Grep for stragglers**

Run:
```bash
grep -rnE '"cash"|"barter"|"gratis"|paymentMethods\.(cash|card|transfer)' src --include=*.tsx | grep -v database.types | grep -v database.columns
```
Expected: only display/fallback usages remain (no hardcoded `<SelectItem>` option lists). Migrate any selector still found.

- [ ] **Step 2: Full typecheck (app + convex)**

Run: `npx tsc -p tsconfig.app.json --noEmit --pretty false` and `npx tsc -p convex/tsconfig.json --noEmit --pretty false`
Expected: 0 errors both.

- [ ] **Step 3: Convex unit tests**

Run: `npm run test:unit`
Expected: all pass.

- [ ] **Step 4: Deploy + manual E2E** (dev `helpful-mule`, then prod `pleasant-elephant` after review)

Run: `npx convex dev --once`
Manual checks: (a) settings page lists 7 system methods, add a custom "Voucher", deactivate one, reorder; (b) both settle dialogs show identical settlement methods incl. gratis/barter; gratis/barter lock the amount; package shows the coverage note; (c) sales flows show sales methods incl. Inna; (d) refund shows only refund-eligible methods; the new custom method appears only where its flags allow.

- [ ] **Step 5: Commit + open PR**

```bash
git add -A
git commit -m "feat(payments): remove residual hardcoded payment methods + i18n cleanup"
```
Open a PR for `feat/configurable-payment-methods`. After merge to `main`, deploy prod Convex (`npx convex deploy -y`); the single Supabase already has migration 00024 and lazy-seed covers every org on first read.

---

## Self-Review (coverage vs spec)

- System+custom methods → Tasks 1,4,6. Per-context flags → schema (T1), filter (T4/T8), seed (T4). Single Polish name → T4 seed + mapper. Custom editability (name/active/order/contexts; behaviours system-only) → T4 `update` guard + T6 UI. Backend validation (existence/active always; refund hard) → T5. Enum→TEXT relax → T2. Two intentional consistency changes → emerge from T9 (settlement filter) and T10 (sales filter). Seed/backfill → lazy seed in T4 `list`. Admin page under gabinet settings → T6/T7. All ~9 selectors → T9–T11; stragglers → T12.
- No placeholders: all code blocks concrete; the only investigate-before-implement notes are the `delete` vs soft-delete capability check (T4) and the test harness helper name (T4) — both with explicit fallbacks.
- Type consistency: `key` (string) is the payment value end-to-end; `MappedGabinetPaymentMethod` flag names match the schema and seed (`availableForSettlement/Sales/Refund`, `locksAmountToTreatmentPrice`, `isPackageCoverage`).
