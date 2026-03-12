# Frontend

Frontend code is organized by module and by layer.

Shared primitives live under `src/components/ui/`, `src/components/base/`, and other neutral component folders. Module-owned presentation should stay under `src/components/crm/` or `src/components/gabinet/`. Routes follow the TanStack file-based structure under `src/routes/_app/_auth/dashboard/`.

When documenting frontend work, prefer to capture stable UI rules in `docs/automation/rules/ui/`, product intent in `docs/product-specs/`, and implementation-specific execution steps in `docs/exec-plans/`.

For Gabinet work, align visible status models with backend truth, route all user-facing strings through i18n, and reuse existing appointment surfaces before creating parallel flows.
