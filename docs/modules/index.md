# Module docs index

This directory is the documentation navigation hub for platform and module ownership.

## Start here

If you are adding or changing a module, read these files in this order:

- `module-onboarding.md` — end-to-end process for adding a new module safely
- `platform-core.md` — platform-owned concerns and shared boundaries
- `<module>.md` — the module-specific ownership and integration reference

## Current module references

- `crm.md` — CRM ownership and integration context
- `gabinet.md` — Gabinet ownership and integration context
- `magazyn.md` — inventory-module reference blueprint for a future module

## Supporting references

- `module-onboarding.md` — reusable onboarding architecture, templates, and checklists
- `platform-core.md` — shared platform responsibilities

## Suggested reading paths

For a brand new module, start with `module-onboarding.md`, then `platform-core.md`, then use `magazyn.md` as the concrete example blueprint.

For work inside an existing module, start with that module file (`crm.md` or `gabinet.md`) and return to `module-onboarding.md` when you need the cross-module integration rules.
