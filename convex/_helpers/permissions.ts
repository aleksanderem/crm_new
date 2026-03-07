import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { verifyOrgAccess, requireUser } from "./auth";
import { OrgRole } from "../schema";
import {
  FEATURES,
  ACTIONS,
  type Feature,
  type Action,
  type Scope,
  type PermissionResult,
  type FeaturePermissions,
} from "./permissionTypes";

export type { Feature, Action, Scope, PermissionResult, FeaturePermissions };

const ALL_FEATURES: readonly Feature[] = FEATURES;

// --- Default permissions builder ---

function buildDefaults(scope: Record<Action, Scope>): FeaturePermissions {
  const result = {} as FeaturePermissions;
  for (const feature of ALL_FEATURES) {
    result[feature] = { ...scope };
  }
  return result;
}

export const DEFAULT_PERMISSIONS: Record<OrgRole, FeaturePermissions> = {
  owner: buildDefaults({ view: "all", create: "all", edit: "all", delete: "all", approve: "none", sign: "none" }),
  admin: buildDefaults({ view: "all", create: "all", edit: "all", delete: "all", approve: "none", sign: "none" }),
  member: buildDefaults({ view: "all", create: "all", edit: "own", delete: "own", approve: "none", sign: "none" }),
  viewer: buildDefaults({ view: "all", create: "none", edit: "none", delete: "none", approve: "none", sign: "none" }),
};

// --- Per-feature overrides for document_templates ---
// owner/admin: all actions allowed (approve/sign not applicable to templates)
// member: view only (no create/edit/delete)
// viewer: view only
DEFAULT_PERMISSIONS.member.document_templates = {
  view: "all", create: "none", edit: "none", delete: "none", approve: "none", sign: "none",
};

// --- Per-feature overrides for document_instances ---
// owner/admin: all actions allowed
DEFAULT_PERMISSIONS.owner.document_instances = {
  view: "all", create: "all", edit: "all", delete: "all", approve: "all", sign: "all",
};
DEFAULT_PERMISSIONS.admin.document_instances = {
  view: "all", create: "all", edit: "all", delete: "all", approve: "all", sign: "all",
};
// member: view, create, edit, sign; NO approve or delete
DEFAULT_PERMISSIONS.member.document_instances = {
  view: "all", create: "all", edit: "own", delete: "none", approve: "none", sign: "all",
};
// viewer: view only
DEFAULT_PERMISSIONS.viewer.document_instances = {
  view: "all", create: "none", edit: "none", delete: "none", approve: "none", sign: "none",
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
      const mergedActions = {} as Record<Action, Scope>;
      for (const action of ACTIONS) {
        mergedActions[action] = overrideActions[action] ?? defaultActions[action];
      }
      merged[feature] = mergedActions;
    } else {
      merged[feature] = { ...defaultActions };
    }
  }

  return merged;
}
