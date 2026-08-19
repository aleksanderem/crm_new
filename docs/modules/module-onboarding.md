# Module onboarding and integration architecture

This document explains how new business modules should be added to the platform so they are easy to discover, easy to activate per organization, easy to configure, easy to permission, and safe to integrate with cross-module data flows, events, and automations.

For quick navigation across module docs, start at `docs/modules/index.md`.

It covers both the current implementation baseline in this repository and the intended operating model. The current code already supports a registry-driven shell, schema ownership fragments, document/data-source registration, and automation discovery registries. A few parts are still manual composition points, so this guide also calls out where a new module currently requires a central edit and where the architecture should continue moving toward full autodiscovery.

## Architectural goal

A module should be able to describe itself once and then be discovered by the platform everywhere that matters: workspace navigation, settings, page context widgets, permissions, product activation, document/data sources, event publication, and automation triggers/actions.

The platform should remain the owner of shared concerns such as organizations, RBAC, billing, notifications, audit logs, activities, document infrastructure, and search. Each business module should remain the owner of its own domain logic, routes, entities, and workflows.

The desired rule is simple. Modules publish declarative metadata and safe adapters. The platform consumes that metadata. Cross-module behavior should happen through explicit references, shared registries, and events, not by letting one module directly mutate another module’s tables in arbitrary ways.

## Current composition roots

The current repository already has several important composition roots.

Frontend shell autodiscovery starts in `src/modules/types.ts` and `src/modules/registry.ts`. Each module contributes a manifest such as `src/modules/crm/manifest.ts` or `src/modules/gabinet/manifest.ts`. Those manifests define the workspace switcher entry, primary navigation, settings navigation, and page-context widgets/actions.

Per-organization module activation is controlled through product subscriptions. The current query is `convex/productSubscriptions.ts`, where `getActiveProducts` returns the active product ids for the organization. The shared shell then filters visible modules by the manifest `productKey`.

Permissions are controlled through shared feature keys and role defaults. The current single source of truth is `convex/_helpers/permissionTypes.ts` for feature/action/scope definitions and `convex/_helpers/permissions.ts` for default per-role behavior. Org-specific overrides are stored through `convex/permissions.ts` and consumed in the frontend via `src/hooks/use-permission.ts`.

Automation discovery is now registry-driven. `convex/automationRegistry.ts` owns event catalog entries, legacy trigger resolution, and action capability metadata, while `convex/automation.ts` consumes those helpers for the public queries and runtime hydration.

Cross-module document/data sharing already follows a registry model. `convex/documentDataSources.ts` is the platform composition root, while each module contributes sources from its own file such as `convex/crm/documentDataSources.ts` and `convex/gabinet/documentDataSources.ts`.

Schema ownership is now fragmented by responsibility. `convex/schema.ts` remains the public composition root, while tables are split into module/platform fragment factories in `convex/schema/platform.ts`, `convex/schema/crm.ts`, `convex/schema/gabinet.ts`, and `convex/schema/automation.ts`.

## What a module must own

A new module should own its own domain in all of the following places.

At the backend layer it should own its domain mutations, queries, event emission, and lifecycle rules under a dedicated area such as `convex/<module>/`.

At the frontend layer it should own its routes and components under module-specific directories and route namespaces.

At the metadata layer it should own a manifest, data-source registrations if needed, automation event registrations if needed, and feature definitions for permissions.

At the persistence layer it should own a schema fragment rather than appending everything inline to a monolithic shared file.

At the integration layer it should expose stable, explicit interfaces to the rest of the platform. Examples include document data sources, activity logging, notifications, search indexing, and automation lifecycle events.

## Step-by-step process for adding a new module

### 1. Define the module boundary first

Before writing code, define what the module truly owns and what stays platform-owned. A healthy module owns its own entities, workflows, and user-facing journeys. It does not reimplement auth, org membership, billing, generic notifications, or RBAC.

A good first deliverable is a short ownership statement similar to the existing `docs/modules/crm.md` and `docs/modules/gabinet.md` files. That statement should name the entities, workflows, and cross-module touchpoints.

### 2. Give the module a stable identity

Every module needs a stable module id and a product key.

