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
import { defaultGabinetScope, maxScope } from "./gabinetRolePermissions";

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
  owner: buildDefaults({ view: "all", create: "all", edit: "all", delete: "all", approve: "none", sign: "none", refund: "none" }),
  admin: buildDefaults({ view: "all", create: "all", edit: "all", delete: "all", approve: "none", sign: "none", refund: "none" }),
  member: buildDefaults({ view: "all", create: "all", edit: "own", delete: "own", approve: "none", sign: "none", refund: "none" }),
  viewer: buildDefaults({ view: "all", create: "none", edit: "none", delete: "none", approve: "none", sign: "none", refund: "none" }),
};

// --- Per-feature overrides for gabinet_payments ---
// owner/admin: full incl. refund; member: view/create/edit (no delete, no
// refund — recepcja); viewer: view only. Issue #1690.
DEFAULT_PERMISSIONS.owner.gabinet_payments = {
  view: "all", create: "all", edit: "all", delete: "all", approve: "none", sign: "none", refund: "all",
};
DEFAULT_PERMISSIONS.admin.gabinet_payments = {
  view: "all", create: "all", edit: "all", delete: "all", approve: "none", sign: "none", refund: "all",
};
DEFAULT_PERMISSIONS.member.gabinet_payments = {
  view: "all", create: "all", edit: "all", delete: "none", approve: "none", sign: "none", refund: "none",
};
DEFAULT_PERMISSIONS.viewer.gabinet_payments = {
  view: "all", create: "none", edit: "none", delete: "none", approve: "none", sign: "none", refund: "none",
};

// --- Per-feature overrides for gabinet_reports ---
// owner/admin: all (default). member: view only (reports are read-only).
// viewer: no access by default — financial summaries are sensitive.
DEFAULT_PERMISSIONS.member.gabinet_reports = {
  view: "all", create: "none", edit: "none", delete: "none", approve: "none", sign: "none", refund: "none",
};
DEFAULT_PERMISSIONS.viewer.gabinet_reports = {
  view: "none", create: "none", edit: "none", delete: "none", approve: "none", sign: "none", refund: "none",
};

// --- Per-feature overrides for gabinet_financial_reports ---
// More sensitive than general reports — revenue/financial summaries.
// member: no access; viewer: no access. Gabinet-role max-merge grants access
// to manager/admin gabinet roles.
DEFAULT_PERMISSIONS.member.gabinet_financial_reports = {
  view: "none", create: "none", edit: "none", delete: "none", approve: "none", sign: "none", refund: "none",
};
DEFAULT_PERMISSIONS.viewer.gabinet_financial_reports = {
  view: "none", create: "none", edit: "none", delete: "none", approve: "none", sign: "none", refund: "none",
};

// --- Per-feature overrides for gabinet_purchase_prices ---
// Cost/purchase prices for treatments and products — sensitive margin data.
// member: no access; viewer: no access.
DEFAULT_PERMISSIONS.member.gabinet_purchase_prices = {
  view: "none", create: "none", edit: "none", delete: "none", approve: "none", sign: "none", refund: "none",
};
DEFAULT_PERMISSIONS.viewer.gabinet_purchase_prices = {
  view: "none", create: "none", edit: "none", delete: "none", approve: "none", sign: "none", refund: "none",
};

// --- Per-feature overrides for gabinet_online_booking ---
// Online booking configuration — like settings, not exposed to general members.
// member: no access; viewer: no access.
DEFAULT_PERMISSIONS.member.gabinet_online_booking = {
  view: "none", create: "none", edit: "none", delete: "none", approve: "none", sign: "none", refund: "none",
};
DEFAULT_PERMISSIONS.viewer.gabinet_online_booking = {
  view: "none", create: "none", edit: "none", delete: "none", approve: "none", sign: "none", refund: "none",
};

// --- Per-feature overrides for document_templates ---
// owner/admin: all actions allowed (approve/sign not applicable to templates)
// member: view only (no create/edit/delete)
// viewer: view only
DEFAULT_PERMISSIONS.member.document_templates = {
  view: "all", create: "none", edit: "none", delete: "none", approve: "none", sign: "none", refund: "none",
};

// --- Per-feature overrides for document_instances ---
// owner/admin: all actions allowed
DEFAULT_PERMISSIONS.owner.document_instances = {
  view: "all", create: "all", edit: "all", delete: "all", approve: "all", sign: "all", refund: "none",
};
DEFAULT_PERMISSIONS.admin.document_instances = {
  view: "all", create: "all", edit: "all", delete: "all", approve: "all", sign: "all", refund: "none",
};
// member: view, create, edit, sign; NO approve or delete
DEFAULT_PERMISSIONS.member.document_instances = {
  view: "all", create: "all", edit: "own", delete: "none", approve: "none", sign: "all", refund: "none",
};
// viewer: view only
DEFAULT_PERMISSIONS.viewer.document_instances = {
  view: "all", create: "none", edit: "none", delete: "none", approve: "none", sign: "none", refund: "none",
};

// --- Per-feature overrides for tagDefinitions ---
// member: create only (no edit/delete)
DEFAULT_PERMISSIONS.member.tagDefinitions = {
  view: "all", create: "all", edit: "none", delete: "none", approve: "none", sign: "none", refund: "none",
};
// viewer: no CRUD
DEFAULT_PERMISSIONS.viewer.tagDefinitions = {
  view: "all", create: "none", edit: "none", delete: "none", approve: "none", sign: "none", refund: "none",
};

// --- Per-feature overrides for categoryDefinitions ---
// member: create only (no edit/delete)
DEFAULT_PERMISSIONS.member.categoryDefinitions = {
  view: "all", create: "all", edit: "none", delete: "none", approve: "none", sign: "none", refund: "none",
};
// viewer: no CRUD
DEFAULT_PERMISSIONS.viewer.categoryDefinitions = {
  view: "all", create: "none", edit: "none", delete: "none", approve: "none", sign: "none", refund: "none",
};

