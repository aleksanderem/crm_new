# Magazyn Module — target module context

This file is the dedicated reference for a future `magazyn` inventory module. It describes the intended ownership boundary, the platform integration points, and the safe patterns that should be followed when the module is implemented.

## What Magazyn users do

Warehouse and operations staff manage stock across one or more warehouses. Their daily workflow includes checking low-stock items, receiving goods, issuing stock to downstream workflows, reviewing reservations, reconciling adjustments, and monitoring movement history.

In this product, `magazyn` should also support cross-module operational flows. Gabinet may need to reserve or consume treatment consumables. CRM may need to reserve or fulfill stock after deal progression or document-driven delivery steps. The module therefore needs strong ownership rules and safe shared integration surfaces.

## Ownership

Magazyn should own warehouses, stock items, stock movements, reservations, stock adjustments, reorder thresholds, and inventory-specific reports.

It should not own organizations, auth, billing, RBAC, generic notifications, audit-log infrastructure, or the global automation engine. Those remain platform concerns.

A healthy ownership split is:

- module-owned entities: `magazynWarehouses`, `magazynItems`, `magazynStockMovements`, `magazynReservations`
- platform-owned concerns: organization access, subscriptions, permissions, audit logging, notifications, activities, shared automation runtime
- cross-module references: `organizationId`, `createdBy`, and optional references such as `appointmentId`, `treatmentId`, `leadId`, `contactId`, `documentInstanceId`

## Product and shell identity

The recommended stable module id and product key are both `magazyn`.

Suggested route namespace:

- workspace root: `/dashboard/magazyn`
- settings root: `/dashboard/magazyn/settings`

Suggested primary navigation:

- dashboard
- items
- movements
- reservations
- reports
- settings

Suggested settings sections:

- warehouses
- categories
- reorder rules
- integrations

Suggested quick actions:

- add item
- receive stock
- issue stock
- create adjustment
- review low stock

## Planned file layout

Backend:

- `convex/magazyn/items.ts`
- `convex/magazyn/movements.ts`
- `convex/magazyn/reservations.ts`
- `convex/schema/magazyn.ts`
- optional `convex/magazyn/documentDataSources.ts`

Frontend:

- `src/modules/magazyn/manifest.ts`
- `src/components/magazyn/...`
- `src/routes/_app/_auth/dashboard/_layout.magazyn.index.tsx`
- `src/routes/_app/_auth/dashboard/_layout.magazyn.items.tsx`
- `src/routes/_app/_auth/dashboard/_layout.magazyn.movements.tsx`
- `src/routes/_app/_auth/dashboard/_layout.magazyn.reservations.tsx`
- `src/routes/_app/_auth/dashboard/_layout.magazyn.settings.*.tsx`

Platform composition touchpoints:

- `src/modules/types.ts`
- `src/modules/registry.ts`
- `convex/schema.ts`
- `convex/_helpers/permissionTypes.ts`
- `convex/_helpers/permissions.ts`
- `convex/productSubscriptions.ts`
- `convex/documentDataSources.ts` if document sources are added
- `convex/automationRegistry.ts` if automation events are added

## Core entity model

A pragmatic first schema should include four core entity groups.

`magazynWarehouses` should own warehouse identity, code, status, and default flags.

`magazynItems` should own SKU, name, unit, category, reorder threshold, active state, and any item-level metadata needed for operations.

`magazynStockMovements` should own receipts, issues, adjustments, and reservation releases together with references back to the business reason for the movement.

`magazynReservations` should own reserved quantities for downstream workflows such as appointments, treatments, documents, or CRM fulfillment steps.

A key operating rule is that stock must not be mutated ad hoc from other modules. Current stock should be derived from movements or maintained by a module-owned projection updated by Magazyn handlers.

## Permission model

The first permission surface should stay small and business-facing. Recommended feature ids are:

```ts
"magazyn_items",
"magazyn_movements",
"magazyn_reservations",
"magazyn_reports",
"magazyn_settings",
```

A sensible default model is:

- owner and admin: full access
- member: read access plus operational create/edit rights where appropriate, but limited delete rights after posting movements
- viewer: read-only

The important rule is that permission keys describe business capabilities, not implementation details. Backend handlers should use `checkPermission(...)`, and frontend actions should use `usePermission(...)` or `usePermissions(...)`.

## Product activation and packages

The module should only appear for organizations with an active `magazyn` product subscription.

When implemented, keep these aligned:

- manifest `productKey`
- product catalog entry in `platformProducts`
- organization entitlements in `productSubscriptions`
- shell visibility from `getActiveProducts` plus `getVisibleModules`

A known architecture follow-up is that the current no-subscription fallback in `convex/productSubscriptions.ts` is still hardcoded around existing modules. That should become catalog-driven before new sellable modules are added broadly.

## Integration with Gabinet

Gabinet is the most important likely integration point.

Good patterns:

- appointments or treatments reserve consumables through `magazynReservations`
- appointment completion emits an inventory request or calls a Magazyn-owned adapter
- low stock on treatment-critical items creates notifications or automation events for staff

Bad pattern:

- `gabinet/appointments.ts` directly patching an inventory quantity field

The safe flow is that Gabinet passes explicit context, Magazyn validates stock rules, and Magazyn posts the resulting movement itself.

## Integration with CRM

CRM should integrate where inventory matters to commercial workflows.

Good patterns:

- a won deal requests an inventory reservation
- fulfillment or document flows reference stock items explicitly
- CRM product catalog entries link to stock items through stable ids when the business wants commercial-to-physical mapping

CRM may request or reference inventory behavior, but Magazyn should remain the owner of inventory writes.

## Shared platform surfaces

If the module participates in shared document generation, it should expose explicit document data sources such as `warehouse`, `stock_item`, and `stock_movement` through `convex/magazyn/documentDataSources.ts` and the central document-data registry.

If it participates in shared activities, notifications, or search, those integrations should also happen through stable composition surfaces rather than hidden import-time coupling.

## Events and automations

A useful initial event set is:

```ts
magazyn.item.created
magazyn.item.low_stock
magazyn.stock_movement.posted
magazyn.reservation.created
magazyn.reservation.released
```

Useful payload fields include `itemId`, `itemName`, `sku`, `warehouseId`, `warehouseName`, `quantity`, `movementType`, `sourceModule`, `sourceEntityId`, and `belowThreshold`.

A safe first automation action surface should stay narrow. Good early actions are creating notifications, writing shared activity entries, creating reorder requests through module-owned handlers, and updating non-critical workflow fields through explicit adapters. Arbitrary stock mutation should not be exposed as a generic automation action.

## Verification

A focused verification pass for the module should confirm that:

- the module is visible only for organizations with the `magazyn` product
- workspace switcher, sidebar navigation, settings navigation, and page-context behavior come from the manifest
- backend handlers enforce access and permission checks
- stock writes only happen through Magazyn-owned domain handlers
- Gabinet and CRM integrations create requests or references rather than direct inventory patches
- automation discovery includes the expected Magazyn lifecycle metadata
- document data sources resolve correctly if warehouse documents are enabled

## Current status

`Magazyn` is currently a documented reference module, not an implemented module. This file should be treated as the module ownership and integration blueprint to follow when the inventory slice is actually scaffolded.