Module ids are typed in `src/modules/types.ts` as `ModuleId = string` — any string value is valid, no platform-core change required when adding a new module. The module manifest uses that id, and `productKey` is used for activation filtering.

Recommendation: keep module id and product key the same unless there is a real billing/catalog reason to separate them. That makes activation, routing, settings, and automation ownership much easier to follow.

### 3. Add a schema fragment, not a schema dump

A new module should add a dedicated schema fragment under `convex/schema/<module>.ts` and then get composed in `convex/schema.ts`. That preserves module ownership and makes later extraction, auditing, and testing easier.

The fragment should only define tables and indexes that the module truly owns. Shared tables such as activities, notifications, permissions, subscriptions, and automation runs stay in platform/shared ownership.

If the module needs references into other modules, keep them explicit and narrow. A field like `contactId` on a patient is acceptable because ownership remains obvious. What should be avoided is allowing another module to freely patch your entities without going through your domain layer.

### 4. Add backend domain files under a module namespace

Create a dedicated backend namespace such as `convex/<module>/`. Domain mutations and queries should live there. Lifecycle invariants should be enforced there. Any side effects such as logging, notifications, search indexing, or event emission should be triggered from the owner module’s handlers.

This is important because the module should remain the authority on when an entity is valid, what status transitions are allowed, and what side effects happen on create/update/delete.

### 5. Add frontend routes and components under the module namespace

Routes should live under the dashboard namespace in a module-specific branch, following the current shape used by Gabinet. Components should live in a dedicated `src/components/<module>/` area when they are module-specific.

Avoid putting module-specific UI in generic shared component directories unless it is truly reusable across modules.

### 6. Register the module manifest for shell autodiscovery

The core step for frontend autodiscovery is the module manifest.

Create `src/modules/<module>/manifest.ts` implementing `ModuleManifest`. At minimum, the manifest should declare:

- `id`
- `productKey`
- `workspaceRoot`
- `settingsRoots`
- `workspace`
- `primaryNav`
- `settingsNav`
- `pageContexts`
- optional `fallbackPageContextKey`

This allows the shell to discover the module in the workspace switcher, main sidebar, settings sidebar, and page-context widget/actions without hardcoding those details into the shell itself.

Today, the composition step is still manual: `src/modules/registry.ts` imports each manifest and adds it to `moduleRegistry`. That is already a good low-blast-radius registry seam, but it is not yet full zero-touch autodiscovery. The long-term target should be that adding a module requires only adding its manifest file and exposing it through a single declarative registry surface, not editing multiple unrelated shell files.

### 7. Wire product activation and package visibility

A module should only appear for organizations that have the corresponding product active.

The current activation path is:

- product catalog lives in platform tables such as `platformProducts`
- organization entitlements live in `productSubscriptions`
- `convex/productSubscriptions.ts:getActiveProducts` returns the active product ids
- `src/modules/registry.ts:getVisibleModules` filters manifests by `productKey`

That means adding a new module requires aligning all of the following:

- the module manifest `productKey`
- product catalog seed/configuration for the new product
- subscription lifecycle logic if billing needs to activate/deactivate it

As of issue #4291, `getActiveProducts` no longer applies a grace-period fallback. If an organization has no active subscriptions, the function returns an empty list and no modules are shown. The previous hardcoded fallback of `["crm", "gabinet"]` has been removed, so there is no longer a risk that a newly added module is silently excluded from the fallback set.

### 8. Add settings and configuration surfaces as module-owned metadata

If a module has its own configuration, those entries belong in the module manifest `settingsNav`. The module should also own the actual settings routes and backend config handlers.

The principle is that the shell should only render settings navigation from metadata. The module itself owns what those settings pages do.

Examples of module-owned configuration include:

- scheduling rules
- leave types
- treatment categories
- reminder settings
- domain-specific templates
- module-specific integrations

Examples of platform-owned configuration include:

- billing
- team management
- generic permission overrides
- organization profile
- shared email/SMS infrastructure when not domain-specific

### 9. Add permission features from a shared feature catalog

