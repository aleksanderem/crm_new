/**
 * Gabinet Module Registry
 *
 * Declares the entity types, activity types, navigation entries,
 * and calendar renderers that this module contributes to the platform.
 */

export const GABINET_MODULE_ID = "gabinet";

/** Entity types this module owns */
export const GABINET_ENTITY_TYPES = [
  "gabinetPatient",
  "gabinetTreatment",
  "gabinetAppointment",
  "gabinetPackage",
  "gabinetEmployee",
] as const;

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

/** Navigation entries for the sidebar */
export const GABINET_NAVIGATION = [
  { label: "sidebar.gabinet.dashboard", href: "/dashboard/gabinet", icon: "stethoscope-02" },
  { label: "sidebar.gabinet.patients", href: "/dashboard/gabinet/patients", icon: "user-group" },
  { label: "sidebar.gabinet.calendar", href: "/dashboard/gabinet/calendar", icon: "calendar-03" },
  { label: "sidebar.gabinet.treatments", href: "/dashboard/gabinet/treatments", icon: "medicine-02" },
  { label: "sidebar.gabinet.employees", href: "/dashboard/gabinet/employees", icon: "user-multiple-02" },
  { label: "sidebar.gabinet.packages", href: "/dashboard/gabinet/packages", icon: "package" },
  { label: "sidebar.gabinet.documents", href: "/dashboard/gabinet/documents", icon: "file-02" },
  { label: "sidebar.gabinet.reports", href: "/dashboard/gabinet/reports", icon: "chart-line-data-01" },
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
