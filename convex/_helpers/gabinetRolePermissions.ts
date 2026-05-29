/**
 * Gabinet-role permission defaults + helpers.
 *
 * Gabinet uses TWO independent role axes:
 *   - org-role  (owner/admin/member/viewer)   — global app permissions
 *   - gabinet-role (doctor/nurse/…/custom)    — within-Gabinet permissions
 *
 * Effective permission for a gabinet_* feature/action is:
 *   max(orgRoleScope, gabinetRoleScope)   with order none < own < all
 *
 * This file ships the BAKED-IN defaults per system gabinet-role (so a fresh
 * org gets sensible behavior without UI configuration), plus the helpers
 * used by `authAction.checkPermission` and the settings UI.
 */

import type { Feature, Action, Scope, FeaturePermissions } from "./permissionTypes";

export type SystemGabinetRole =
  | "doctor"
  | "nurse"
  | "therapist"
  | "receptionist"
  | "admin"
  | "other";

export const SYSTEM_GABINET_ROLES: readonly SystemGabinetRole[] = [
  "doctor",
  "nurse",
  "therapist",
  "receptionist",
  "admin",
  "other",
];

// Build a partial feature-permission record covering only gabinet_* features.
// Non-gabinet features intentionally stay "none" — gabinet-role doesn't grant
// anything outside its module; org-role still owns those.
function buildGabinet(
  perms: Partial<Record<Extract<Feature, `gabinet_${string}`>, Partial<Record<Action, Scope>>>>,
): FeaturePermissions {
  const empty: Record<Action, Scope> = {
    view: "none",
    create: "none",
    edit: "none",
    delete: "none",
    approve: "none",
    sign: "none",
  };
  const result = {} as FeaturePermissions;
  // Every feature defaults to all-none, so MAX-merge with org-role is a no-op
  // for features this role doesn't speak to.
  for (const f of [
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
    "gabinet_settings",
    "settings",
    "team",
    "document_templates",
    "document_instances",
    "tagDefinitions",
    "categoryDefinitions",
  ] as const) {
    result[f as Feature] = { ...empty };
  }
  for (const [feature, actions] of Object.entries(perms)) {
    result[feature as Feature] = { ...empty, ...(actions ?? {}) };
  }
  return result;
}

// --- Defaults per system gabinet-role ---
//
// Mental model:
//   - clinical (doctor / nurse / therapist): can see + serve patients, manage own appointments,
//     read everything else but don't touch treatments catalog or settings
//   - receptionist: scheduling control — full appointment power, patient intake
//   - admin (gabinet admin): full gabinet, no leak into CRM/settings outside gabinet_settings
//   - other: read-only fallback

export const DEFAULT_GABINET_ROLE_PERMISSIONS: Record<SystemGabinetRole, FeaturePermissions> = {
  doctor: buildGabinet({
    gabinet_patients: { view: "all", create: "all", edit: "own" },
    gabinet_appointments: { view: "all", create: "all", edit: "own", delete: "own" },
    gabinet_treatments: { view: "all" },
    gabinet_packages: { view: "all" },
    gabinet_employees: { view: "all" },
    gabinet_settings: {},
  }),
  therapist: buildGabinet({
    gabinet_patients: { view: "all", create: "all", edit: "own" },
    gabinet_appointments: { view: "all", create: "all", edit: "own", delete: "own" },
    gabinet_treatments: { view: "all" },
    gabinet_packages: { view: "all" },
    gabinet_employees: { view: "all" },
    gabinet_settings: {},
  }),
  nurse: buildGabinet({
    gabinet_patients: { view: "all", create: "all", edit: "own" },
    gabinet_appointments: { view: "all", create: "all", edit: "own" },
    gabinet_treatments: { view: "all" },
    gabinet_packages: { view: "all" },
    gabinet_employees: { view: "all" },
    gabinet_settings: {},
  }),
  receptionist: buildGabinet({
    gabinet_patients: { view: "all", create: "all", edit: "all" },
    gabinet_appointments: { view: "all", create: "all", edit: "all", delete: "all" },
    gabinet_treatments: { view: "all" },
    gabinet_packages: { view: "all" },
    gabinet_employees: { view: "all" },
    gabinet_settings: {},
  }),
  admin: buildGabinet({
    gabinet_patients: { view: "all", create: "all", edit: "all", delete: "all" },
    gabinet_appointments: { view: "all", create: "all", edit: "all", delete: "all" },
    gabinet_treatments: { view: "all", create: "all", edit: "all", delete: "all" },
    gabinet_packages: { view: "all", create: "all", edit: "all", delete: "all" },
    gabinet_employees: { view: "all", create: "all", edit: "all", delete: "all" },
    gabinet_settings: { view: "all", create: "all", edit: "all", delete: "all" },
  }),
  other: buildGabinet({
    gabinet_patients: { view: "all" },
    gabinet_appointments: { view: "all" },
    gabinet_treatments: { view: "all" },
    gabinet_packages: { view: "all" },
    gabinet_employees: { view: "all" },
    gabinet_settings: {},
  }),
};

export const SYSTEM_GABINET_ROLE_LABELS: Record<
  SystemGabinetRole,
  { pl: string; en: string; color: string; isClinical: boolean }
> = {
  doctor: { pl: "Lekarz", en: "Doctor", color: "#3b82f6", isClinical: true },
  nurse: { pl: "Pielęgniarka", en: "Nurse", color: "#22c55e", isClinical: true },
  therapist: { pl: "Terapeuta", en: "Therapist", color: "#8b5cf6", isClinical: true },
  receptionist: { pl: "Recepcjonista", en: "Receptionist", color: "#f59e0b", isClinical: false },
  admin: { pl: "Administrator", en: "Admin", color: "#ef4444", isClinical: false },
  other: { pl: "Inny", en: "Other", color: "#6b7280", isClinical: false },
};

// --- Scope arithmetic ---

const SCOPE_RANK: Record<Scope, number> = { none: 0, own: 1, all: 2 };

export function maxScope(a: Scope, b: Scope): Scope {
  return SCOPE_RANK[a] >= SCOPE_RANK[b] ? a : b;
}

export function isSystemGabinetRole(role: string): role is SystemGabinetRole {
  return (SYSTEM_GABINET_ROLES as readonly string[]).includes(role);
}

/** Default scope for a single (gabinetRole, feature, action). Returns "none"
 *  for custom (non-system) roles — admin must opt them in via the UI. */
export function defaultGabinetScope(
  gabinetRole: string,
  feature: Feature,
  action: Action,
): Scope {
  if (!isSystemGabinetRole(gabinetRole)) return "none";
  return (
    DEFAULT_GABINET_ROLE_PERMISSIONS[gabinetRole]?.[feature]?.[action] ?? "none"
  );
}