Easy permission editing depends on a central, explicit feature catalog. The current source of truth is `convex/_helpers/permissionTypes.ts`, where `FEATURES` enumerates allowed feature ids, and `convex/_helpers/permissions.ts`, where default per-role permissions are created.

When a new module adds protected functionality, it should define clear feature boundaries such as:

- `<module>_entities`
- `<module>_workflows`
- `<module>_reports`
- `<module>_settings`

Then update:

- `convex/_helpers/permissionTypes.ts` with the new feature ids
- `convex/_helpers/permissions.ts` with sensible owner/admin/member/viewer defaults
- any permissions UI that groups and labels those features for editing
- frontend gates that call `usePermission` or `usePermissions`
- backend mutations/queries that call `checkPermission`

The important design rule is that permission keys must remain stable and semantic. Do not model permissions around table names or implementation details. Model them around business capabilities that admins understand.

Long term, the better direction is for module manifests to declare their permission feature metadata, while the platform still owns the evaluation engine and persisted overrides. That would make the permissions UI itself more autodiscoverable.

### 10. Register shared data surfaces instead of leaking direct dependencies

If the module needs to share data with the rest of the platform, it should register that data through a stable shared surface.

The current best example is the document data-source registry:

- platform composition root: `convex/documentDataSources.ts`
- module contributions: `convex/<module>/documentDataSources.ts`

A module contributes `DataSourceDefinition` objects that describe field metadata and a resolver function. The platform then exposes those sources to template builders and preview flows.

This pattern should be reused for other kinds of cross-module discoverability:

- search providers
- activity display adapters
- notification templates
- reporting datasets
- automation entities/events/actions

The key rule is that shared consumers should read module contributions through registries, not by importing random module internals and reverse-engineering data contracts.

### 11. Model cross-module data flow through owned writes and explicit references

Modules in this system are not isolated microservices. They are part of one product, so some cross-module references are natural. The correct approach is controlled coupling.

Good coupling looks like this:

- one module stores a stable foreign reference to another module’s entity, for example a Gabinet patient linking to a CRM contact
- shared platform surfaces aggregate activity, notifications, documents, or search results across modules
- read models and UI surfaces use those references to present unified views

Bad coupling looks like this:

- one module directly patches another module’s table without going through the owner’s domain handler
- business rules of one module are encoded ad hoc inside another module
- multiple modules independently decide what the same lifecycle transition means

The safe rule is that the owner module performs writes to its own entities. Other modules can request behavior through domain handlers, events, or shared platform adapters.

### 12. Emit events for lifecycle boundaries, not for raw persistence noise

Event flow is how modules should become automation-friendly and bridge-friendly.

The current automation discovery registry in `convex/automationRegistry.ts` already exposes a registry of event types with labels, sample payloads, and variable catalogs. That is the right direction.

When adding a module, define its important lifecycle events explicitly. Examples are:

- entity created
- entity updated
- status changed
- assignment changed
- reminder due
- inbound communication received

Each event should have:

- stable event type name
- clear owner module
- optional entity type
- safe sample payload
- explicit variable catalog for templates and automation builders

Do not expose internal database churn as public automation events. Events should represent meaningful domain milestones that other parts of the product can depend on.

### 13. Add automation discovery before adding automation execution paths

A module becomes automation-aware in two phases.

First, it should register its discoverable events and safe action capabilities. That belongs in registry metadata such as `convex/automationRegistry.ts`.

Second, it should expose safe execution handlers for any automation actions. Those actions should go through domain handlers and permission-aware adapters. They should never amount to “arbitrary patch any table field in any module.”

For a new module, that usually means:

- adding module-owned `EventCatalogEntry` definitions
- adding module-owned action capability metadata if the module supports actions
- mapping automation-visible actions onto safe domain operations
- reusing shared automation runtime machinery rather than inventing a second automation system

The platform should discover the module’s automation surface from metadata. The module should still own the business execution.

### 14. Keep packages, permissions, settings, and automation aligned from day one

A module feels “easy to plug in” only when all four of these concerns line up cleanly:

- visibility: product subscription decides whether the module appears
- operability: settings navigation exposes the configuration surfaces it needs
- safety: RBAC features gate its actions in both backend and frontend
- extensibility: events and registries let other parts of the platform react to it

