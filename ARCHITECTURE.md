# Architecture

This file is the top-level map of how the CRM + Gabinet platform is put together and where the durable design knowledge lives.

## System shape

The product is a horizontal multi-tenant platform with a shared platform core and separate vertical modules. Platform concerns such as organizations, auth, billing, RBAC, notifications, and audit logging are shared. Business workflows then live in module-owned slices such as CRM and Gabinet.

The repo therefore has three architectural layers.

The first layer is the platform layer. It owns organization context, permissions, subscriptions, notifications, audit history, and other cross-cutting primitives.

The second layer is the module layer. CRM and Gabinet each own their routes, components, Convex modules, and user workflows. Module logic should stay module-local unless it is truly generic enough to move into a neutral shared layer.

The third layer is the delivery layer. `AGENTS.md`, `WORKFLOW.md`, `CLAUDE.md`, and `docs/automation/` define how humans and autonomous agents should work in the repository.

## Source-of-truth files

Use these files as the primary map before exploring deeper:

- `AGENTS.md` for agent operating behavior in this workspace.
- `CLAUDE.md` for repository rules and task tracking.
- `WORKFLOW.md` for the Symphony pilot delivery contract.
- `convex/schema.ts` for persistent data model truth.
- `docs/modules/index.md` for the navigation hub across module docs.
- `docs/modules/platform-core.md`, `docs/modules/crm.md`, `docs/modules/gabinet.md`, `docs/modules/module-onboarding.md`, and `docs/modules/magazyn.md` for module ownership, onboarding rules, and the concrete inventory-module reference blueprint.
- `docs/design-docs/` for durable design beliefs and architecture rationale.
- `docs/product-specs/` for user/problem-oriented feature specs.
- `docs/exec-plans/` for implementation plans and tech debt tracking.
- `docs/generated/` for machine-derived reference docs.
- `docs/references/` for lightweight LLM-friendly reference notes.

## Current migration stance

This repository already contains valuable legacy docs under `docs/`. They remain valid while the documentation system is being reorganized. New durable knowledge should prefer the structure above, and older docs should be linked or migrated gradually rather than copied blindly.