// --- checkPermission ---

export async function checkPermission(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"organizations">,
  feature: Feature,
  action: Action,
): Promise<PermissionResult> {
  const { user, membership } = await verifyOrgAccess(ctx, orgId);
  const role = membership.role as OrgRole;

  if (role === "owner" || role === "admin") {
    return { allowed: true, scope: "all" };
  }

  // Look for org-level permission override
  const override = await ctx.db
    .query("orgPermissions")
    .withIndex("by_orgAndRole", (q) => q.eq("organizationId", orgId).eq("role", role))
    .unique();

  let orgScope: Scope;
  if (override) {
    const perms = override.permissions as FeaturePermissions;
    orgScope = perms?.[feature]?.[action] ?? DEFAULT_PERMISSIONS[role][feature][action];
  } else {
    orgScope = DEFAULT_PERMISSIONS[role][feature][action];
  }

  // MAX-merge gabinet-role permissions for gabinet_* features, mirroring
  // authAction.checkPermission so mutation/query enforcement matches action enforcement.
  let effectiveScope: Scope = orgScope;
  if (feature.startsWith("gabinet_")) {
    const gabinetMembership = await ctx.db
      .query("gabinetMemberships")
      .withIndex("by_orgAndUser", (q) =>
        q.eq("organizationId", orgId).eq("userId", user._id),
      )
      .unique();
    if (gabinetMembership && gabinetMembership.isActive) {
      const gRole = gabinetMembership.gabinetRole;
      const gOverride = await ctx.db
        .query("gabinetRolePermissions")
        .withIndex("by_orgAndRole", (q) =>
          q.eq("organizationId", orgId).eq("gabinetRole", gRole),
        )
        .unique();
      const gabinetScope: Scope = gOverride
        ? ((gOverride.permissions as Record<string, Record<string, string>>)?.[feature]?.[action]
            ?? defaultGabinetScope(gRole, feature, action)) as Scope
        : defaultGabinetScope(gRole, feature, action);
      effectiveScope = maxScope(orgScope, gabinetScope);

      // Layer 3: per-employee overrides (REPLACE semantics — allows both
      // elevation and restriction relative to the role-derived scope)
      const membershipOverride = await ctx.db
        .query("gabinetMembershipPermissions")
        .withIndex("by_orgAndUser", (q) =>
          q.eq("organizationId", orgId).eq("userId", user._id),
        )
        .unique();
      if (membershipOverride) {
        const mPerms = membershipOverride.permissions as Record<string, Record<string, string>>;
        const membershipScope = mPerms?.[feature]?.[action];
        if (membershipScope !== undefined) {
          effectiveScope = membershipScope as Scope;
        }
      }
    }
  }

  return { allowed: effectiveScope !== "none", scope: effectiveScope };
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
  const { membership, user } = await verifyOrgAccess(ctx, orgId);
  const role = membership.role as OrgRole;

  if (role === "owner" || role === "admin") {
    return DEFAULT_PERMISSIONS[role];
  }

  const override = await ctx.db
    .query("orgPermissions")
    .withIndex("by_orgAndRole", (q) => q.eq("organizationId", orgId).eq("role", role))
    .unique();

  // Build org-role base permissions (override fills gaps with defaults)
  const defaults = DEFAULT_PERMISSIONS[role];
  const overridePerms = override ? (override.permissions as Partial<FeaturePermissions>) : undefined;
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

  // MAX-merge gabinet-role permissions for gabinet_* features, mirroring the
  // logic in authAction.checkPermission so frontend gates match backend enforcement.
  const gabinetMembership = await ctx.db
    .query("gabinetMemberships")
    .withIndex("by_orgAndUser", (q) =>
      q.eq("organizationId", orgId).eq("userId", user._id),
    )
    .unique();

  if (gabinetMembership && gabinetMembership.isActive) {
    const gRole = gabinetMembership.gabinetRole;
    const gOverride = await ctx.db
      .query("gabinetRolePermissions")
      .withIndex("by_orgAndRole", (q) =>
        q.eq("organizationId", orgId).eq("gabinetRole", gRole),
      )
      .unique();
    const gPerms = gOverride ? (gOverride.permissions as Partial<FeaturePermissions>) : undefined;

    for (const feature of ALL_FEATURES) {
      if (!feature.startsWith("gabinet_")) continue;
      const mergedActions = { ...merged[feature] };
      for (const action of ACTIONS) {
        const gabinetScope: Scope = gPerms?.[feature as Feature]?.[action]
          ?? defaultGabinetScope(gRole, feature as Feature, action);
        mergedActions[action] = maxScope(mergedActions[action], gabinetScope);
      }
      merged[feature] = mergedActions;
    }

    // Layer 3: per-employee overrides (REPLACE semantics — wins over role-derived
    // scope, supporting both elevation and restriction)
    const membershipOverride = await ctx.db
      .query("gabinetMembershipPermissions")
      .withIndex("by_orgAndUser", (q) =>
        q.eq("organizationId", orgId).eq("userId", user._id),
      )
      .unique();
    if (membershipOverride) {
      const mPerms = membershipOverride.permissions as Partial<FeaturePermissions>;
      for (const feature of ALL_FEATURES) {
        if (!feature.startsWith("gabinet_")) continue;
        const mergedActions = { ...merged[feature] };
        for (const action of ACTIONS) {
          const membershipScope = mPerms?.[feature as Feature]?.[action];
          if (membershipScope !== undefined) {
            mergedActions[action] = membershipScope;
          }
        }
        merged[feature] = mergedActions;
      }
    }
  }

  return merged;
}
