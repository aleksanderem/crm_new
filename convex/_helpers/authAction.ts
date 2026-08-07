import { internalQuery, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { auth } from "@cvx/auth";
import { createSupabaseDb } from "./supabaseDb";
import type { Feature, Action, PermissionResult, Scope } from "./permissionTypes";
import { DEFAULT_PERMISSIONS } from "./permissions";
import { defaultGabinetScope, maxScope } from "./gabinetRolePermissions";
import type { OrgRole } from "../schema";
import type { Id } from "../_generated/dataModel";

// ---------------------------------------------------------------------------
// Internal helpers — read Convex-only (non-TABLE_MAP) tables from query context
// so that action handlers can obtain this data via ctx.runQuery.
// ---------------------------------------------------------------------------

// Returns the current user document from Convex auth tables.
export const _getAuthUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

// Returns gabinet-role permission data for a user in an org. All three tables
// (gabinetMemberships, gabinetRolePermissions, gabinetMembershipPermissions)
// are Convex-only mirrors maintained by gabinet/employees.ts — they are NOT in
// TABLE_MAP and must be read via ctx.db.
export const _getGabinetPermissionData = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const gabinetMembership = await ctx.db
      .query("gabinetMemberships")
      .withIndex("by_orgAndUser", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId),
      )
      .unique();

    if (!gabinetMembership || !gabinetMembership.isActive) {
      return { membership: null, rolePermissions: null, membershipPermissions: null };
    }

    const gRole = gabinetMembership.gabinetRole;

    const gOverride = await ctx.db
      .query("gabinetRolePermissions")
      .withIndex("by_orgAndRole", (q) =>
        q.eq("organizationId", args.organizationId).eq("gabinetRole", gRole),
      )
      .unique();

    const membershipOverride = await ctx.db
      .query("gabinetMembershipPermissions")
      .withIndex("by_orgAndUser", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId),
      )
      .unique();

    return {
      membership: { gabinetRole: gRole, isActive: true },
      rolePermissions: gOverride
        ? (gOverride.permissions as Record<string, Record<string, string>>)
        : null,
      membershipPermissions: membershipOverride
        ? (membershipOverride.permissions as Record<string, Record<string, string>>)
        : null,
    };
  },
});

// ---------------------------------------------------------------------------
// verifyOrgAccess — reads teamMemberships from Supabase (TABLE_MAP primary).
// Callers must use ctx.runAction (not ctx.runQuery).
// ---------------------------------------------------------------------------
export const verifyOrgAccess = internalAction({
  args: { organizationId: v.id("organizations") },
  handler: async (
    ctx,
    args,
  ): Promise<{
    userId: Id<"users">;
    userName: string | undefined;
    userEmail: string | undefined;
    membershipId: Id<"teamMemberships">;
    role: string;
  }> => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const user = await ctx.runQuery(internal._helpers.authAction._getAuthUser, { userId });
    if (!user) throw new Error("User not found");

    const db = createSupabaseDb();
    const membership = await db
      .query("teamMemberships")
      .eq("organizationId", String(args.organizationId))
      .eq("userId", String(userId))
      .unique();

    if (!membership) throw new Error("Not a member of this organization");

    return {
      userId: userId as Id<"users">,
      userName: user.name as string | undefined,
      userEmail: user.email as string | undefined,
      membershipId: membership._id as Id<"teamMemberships">,
      role: membership.role as string,
    };
  },
});

