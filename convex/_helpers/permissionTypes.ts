/**
 * Shared permission type constants used by both backend (Convex) and frontend.
 * Single source of truth — import these instead of duplicating type definitions.
 */

export const FEATURES = [
  "leads",
  "contacts",
  "companies",
  "documents",
  "activities",
  "calls",
  "email",
  "products",
  "pipelines",
  "gabinet_dashboard",
  "gabinet_patients",
  "gabinet_appointments",
  "gabinet_treatments",
  "gabinet_packages",
  "gabinet_employees",
  "gabinet_payments",
  "gabinet_receipts",
  "gabinet_reports",
  "gabinet_financial_reports",
  "gabinet_purchase_prices",
  "gabinet_photos",
  "gabinet_online_booking",
  "gabinet_inventory",
  "gabinet_settings",
  "settings",
  "team",
  "document_templates",
  "document_instances",
  "tagDefinitions",
  "categoryDefinitions",
] as const;

export const ACTIONS = ["view", "create", "edit", "delete", "approve", "sign", "refund"] as const;

export const SCOPES = ["none", "own", "all"] as const;

export type Feature = (typeof FEATURES)[number];
export type Action = (typeof ACTIONS)[number];
export type Scope = (typeof SCOPES)[number];

export type PermissionResult = { allowed: boolean; scope: Scope };
export type FeaturePermissions = Record<Feature, Record<Action, Scope>>;
