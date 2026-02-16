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
  "gabinetDocument",
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
