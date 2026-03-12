# Module Boundaries

Do not cross-import Gabinet code from CRM code or CRM code from Gabinet code.

If functionality is truly shared, move it to a neutral shared or platform layer instead of importing across module boundaries.

Gabinet UI should reuse generic UI or platform primitives, not CRM-specific presentation components unless they already live in a shared layer.

If a requested change appears to require a cross-module import, redesign around a shared helper in a platform layer, minimal duplicated module-local logic, or higher-level composition rather than direct module-to-module imports.