// ---------------------------------------------------------------------------
// checkPermission — reads teamMemberships + orgPermissions from Supabase
// (TABLE_MAP primary). Gabinet-role data is fetched via internalQuery since
// those tables are Convex-only mirrors. Callers must use ctx.runAction.
// ---------------------------------------------------------------------------
export const checkPermission = internalAction({
  args: {
    organizationId: v.id("organizations"),
    feature: v.string(),
    action: v.string(),
  },
  handler: async (ctx, args): Promise<PermissionResult> => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.runQuery(internal._helpers.authAction._getAuthUser, { userId });
    if (!user) throw new Error("User not found");

    const db = createSupabaseDb();

    const membership = await db
      .query("teamMemberships")
      .eq("organizationId", String(args.organizationId))
      .eq("userId", String(userId))
      .unique();

    if (!membership) throw new Error("Not a member of this organization");

    const role = membership.role as OrgRole;
    if (role === "owner" || role === "admin") {
      return { allowed: true, scope: "all" };
    }

    const override = await db
      .query("orgPermissions")
      .eq("organizationId", String(args.organizationId))
      .eq("role", role)
      .unique();

    const feature = args.feature as Feature;
    const action = args.action as Action;

    // --- 1. Org-role scope ---
    let orgScope: Scope;
    if (override) {
      const perms = override.permissions as Record<string, Record<string, string>>;
      orgScope = (perms?.[feature]?.[action]
        ?? DEFAULT_PERMISSIONS[role]?.[feature]?.[action]
        ?? "none") as Scope;
    } else {
      orgScope = (DEFAULT_PERMISSIONS[role]?.[feature]?.[action] ?? "none") as Scope;
    }

    // --- 2. Gabinet-role scope (MAX-merge for gabinet_* features only) ---
    let effectiveScope: Scope = orgScope;
    if (feature.startsWith("gabinet_")) {
      const gabinetData = await ctx.runQuery(
        internal._helpers.authAction._getGabinetPermissionData,
        { organizationId: args.organizationId, userId },
      );
      if (gabinetData.membership) {
        const gRole = gabinetData.membership.gabinetRole;
        const gabinetScope: Scope = gabinetData.rolePermissions
          ? ((gabinetData.rolePermissions[feature]?.[action]
              ?? defaultGabinetScope(gRole, feature, action)) as Scope)
          : defaultGabinetScope(gRole, feature, action);
        effectiveScope = maxScope(orgScope, gabinetScope);

        // Layer 3: per-employee overrides (REPLACE semantics)
        if (gabinetData.membershipPermissions) {
          const membershipScope = gabinetData.membershipPermissions[feature]?.[action];
          if (membershipScope !== undefined) {
            effectiveScope = membershipScope as Scope;
          }
        }
      }
    }

    return {
      allowed: effectiveScope !== "none",
      scope: effectiveScope,
    };
  },
});

// ---------------------------------------------------------------------------
// checkResourceAccess — reads resourceInvites from Supabase (TABLE_MAP primary).
// Checks whether the current user has an accepted invite for a given resource.
// Callers must use ctx.runAction (not ctx.runQuery).
// ---------------------------------------------------------------------------
export const checkResourceAccess = internalAction({
  args: {
    resourceType: v.string(),
    resourceId: v.string(),
  },
  handler: async (ctx, args): Promise<{ allowed: boolean; accessLevel: "viewer" | "editor" | null }> => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const db = createSupabaseDb();
    const invites = await db
      .query("resourceInvites")
      .eq("resourceType", args.resourceType)
      .eq("resourceId", args.resourceId)
      .collect();

    const match = invites.find(
      (inv) => inv.status === "accepted" && inv.userId === String(userId),
    );

    if (!match) {
      return { allowed: false, accessLevel: null };
    }

    return { allowed: true, accessLevel: match.accessLevel };
  },
});

// Platform-admin guard for action handlers. Reads isPlatformAdmin from
// Supabase (authoritative post-migration). Call via
// ctx.runAction(internal._helpers.authAction.verifyPlatformAdmin, {}).
export const verifyPlatformAdmin = internalAction({
  args: {},
  handler: async (ctx): Promise<{ userId: Id<"users"> }> => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const db = createSupabaseDb();
    const user = await db.get("users", String(userId));
    if (!user) throw new Error("User not found");
    if (!user.isPlatformAdmin) throw new Error("Platform admin access required");
    return { userId: userId as Id<"users"> };
  },
});
