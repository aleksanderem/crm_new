/**
 * Gabinet Module Registry
 *
 * Backend-only constants for subscription gating and seeding.
 * Navigation and entity metadata live in src/modules/gabinet/manifest.ts
 * (the single source of truth for module structure).
 */

/** Activity types this module contributes to the shared calendar */
export const GABINET_ACTIVITY_TYPES = [
  {
    key: "gabinet:appointment",
    name: "Wizyta",
    icon: "stethoscope",
    color: "#7C6AE8",
    isSystem: true,
  },
] as const;

/** Product ID for subscription gating */
export const GABINET_PRODUCT_ID = "gabinet";

/**
 * Catalog mapping every gateable gabinet sub-module to the product ID whose
 * active subscription grants access.  All standard features ship with the base
 * "gabinet" plan.  Add-on features that require a separate purchase can point
 * to a distinct product ID (e.g. "gabinet_online_booking") without changing
 * call-sites — callers just pass the module name.
 */
export const GABINET_MODULES = {
  dashboard:      "gabinet",
  patients:       "gabinet",
  appointments:   "gabinet",
  treatments:     "gabinet",
  packages:       "gabinet",
  employees:      "gabinet",
  documents:      "gabinet",
  reports:        "gabinet",
  payments:       "gabinet",
  loyalty:        "gabinet",
  scheduling:     "gabinet",
  locations:      "gabinet",
  equipment:      "gabinet",
  inventory:      "gabinet",
  online_booking: "gabinet",
  settings:       "gabinet",
} as const satisfies Record<string, string>;

export type GabinetModule = keyof typeof GABINET_MODULES;