If any one of these is missing, the module is only partially integrated.

A common failure mode is adding routes and tables first, then bolting on permissions, settings, and automation later. The better path is to define those integration points at module introduction time, even if the first release supports only a small subset.

## Recommended file checklist for a new module

A healthy new module will usually need most of the following files or equivalents.

At the frontend layer:

- `src/modules/<module>/manifest.ts`
- `src/components/<module>/...`
- `src/routes/_app/_auth/dashboard/_layout.<module>.*.tsx` or equivalent route namespace
- locale entries for navigation, settings, and actions

At the backend layer:

- `convex/<module>/...` domain handlers
- `convex/schema/<module>.ts`
- composition update in `convex/schema.ts`
- optional `convex/<module>/documentDataSources.ts`
- optional module event registrations in `convex/automationRegistry.ts`
- optional search/activity/notification adapters

At the platform integration layer:

- `src/modules/types.ts` if new ids or contracts are needed
- `src/modules/registry.ts` until registry composition becomes fully declarative
- `convex/_helpers/permissionTypes.ts`
- `convex/_helpers/permissions.ts`
- any product catalog/bootstrap configuration for `platformProducts` and `productSubscriptions`
- settings UI or grouping metadata for the new permission features

At the documentation layer:

- `docs/modules/<module>.md`
- update `ARCHITECTURE.md` if the new module becomes a first-class source-of-truth area

## Current manual touchpoints that still need improvement

The repo is much better than the old hardcoded shell model, but it is not yet complete zero-touch autodiscovery. Today, adding a module still typically requires edits in a few central places.

The current manual touchpoints are:

