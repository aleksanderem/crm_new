# Configurable Payment Methods (Gabinet) — Design

Date: 2026-06-25
Status: Approved (design); implementation pending
Module: Gabinet (payments are entirely a Gabinet feature; CRM has no payment UI)

## Problem

Payment methods are hardcoded in ~9 UI selectors plus backend validators, with
divergent subsets per screen. The two "settle visit" dialogs offer different
methods (the appointment-detail dialog has all 7; the calendar-preview dialog is
missing `gratis`/`barter`). Method-specific behaviour (amount-lock for
gratis/barter, package coverage, refund exclusions) is duplicated and bound to
hardcoded string keys. There is no single source of truth and no admin control.

## Goal

One DB-backed, admin-managed source of truth for payment methods. System methods
are seeded and behave exactly as today (same dependencies/conditionals). Admins
can rename/reorder/(de)activate system methods and add their own custom methods.
Every UI location reads from the same source, filtered by context.

## Decisions (from brainstorming)

1. **System + custom methods.** 7 system methods seeded with behaviour flags
   (non-deletable, behaviour/contexts locked); users may add custom methods.
2. **Per-context flags.** Each method declares where it is offered:
   settlement / sales / refund. Screens filter by the relevant flag.
3. **Single `name`, seeded in Polish** (matches `sources`/`gabinetLeaveTypes`).
   No per-method i18n; EN users see the Polish/admin-edited names.
4. **Custom methods:** admin edits name, active, order, and the three context
   flags. Special behaviour flags (amount-lock, package-coverage) are
   system-only and never available to custom methods.
5. **Backend validation:** every payment write validates the method exists and
   is active for the org. Refund actions additionally enforce
   `availableForRefund` (money-safety). Settlement/sales rely on the active
   check + UI context filtering (no hard per-context gate beyond refund).

## Approach (chosen): method-"key" model

A new org-scoped definition table modelled on `gabinetLeaveTypes`. Payment rows
keep storing the method as a stable string **key** (`cash`, `card`, … and a
slug for custom methods). The `payments.payment_method` column is relaxed from
the Postgres enum to `TEXT`, so existing values stay valid and custom keys are
allowed. Labels and behaviour are resolved from the definition table by key.

Rejected alternatives:
- **FK-by-id** on payment rows — requires backfilling every existing payment row
  per-org (enum string → new row id) and reworking report grouping/joins. Heavier
  migration, more risk, no functional gain over a stable key.
- **Enum + TS constant** — does not deliver a single editable source; the
  per-screen divergence would persist.

## Data model — `gabinetPaymentMethods`

Convex table (`convex/schema/gabinet.ts`), Supabase `gabinet_payment_methods`.

| field | type | notes |
|---|---|---|
| `organizationId` | id("organizations") | org-scoped |
| `key` | string | stable slug; system keys fixed; custom = slugified, unique per org |
| `name` | string | display label (single language) |
| `isSystem` | boolean | true for the 7 seeded; blocks delete + behaviour/context edits |
| `isActive` | boolean | inactive = hidden from all selectors (still resolvable for historical rows) |
| `order` | number | sort order in selectors + admin list |
| `availableForSettlement` | boolean | offered in visit-settle dialogs |
| `availableForSales` | boolean | offered in package/treatment/sell-package purchase flows |
| `availableForRefund` | boolean | offered in refund dialog; enforced backend-side |
| `locksAmountToTreatmentPrice` | boolean | system-only behaviour; amount locked, no split, no credit |
| `isPackageCoverage` | boolean | system-only behaviour; "covered by package" note + no cash recorded |
| `createdBy` | id("users") | |
| `createdAt` / `updatedAt` | number | |

Indexes: `by_org`, `by_orgAndActive`.

### System seed (reproduces today 1:1)

| key | name | settle | sales | refund | locksAmount | packageCoverage |
|---|---|---|---|---|---|---|
| cash | Gotówka | ✓ | ✓ | ✓ | – | – |
| card | Karta | ✓ | ✓ | ✓ | – | – |
| transfer | Przelew | ✓ | ✓ | ✓ | – | – |
| package | Seria/Karnet | ✓ | – | – | – | ✓ |
| gratis | Gratis | ✓ | – | – | ✓ | – |
| barter | Barter | ✓ | – | – | ✓ | – |
| other | Inna | ✓ | ✓ | ✓ | – | – |

Custom method defaults on create: `settlement=true`, `sales=true`,
`refund=` admin choice (default false), behaviour flags = false, `isSystem=false`.

### Two intentional consistency changes (toward "same everywhere")

1. `gratis`/`barter` will now also appear in the **calendar-preview settle
   dialog** (today only the detail-page dialog has them — the reported bug).
2. `Inna` (other) will now also appear in **treatment-purchase and
   sell-package** flows (today inconsistently omitted; package-purchase already
   has it).

Everything else is unchanged.

## Backend

