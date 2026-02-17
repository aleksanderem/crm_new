import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { verifyOrgAccess, requireUser } from "./auth";
import { OrgRole } from "../schema";

// --- Types ---

export type Feature =
  | "leads" | "contacts" | "companies" | "documents" | "activities"
  | "calls" | "email" | "products" | "pipelines"
  | "gabinet_patients" | "gabinet_appointments" | "gabinet_treatments"
  | "gabinet_packages" | "gabinet_employees"
  | "settings" | "team";

export type Action = "view" | "create" | "edit" | "delete";
export type Scope = "none" | "own" | "all";
export type PermissionResult = { allowed: boolean; scope: Scope };

type FeaturePermissions = Record<Feature, Record<Action, Scope>>;

// --- All features list ---

const ALL_FEATURES: Feature[] = [
  "leads", "contacts", "companies", "documents", "activities",
  "calls", "email", "products", "pipelines",
  "gabinet_patients", "gabinet_appointments", "gabinet_treatments",
  "gabinet_packages", "gabinet_employees",
  "settings", "team",
];

// --- Default permissions builder ---

function buildDefaults(scope: Record<Action, Scope>): FeaturePermissions {
  const result = {} as FeaturePermissions;
  for (const feature of ALL_FEATURES) {
    result[feature] = { ...scope };
  }
  return result;
}

export const DEFAULT_PERMISSIONS: Record<OrgRole, FeaturePermissions> = {
  owner: buildDefaults({ view: "all", create: "all", edit: "all", delete: "all" }),
  admin: buildDefaults({ view: "all", create: "all", edit: "all", delete: "all" }),
  member: buildDefaults({ view: "all", create: "all", edit: "own", delete: "own" }),
  viewer: buildDefaults({ view: "all", create: "none", edit: "none", delete: "none" }),
};

// --- checkPermission ---

export async function checkPermission(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"organizations">,
  feature: Feature,
  action: Action,
): Promise<PermissionResult> {
  const { membership } = await verifyOrgAccess(ctx, orgId);
  const role = membership.role as OrgRole;

  if (role === "owner" || role === "admin") {
    return { allowed: true, scope: "all" };
  }

  // Look for org-level permission override
  const override = await ctx.db
    .query("orgPermissions")
    .withIndex("by_orgAndRole", (q) => q.eq("organizationId", orgId).eq("role", role))
    .unique();

  let scope: Scope;
  if (override) {
    const perms = override.permissions as FeaturePermissions;
    scope = perms?.[feature]?.[action] ?? DEFAULT_PERMISSIONS[role][feature][action];
  } else {
    scope = DEFAULT_PERMISSIONS[role][feature][action];
  }

  return { allowed: scope !== "none", scope };
}

// --- checkResourceAccess ---

export async function checkResourceAccess(
  ctx: QueryCtx | MutationCtx,
  resourceType: string,
  resourceId: string,
): Promise<{ allowed: boolean; accessLevel: "viewer" | "editor" | null }> {
  const user = await requireUser(ctx);

  const invites = await ctx.db
    .query("resourceInvites")
    .withIndex("by_resource", (q) =>
      q.eq("resourceType", resourceType).eq("resourceId", resourceId)
    )
    .collect();

  const match = invites.find(
    (inv) => inv.status === "accepted" && inv.userId === user._id
  );

  if (!match) {
    return { allowed: false, accessLevel: null };
  }

  return { allowed: true, accessLevel: match.accessLevel };
}

// --- getEffectivePermissions ---

export async function getEffectivePermissions(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"organizations">,
): Promise<FeaturePermissions> {
  const { membership } = await verifyOrgAccess(ctx, orgId);
  const role = membership.role as OrgRole;

  if (role === "owner" || role === "admin") {
    return DEFAULT_PERMISSIONS[role];
  }

  const override = await ctx.db
    .query("orgPermissions")
    .withIndex("by_orgAndRole", (q) => q.eq("organizationId", orgId).eq("role", role))
    .unique();

  if (!override) {
    return DEFAULT_PERMISSIONS[role];
  }

  // Merge: override takes precedence, defaults fill gaps
  const defaults = DEFAULT_PERMISSIONS[role];
  const overridePerms = override.permissions as Partial<FeaturePermissions>;
  const merged = {} as FeaturePermissions;

  for (const feature of ALL_FEATURES) {
    const defaultActions = defaults[feature];
    const overrideActions = overridePerms?.[feature];
    if (overrideActions) {
      merged[feature] = {
        view: overrideActions.view ?? defaultActions.view,
        create: overrideActions.create ?? defaultActions.create,
        edit: overrideActions.edit ?? defaultActions.edit,
        delete: overrideActions.delete ?? defaultActions.delete,
      };
    } else {
      merged[feature] = { ...defaultActions };
    }
  }

  return merged;
}