- `src/modules/registry.ts` because manifests are still manually imported into `moduleRegistry`
- `convex/productSubscriptions.ts` if activation defaults or product filtering need alignment (the no-subscription grace fallback was removed in #4291 and is no longer a manual touchpoint)
- `convex/_helpers/permissionTypes.ts` because feature ids are centrally enumerated
- `convex/_helpers/permissions.ts` because default role grants are centrally defined
- product catalog/bootstrap data for sellable products and subscriptions
- registry composition roots such as `convex/documentDataSources.ts` and `convex/automationRegistry.ts`

That is still a reasonable architecture for now because the composition points are explicit and low blast radius. But the long-term target should be to make these areas more declarative so adding a module feels like registering metadata, not hunting down hardcoded platform branches.

## Recommended next-step architecture for true module autodiscovery

To get closer to “drop in a module and it appears everywhere correctly,” the platform should keep moving toward a broader registry model.

The best next step is to let each module export a richer manifest that can declare:

- module id and product metadata
- navigation and settings metadata
- permission feature metadata and labels
- configuration sections
- document/search/activity contributions
- event/lifecycle metadata
- automation action capabilities
- bridge/integration adapters for cross-module reactions

The platform would still own evaluation engines for RBAC, billing, routing, notifications, and automation execution. But it would discover module contributions through registries rather than through hardcoded shell or config maps.

In practical terms, that means evolving toward:

- manifest-driven permission UI grouping
- manifest- or catalog-driven product activation defaults
- entity registries for safe shared discovery
- event registries for cross-module reactions
- bridge adapters for syncing related data across modules

## Rules for cross-module integrations

When a new module must integrate with existing ones, follow these rules.

A module may read shared platform tables and services such as organizations, permissions, notifications, activities, and documents.

A module may reference another module’s entities by stable ids where the relationship is real and explicit.

A module should not mutate another module’s entities directly unless the mutation is performed through an owner-approved domain handler or adapter.

A module should emit events when its business lifecycle changes in ways that other modules may care about.

Automations should react to declared lifecycle events and call safe handlers, not raw CRUD shortcuts.

If a cross-module integration becomes complicated or bidirectional, introduce an explicit bridge/listener layer instead of spreading import-time coupling across unrelated files.

## Definition of done for a new module

A new module should be considered properly onboarded only when all of the following are true.

The module appears in the shell only for organizations with the correct active product.

Its navigation, settings entries, and page-context widgets/actions are derived from metadata rather than copied into the shell.

Its backend domain logic and schema are module-owned.

Its permission features are editable through the shared RBAC system and enforced in backend handlers.

Its shared-data surfaces are registered explicitly where needed, such as documents, search, activities, or notifications.

Its domain lifecycle events are exposed in a registry suitable for automation and future cross-module bridges.

Its cross-module relationships use explicit references and safe owner-controlled writes.

Its onboarding steps and ownership are documented in `docs/modules/<module>.md`.

## Practical implementation checklist

This section is the operational playbook for introducing a module from zero to production-ready integration.

### Phase 1. Identity and ownership

Define the module id, product key, route namespace, entity list, and cross-module touchpoints first. Write `docs/modules/<module>.md` before implementation so the ownership boundary is explicit. Decide which parts are truly module-owned and which should remain in platform ownership.

The minimum decisions to lock before coding are the module id, the product key used for activation, the dashboard route root, the permission features that admins will understand, the important entity lifecycle events, and any cross-module references such as `contactId`, `organizationId`, or shared document sources.

### Phase 2. Persistence and backend domain

Create `convex/schema/<module>.ts` and define only module-owned tables and indexes there. Then compose the fragment in `convex/schema.ts`. Add module backend files under `convex/<module>/` and keep domain rules there.

Every mutation should continue to use platform access and permission checks where needed. If the module has sensitive operations, add its feature ids to the shared permission catalog before the UI depends on them.

### Phase 3. Frontend shell registration

Create `src/modules/<module>/manifest.ts` and register it in `src/modules/registry.ts`. Add module routes and components under their module namespace. Use the manifest to drive workspace switcher visibility, sidebar primary navigation, settings navigation, page-context widgets, and page-context quick actions. Do not put this metadata back into shared shell files.

### Phase 4. Activation, settings, and permissions

Make sure the module can be activated through product metadata and organization subscriptions. Add permission features to the shared feature catalog and sensible defaults to role permissions. If the module has settings pages, add them to `settingsNav` and implement the backend config handlers.

At this stage, a tenant with the product should see the module, and a tenant without the product should not.

### Phase 5. Shared data and integration surfaces

If the module must participate in documents, search, activities, notifications, or reporting, register those surfaces explicitly instead of building ad hoc couplings. Follow the existing document data-source pattern whenever the module needs to expose entity data to shared template infrastructure.

### Phase 6. Events and automation

Define meaningful lifecycle events in the automation registry. Add event entries before trying to expose fancy automation execution. If the module supports automation actions, map those actions to safe domain handlers. The module should never expose arbitrary unrestricted CRUD through automation.

### Phase 7. Verification

Verify shell visibility, permissions, module settings, route loading, and focused backend behavior. Confirm that event payloads and automation metadata are stable enough for downstream consumers. Confirm that cross-module references do not bypass ownership rules.

## Reusable new-module template

Use this as the default scaffold checklist when adding a module called `<module>`.

### Files to create

Frontend:

- `src/modules/<module>/manifest.ts`
- `src/components/<module>/...`
- `src/routes/_app/_auth/dashboard/_layout.<module>.*.tsx`
- locale entries for nav, actions, settings, and page titles

Backend:

- `convex/<module>/...`
- `convex/schema/<module>.ts`
- optional `convex/<module>/documentDataSources.ts`
- optional module-specific event emitters or bridge handlers

Platform composition updates:

- `src/modules/types.ts`
- `src/modules/registry.ts`
- `convex/schema.ts`
- `convex/_helpers/permissionTypes.ts`
- `convex/_helpers/permissions.ts`
- `convex/productSubscriptions.ts` if activation defaults or product filtering need alignment
- registry composition files such as `convex/documentDataSources.ts` or `convex/automationRegistry.ts`

Documentation:

- `docs/modules/<module>.md`
- optionally `docs/product-specs/<module>-*.md`

## Manifest template

```ts
import type { ModuleManifest } from "@/modules/types";
import { LayoutDashboard, Settings } from "@/lib/ez-icons";

export const <module>Manifest: ModuleManifest = {
  id: "<module>",
  productKey: "<module>",
  workspaceRoot: "/dashboard/<module>",
  settingsRoots: ["/dashboard/<module>/settings"],
  workspace: {
    id: "<module>",
    icon: LayoutDashboard,
    nameKey: "nav.workspace.<module>",
    descKey: "nav.workspace.<module>Desc",
    href: "/dashboard/<module>",
  },
  primaryNav: [
    {
      labelKey: "nav.<module>.dashboard",
      href: "/dashboard/<module>",
      icon: LayoutDashboard,
    },
    {
      labelKey: "nav.<module>.settings",
      href: "/dashboard/<module>/settings",
      icon: Settings,
    },
  ],
  settingsNav: [
    {
      labelKey: "<module>.settings.general",
      to: "/dashboard/<module>/settings",
    },
  ],
  pageContexts: [
    {
      key: "dashboard",
      titleKey: "nav.<module>.dashboard",
      matches: [{ to: "/dashboard/<module>" }],
      actions: [],
    },
  ],
  fallbackPageContextKey: "dashboard",
};
```

## Schema fragment template

```ts
import { defineTable } from "convex/server";
import { v } from "convex/values";

export function create<ModulePascal>Tables() {
  return {
    <module>Entities: defineTable({
      organizationId: v.id("organizations"),
      name: v.string(),
      status: v.string(),
      createdBy: v.id("users"),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_org", ["organizationId"])
      .index("by_orgAndStatus", ["organizationId", "status"]),
  };
}
```

Then compose it in `convex/schema.ts` together with the other fragment factories.

## Permission feature template

Add stable business-facing feature ids in `convex/_helpers/permissionTypes.ts`.

```ts
export const FEATURES = [
  // existing features...
  "<module>_entities",
  "<module>_settings",
  "<module>_reports",
] as const;
```

Then set defaults in `convex/_helpers/permissions.ts`.

```ts
DEFAULT_PERMISSIONS.member.<module>_entities = {
  view: "all",
  create: "all",
  edit: "own",
  delete: "none",
  approve: "none",
  sign: "none",
};
```

Use backend `checkPermission(...)` and frontend `usePermission(...)` consistently. Do not rely on UI-only gating.

## Product activation checklist

When a module is sellable or toggleable per organization, verify all of the following:

- the manifest `productKey` matches the platform product id
- `platformProducts` contains the module product
- `productSubscriptions` can activate the module for an organization
- `getActiveProducts` returns the product for entitled organizations
- any grace-period fallback does not silently hide the new module
- shell visibility comes only from active products plus registry filtering

## Document data-source template

If the module exposes entities to the shared document system, create `convex/<module>/documentDataSources.ts`.

```ts
import type { DataSourceDefinition } from "../documentDataSources";

const <entity>Source: DataSourceDefinition = {
  key: "<entity>",
  label: "<Entity label>",
  module: "<module>",
  fields: [
    { key: "name", label: "Name", type: "text" },
  ],
  resolve: async (ctx, entityId) => {
    if (!entityId) return {};
    const entity = await ctx.db.get(entityId as any) as any;
    if (!entity) return {};
    return {
      name: entity.name ?? "",
    };
  },
};

export const <MODULE_UPPER>_DATA_SOURCES: DataSourceDefinition[] = [<entity>Source];
```

Then register it in `convex/documentDataSources.ts`.

## Automation event template

If the module should participate in automations, add entries to `convex/automationRegistry.ts`.

```ts
{
  module: "<module>",
  eventType: "<module>.entity.created",
  label: "Entity created",
  entityType: "<module>Entity",
  source: "domain_event",
  samplePayload: {
    organizationId: "org_123",
    entityId: "entity_123",
    name: "Example",
    createdBy: "user_123",
  },
  variables: [
    { key: "entityId", path: "entityId", label: "Entity ID", type: "id", group: "entity" },
    { key: "name", path: "name", label: "Name", type: "string", group: "entity" },
  ],
}
```

Then emit those events from the module’s domain handlers, not from random shared utility code.

## Verification checklist for a new module

A minimal verification pass should confirm all of the following.

The schema composes cleanly and the module’s tables are owned by its fragment. The module appears only when its product is active. Sidebar, workspace switcher, settings nav, and page-context actions come from the manifest. Backend mutations enforce access and permissions. Frontend actions are permission-gated. Shared data-source registration works if applicable. Automation discovery returns the expected event metadata if applicable. Cross-module references are explicit and do not bypass owner domain logic.

## Common mistakes to avoid

Do not hardcode the module into shared shell components instead of using the manifest. Do not let product activation depend on route checks alone. Do not define permission ids around implementation details. Do not expose raw table patch/delete behavior as automation actions. Do not let another module directly own this module’s writes. Do not add module data to shared registries without an explicit owner and contract.

## Example: adding a `magazyn` module

This example shows how a concrete inventory module should be introduced so it works cleanly with CRM, Gabinet, permissions, product activation, shared data, and automations. A dedicated reusable reference version of this example now lives in `docs/modules/magazyn.md`.

### Business scope and ownership

The `magazyn` module should own warehouses, stock items, stock movements, reservations, stock adjustments, and reorder thresholds. It may also own inventory-specific reports such as stock valuation, low-stock queues, and movement history.

It should not own organizations, billing, auth, generic notifications, or the global permission engine. It also should not directly own CRM sales logic or Gabinet appointment lifecycle logic. Instead, it should integrate with those modules through explicit references and events.

A good ownership split for `magazyn` would be:

- module-owned entities: `magazynWarehouses`, `magazynItems`, `magazynStockMovements`, `magazynReservations`
- platform-owned shared surfaces: org access, audit log, notifications, activities, automations, billing/product activation
- cross-module references: optional `appointmentId`, `treatmentId`, `leadId`, `documentInstanceId`, `createdBy`, `organizationId`

### Suggested product and route identity

Use a stable id and product key of `magazyn`.

Suggested route namespace:

- workspace root: `/dashboard/magazyn`
- settings root: `/dashboard/magazyn/settings`

Suggested workspace purpose:

- warehouse dashboard
- items catalog
- stock levels
- reservations and adjustments
- inventory reports

### Suggested manifest shape

A first-pass manifest for `magazyn` should expose:

- workspace: `nav.workspace.magazyn`
- primary nav: dashboard, items, movements, reservations, reports, settings
- settings nav: warehouses, categories, reorder rules, integrations
- page contexts: dashboard, items, movements, reservations, reports

Suggested quick actions:

- add item
- receive stock
- issue stock
- create adjustment
- view low stock

Suggested permission-bound actions:

- `magazyn_items` for item creation/editing
- `magazyn_movements` for posting receipts/issues/adjustments
- `magazyn_reservations` for reservation lifecycle
- `magazyn_reports` for reporting access
- `magazyn_settings` for warehouse configuration

### Suggested permission features

Add stable business-facing feature ids such as:

```ts
"magazyn_items",
"magazyn_movements",
"magazyn_reservations",
"magazyn_reports",
"magazyn_settings",
```

A sensible default model would be:

- owner/admin: full access
- member: view all, create all, edit own or all depending on operational model, delete limited
- viewer: read-only

If the module is used operationally by reception or warehouse staff, `member` may reasonably need `create: all` and `edit: all` on movements while still having no delete rights after posting.

### Suggested schema fragment

A pragmatic first schema could contain:

```ts
magazynWarehouses
magazynItems
magazynStockMovements
magazynReservations
```

Recommended responsibilities:

- `magazynWarehouses`: warehouse identity, code, status, default flags
- `magazynItems`: SKU, name, unit, category, reorder threshold, active flag
- `magazynStockMovements`: receipt/issue/adjustment/reservation_release with source references
- `magazynReservations`: reserved quantity for downstream workflows such as appointments or documents

Important rule: current stock should be derived from movements or maintained by a controlled module-owned projection, not patched ad hoc from other modules.

### Integration with Gabinet

This is likely the most important cross-module integration for `magazyn`.

Good examples:

- a treatment or appointment may reserve consumables through a `magazynReservation`
- completing an appointment may emit a module-owned request or event that results in stock issue posting
- low stock on treatment-critical items may create notifications for staff

Bad example:

- `gabinet/appointments.ts` directly patching `magazynItems.quantity`

The safe pattern is:

- Gabinet emits or calls an inventory adapter with the appointment context
- Magazyn validates stock rules and posts the stock movement itself
- the resulting movement may emit `magazyn.stock_movement.posted`

### Integration with CRM

For CRM, `magazyn` should integrate where inventory is relevant to quotes, deals, products, or fulfillment.

Good examples:

- a won deal may trigger an inventory reservation request
- a document or fulfillment flow may consume stock against a CRM object reference
- CRM product catalog may reference stock items by explicit ids if the business wants unified commercial and physical goods mapping

Again, the owner module should post inventory movements. CRM may request or reference them, but should not own inventory writes.

### Suggested document data sources

If inventory documents are needed, `magazyn` could expose sources such as:

- `warehouse`
- `stock_item`
- `stock_movement`

These could support templates like:

- goods received note
- internal stock issue document
- stock adjustment protocol
- warehouse transfer document

### Suggested automation events

A useful first event set for `magazyn` would be:

```ts
magazyn.item.created
magazyn.item.low_stock
magazyn.stock_movement.posted
magazyn.reservation.created
magazyn.reservation.released
```

Useful payload variables could include:

- `itemId`
- `itemName`
- `sku`
- `warehouseId`
- `warehouseName`
- `quantity`
- `movementType`
- `sourceModule`
- `sourceEntityId`
- `belowThreshold`

These events are immediately valuable for notifications and operations workflows.

### Suggested automation actions

The safest first automation action surface for `magazyn` is small.

Good early actions:

- create notification for responsible staff
- write activity for linked entity context
- create reorder request through a module-owned handler
- update non-critical workflow field through a safe adapter

Avoid exposing raw arbitrary stock mutation through generic automation actions. Inventory is especially sensitive because mistakes affect real-world operations.

### Suggested file checklist for `magazyn`

Frontend:

- `src/modules/magazyn/manifest.ts`
- `src/components/magazyn/...`
- `src/routes/_app/_auth/dashboard/_layout.magazyn.index.tsx`
- `src/routes/_app/_auth/dashboard/_layout.magazyn.items.tsx`
- `src/routes/_app/_auth/dashboard/_layout.magazyn.movements.tsx`
- `src/routes/_app/_auth/dashboard/_layout.magazyn.reservations.tsx`
- `src/routes/_app/_auth/dashboard/_layout.magazyn.settings.*.tsx`

Backend:

- `convex/magazyn/items.ts`
- `convex/magazyn/movements.ts`
- `convex/magazyn/reservations.ts`
- `convex/schema/magazyn.ts`
- optional `convex/magazyn/documentDataSources.ts`

Platform composition points:

- `src/modules/types.ts`
- `src/modules/registry.ts`
- `convex/schema.ts`
- `convex/_helpers/permissionTypes.ts`
- `convex/_helpers/permissions.ts`
- `convex/productSubscriptions.ts`
- `convex/documentDataSources.ts` if document sources are added
- `convex/automationRegistry.ts` if automation events are added

Documentation:

- `docs/modules/magazyn.md`

### Suggested verification for `magazyn`

A focused verification pass should confirm that:

- the module is visible only for orgs with the `magazyn` product
- manifest-driven nav and settings render correctly
- permission gates work for item and movement operations
- stock writes only happen through `magazyn` domain handlers
- Gabinet and CRM integrations create requests/references rather than direct stock patches
- low-stock automation metadata appears in the automation catalog
- document sources resolve correctly if warehouse documents are enabled

### Why `magazyn` is a good reference module

`Magazyn` is a strong example because it touches almost every architectural seam at once: sellable product activation, module shell discovery, operational permissions, cross-module references, event-driven integrations, and automation safety. If the platform can onboard `magazyn` cleanly, the same architecture should scale well to other modules such as recruitment, projects, service desk, or ecommerce operations.

## Summary

The platform is already moving in the right direction. The shared shell is manifest-driven, schema ownership is fragmented, document sources are registry-based, and automation discovery is registry-based. The remaining work is to extend the same declarative model to the rest of the module lifecycle, especially permission metadata, product activation metadata, configuration sections, and bridge/event registration.

That is the path to making modules truly easy to add, easy to configure, easy to permission, and safe to integrate across the whole product.
