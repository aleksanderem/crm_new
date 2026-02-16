/**
 * CRM Module Registry
 *
 * Declares the entity types and navigation entries that CRM contributes.
 */

export const CRM_MODULE_ID = "crm";

export const CRM_ENTITY_TYPES = [
  "lead",
  "pipeline",
  "product",
  "call",
] as const;

export const CRM_ACTIVITY_TYPES = [
  { key: "call", name: "Call", icon: "phone", color: "#3b82f6", isSystem: true },
  { key: "meeting", name: "Meeting", icon: "clock", color: "#a855f7", isSystem: true },
  { key: "email", name: "Email", icon: "mail", color: "#22c55e", isSystem: true },
  { key: "task", name: "Task", icon: "check-circle", color: "#f97316", isSystem: true },
] as const;

export const CRM_NAVIGATION = [
  { label: "sidebar.dashboard", href: "/dashboard", icon: "home-09" },
  { label: "sidebar.contacts", href: "/dashboard/contacts", icon: "user-group" },
  { label: "sidebar.companies", href: "/dashboard/companies", icon: "building-06" },
  { label: "sidebar.leads", href: "/dashboard/leads", icon: "trending-up" },
  { label: "sidebar.pipelines", href: "/dashboard/pipelines", icon: "git-branch" },
  { label: "sidebar.activities", href: "/dashboard/activities", icon: "calendar-03" },
  { label: "sidebar.calls", href: "/dashboard/calls", icon: "phone-01" },
  { label: "sidebar.documents", href: "/dashboard/documents", icon: "file-02" },
  { label: "sidebar.products", href: "/dashboard/products", icon: "package" },
  { label: "sidebar.inbox", href: "/dashboard/inbox", icon: "mail-01" },
] as const;

export const CRM_PRODUCT_ID = "crm";
