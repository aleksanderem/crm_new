# Platform Core — module context

This file gives any agent enough context to work on platform-level (horizontal) code without reading the entire codebase.

## Ownership

Platform core owns: auth, organizations, team memberships, RBAC, billing, notifications, audit log, custom fields, global search, activity timeline, document system, email integration.

## Key files

- convex/schema.ts — full database schema
- convex/permissions.ts — RBAC logic (checkPermission, verifyOrgAccess)
- convex/_helpers/seatLimits.ts — seat limit helper
- convex/documentTemplates.ts — template CRUD
- convex/documentTemplateFields.ts — template field CRUD
- convex/documentInstances.ts — document instance lifecycle (create, updateDraft, updateStatus, sign, createFromFile)
- convex/documentDataSources.ts — data source registry (system, current_user, org sources)
- convex/search.ts — global multi-entity search
- convex/activities.ts — activity timeline
- convex/notifications.ts — in-app notifications
- convex/auditLog.ts — audit trail
- src/components/org-context.tsx — useOrganization() hook
- src/components/layout/app-sidebar.tsx — main navigation
- src/components/documents/ — document system UI components

## Patterns to follow

Every mutation must call verifyOrgAccess(ctx, orgId) first. Permission-sensitive operations must also call checkPermission(ctx, orgId, feature, action). All tables have organizationId field.

New horizontal features go in convex/ root (not in convex/crm/ or convex/gabinet/). UI components shared across modules go in src/components/ (not in crm/ or gabinet/ subdirs).

## Document system architecture

Two document types coexist in documentInstances table: type="template" (created from documentTemplates with field values and rendered HTML) and type="file" (uploaded files with storage reference). Both share the same status workflow: draft -> pending_review -> approved -> pending_signature -> signed -> archived.

Data source registry: modules register their data sources in convex/{module}/documentDataSources.ts. Sources are resolved at document creation time. Template fields can bind to source fields for auto-fill.

## What users need from platform

- Consistent navigation and sidebar across modules
- Unified document management (templates + files + signing + PDF)
- Cross-module search (find anything from search bar)
- Activity timeline that aggregates events from all modules
- Notifications for workflow events (review requested, signature needed)
- Team management with role-based access
