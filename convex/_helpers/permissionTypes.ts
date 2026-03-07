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
  "gabinet_patients",
  "gabinet_appointments",
  "gabinet_treatments",
  "gabinet_packages",
  "gabinet_employees",
  "settings",
  "team",
  "document_templates",
  "document_instances",
] as const;

export const ACTIONS = ["view", "create", "edit", "delete", "approve", "sign"] as const;

export const SCOPES = ["none", "own", "all"] as const;

export type Feature = (typeof FEATURES)[number];
export type Action = (typeof ACTIONS)[number];
export type Scope = (typeof SCOPES)[number];

export type PermissionResult = { allowed: boolean; scope: Scope };
export type FeaturePermissions = Record<Feature, Record<Action, Scope>>;