- `convex/gabinet/paymentMethods.ts`: `list` (optional `activeOnly` + `context`
  filter), `create`, `update`, `remove` (rejects `isSystem`), `reorder`, `seed`.
  Permission gate: `gabinet_settings` (mirror `gabinet/leaveTypes.ts`); `remove`
  and behaviour/context edits rejected for `isSystem` rows; custom rows allow
  name/active/order/context edits.
- Relax `paymentMethodValidator` (`convex/payments.ts`) and the `payments`
  table union (`convex/schema/crm.ts`) from literal unions to `v.string()`.
- Payment write paths validate: method `key` exists for the org and `isActive`.
  `refund` / `refundCredit` additionally require `availableForRefund`.
- Amount-lock stays a UI behaviour exactly as today (#2182): backend stores the
  amount it is sent; the `locksAmountToTreatmentPrice` flag only drives the UI.
- Seed 7 system methods on org creation (extend `seedDefaults` /
  `seedOrganizationDefaults`) and backfill existing orgs (idempotent `seed`).

## Frontend

- New mapper `src/lib/supabase/mappers/gabinet/payment-methods.ts`, hook
  `src/hooks/use-supabase-gabinet-payment-methods.ts`
  (`useSupabaseGabinetPaymentMethods(orgId, { context })` →
  active methods for that context, sorted by `order`), query keys entry.
- Replace all hardcoded selectors with the shared hook filtered by context:
  - settlement: appointment detail (`_layout.gabinet.appointments.$appointmentId.lazy.tsx`),
    calendar preview (`components/gabinet/calendar/appointment-preview-content.tsx`),
    patient add-payment (`_layout.gabinet.patients.$patientId.tsx`).
  - sales: `patient-packages-card.tsx`, `treatment-purchase-drawer.tsx`,
    `sell-package-panel.tsx`, `package-purchase-drawer.tsx`.
  - refund: patient profile refund dialog.
- Behaviour driven by flags, not keys: `locksAmountToTreatmentPrice` →
  locked-amount UI (replaces the `=== "gratis" || === "barter"` checks);
  `isPackageCoverage` → package-coverage note/logic (replaces `=== "package"`).
- Remove hardcoded TS unions / `PaymentMethod` types; method value is now the
  `key` string. Display label resolved from the method list (fallback to the key
  for any historical value no longer present).
- Settings admin page `_layout.gabinet.settings.payment-methods.tsx` mirroring
  `leave-types.tsx`: list with order, active toggle, context badges; create/edit
  dialog (custom: name + active + order + 3 context flags; system: name + active
  + order only, behaviour/context read-only); delete (custom only).
- i18n: keep `gabinet.payments.methods.*` only as the seed source for the Polish
  default names; UI labels come from the DB rows. `gabinet.packages.paymentMethods.*`
  consumers migrate to the shared hook.

## Migration / rollout

- Supabase migration `00024`: create `gabinet_payment_methods` (+ RLS +
  `by_org`/`by_orgAndActive` indexes); `ALTER TABLE payments ALTER COLUMN
  payment_method TYPE TEXT` (existing values preserved; leave the now-unused
  `payment_method_enum` type in place to avoid a risky drop).
- `convex/_helpers/supabaseDb.ts` `TABLE_MAP`: add `gabinetPaymentMethods`.
- Regenerate `database.types.ts` / `database.columns.ts` via
  `node scripts/gen-db-types.mjs` (next migration number is 00024).
- Seed on org creation + idempotent backfill for existing orgs.

## Out of scope

- No change to settlement / credit / refund / reporting math — those keep
  working exactly as today and only read the method from the single source.
- No per-method i18n, no per-method icons/colors (YAGNI; can add `color` later).
- No CRM-side payment methods (CRM has no payment UI).

## Suggested implementation phases

1. Data layer: Convex table + Supabase 00024 + TABLE_MAP + mapper + hook +
   query keys + regenerate types.
2. Backend: `paymentMethods.ts` CRUD + seed/backfill + relax validators + add
   existence/active + refund-context checks.
3. Admin UI: gabinet settings "Payment methods" page (mirror leave-types).
4. Frontend consumption: replace all ~9 selectors with the shared hook; wire
   behaviour flags; remove hardcoded unions/types; i18n cleanup.

## Testing

- Convex unit tests (`npm run test:unit`) for CRUD + seed idempotency + system
  protections + refund-context rejection.
- Typechecks: `tsc -p tsconfig.app.json` and `tsc -p convex/tsconfig.json` → 0.
- Manual E2E: each of the ~9 selectors shows the correct context-filtered set;
  gratis/barter lock the amount in both settle dialogs; package coverage note;
  refund excludes non-refundable; a custom method appears only where flagged.

## Risks

- Relaxing the enum to TEXT removes a DB-level guard; mitigated by backend
  existence/active validation.
- Missing a hardcoded selector defeats the single-source goal — the consumption
  phase must cover every site in the map (see exploration findings).
