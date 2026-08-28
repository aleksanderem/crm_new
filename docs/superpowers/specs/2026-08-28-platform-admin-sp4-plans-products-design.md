# Platform Admin Console — SP4: Plans & Products Catalog (Design Spec)

**Date:** 2026-08-28
**Status:** Design — awaiting approval
**Sub-project:** SP4 of the Platform Admin Console (SP1 Module access ✅ → SP2 Organizations console ✅ → **SP4 Plans/products/pricing** → SP3 Users → SP5 Billing/Stripe → SP6 Settings/observability).

## Goal

Give a platform operator (`users.isPlatformAdmin`) a panel to view and edit the subscription **plans** catalog (`plans`) and the platform **products** catalog (`platformProducts`) — the config that today is hardcoded in seed/init scripts with no way to change post-deploy. SP4 covers the operator-editable, non-Stripe fields: plan `seatLimit`/`name`/`description`, and product `name`/`description`/`isActive`. Prices, `stripeId`, plan `key`, plan creation, and any Stripe write are explicitly out of scope (SP5).

## Architecture — Convex-native (differs from SP1/SP2)

Unlike SP1/SP2 (which read/write Supabase), **`plans` and `platformProducts` are Convex-only** (not in `TABLE_MAP`); the live app reads them from Convex `ctx.db` (`getActivePlans`, `getPublicPricingPlans`, `checkSeatLimit`'s plan lookup). So SP4's backend reads/writes Convex `ctx.db` directly:

- Backend is Convex **`action`s** guarded by `verifyPlatformAdmin` (mirrors SP1/SP2 for auth), but each action delegates the data work to an **internal `query`/`mutation` on `ctx.db`** (`ctx.runQuery`/`ctx.runMutation`) rather than `createSupabaseDb()`. (`verifyPlatformAdmin` is an `internalAction` reading `isPlatformAdmin` from Supabase, so the entry point must be an action.)
- No Supabase mirror is needed or written for these tables.
- Frontend mirrors the existing admin routes: `getIsPlatformAdmin` gate → 403 card; `useAction` + `useQuery`/`useMutation`.

## Backend — `convex/admin/plans.ts` (new)

- `listPlans` action → guard → `ctx.runQuery` internal query over `ctx.db.query("plans")` → `Array<{ _id, key, productKey, name, description, seatLimit, stripeId, prices }>` (prices returned read-only for display).
- `updatePlan` action(`planId: Id<"plans">`, `{ name?, description?, seatLimit? }`) → guard → `ctx.runMutation` internal mutation → `ctx.db.patch(planId, {...only provided fields})`. Validates `seatLimit` is a positive integer. Does NOT touch `key`, `productKey`, `stripeId`, or `prices`. Best-effort audit.
- `listProducts` action → guard → internal query over `ctx.db.query("platformProducts")` → `Array<{ _id, productId, name, description, isActive, prices, stripeProductId }>` (prices read-only).
- `updateProduct` action(`productDocId: Id<"platformProducts">`, `{ name?, description?, isActive? }`) → guard → internal mutation → `ctx.db.patch(...)` + `updatedAt: Date.now()`. Does NOT touch `productId`, `prices`, or `stripeProductId`. Best-effort audit.

Each write action captures `userId` from `verifyPlatformAdmin`. **Audit decision (resolved):** `audit_log.organization_id` is `TEXT NOT NULL REFERENCES organizations(id)` (00001_initial_schema.sql:445), so `logAudit` cannot record a platform-level (org-less) change — any sentinel org id would violate the FK. SP4 therefore does NOT call `logAudit`; it emits a `console.info("[admin/plans] plan_updated planId=… by=…")` / `product_updated` line for traceability. Proper platform-scoped audit (nullable-org `audit_log` or a dedicated `platform_audit` table) is deferred to SP6 observability. The config write always succeeds regardless.

## Frontend — `src/routes/_app/_auth/admin.plans.tsx` (new) + hub tile

One route with two sections (both catalogs are small):

- **Plany** — `Table` of plans (Produkt `productKey`, Plan `key` badge, Nazwa, Miejsca `seatLimit`, Cena/mies read-only from `prices.month.pln`). Row "Edytuj" opens a `Dialog` with inputs for name, description, and seatLimit (number) → `updatePlan`. `key`/`productKey`/prices shown read-only.
- **Produkty** — `Table` of `platformProducts` (Produkt `productId`, Nazwa, Opis, Aktywny `isActive` badge/`Switch`, Cena/mies read-only). Edit dialog for name/description + a `Switch` for `isActive` → `updateProduct`.

Reuse existing `src/components/ui/*` (Card, Table, Badge, Switch, Dialog, Button, Input, Textarea, Label). Add a "Plany i produkty" tile to `admin.index.tsx`.

## Non-goals (SP5 / later)

Creating or deleting plans; editing plan `key`/`productKey`; changing any price (Stripe prices are immutable — a change means minting a new Stripe price); creating Stripe products/prices; the subscriptions overview (who's on which plan); trials. SP4 edits only the Convex-side catalog metadata + seatLimit; SP5 owns all Stripe writes and billing views.

## Impact / safety

Editing `plans.seatLimit` immediately affects seat enforcement (`checkSeatLimit` / `checkSeatLimitAction` read `plan.seatLimit` from `ctx.db`). Editing `platformProducts.isActive`/name/description affects the catalog reads (`getPublicPricingPlans`, pricing page). These are the intended effects. No schema change, no migration — SP4 only adds actions/UI over existing tables.

## Testing

`convex-test` per action (plans/products live in `ctx.db`, so seed with `ctx.db.insert` and assert directly): non-admin caller throws (`verifyPlatformAdmin` gate — seed a Supabase `users` row with `isPlatformAdmin`); `listPlans`/`listProducts` shape; `updatePlan` round-trip incl. `seatLimit` and that it does NOT alter `prices`/`key`; `updateProduct` `isActive` toggle round-trip; invalid `seatLimit` (≤0 / non-integer) rejected. Drift-guard mindset: the update actions must never accept `prices`/`stripeId`/`key` fields.
