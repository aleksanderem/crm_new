import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { auth } from "@cvx/auth";
import type { Feature, Action, PermissionResult, Scope } from "./permissionTypes";
import { DEFAULT_PERMISSIONS } from "./permissions";
import { defaultGabinetScope, maxScope } from "./gabinetRolePermissions";
import type { OrgRole } from "../schema";

export const verifyOrgAccess = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    const membership = await ctx.db
      .query("teamMemberships")
      .withIndex("by_orgAndUser", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", user._id),
      )
      .unique();

    if (!membership) throw new Error("Not a member of this organization");

    return {
      userId: user._id,
      userName: user.name,
      userEmail: user.email,
      membershipId: membership._id,
      role: membership.role,
    };
  },
});

export const checkPermission = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    feature: v.string(),
    action: v.string(),
  },
  handler: async (ctx, args): Promise<PermissionResult> => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    const membership = await ctx.db
      .query("teamMemberships")
      .withIndex("by_orgAndUser", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", user._id),
      )
      .unique();

    if (!membership) throw new Error("Not a member of this organization");

    const role = membership.role as OrgRole;
    if (role === "owner" || role === "admin") {
      return { allowed: true, scope: "all" };
    }

    const override = await ctx.db
      .query("orgPermissions")
      .withIndex("by_orgAndRole", (q) =>
        q.eq("organizationId", args.organizationId).eq("role", role),
      )
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
      const gabinetMembership = await ctx.db
        .query("gabinetMemberships")
        .withIndex("by_orgAndUser", (q) =>
          q.eq("organizationId", args.organizationId).eq("userId", user._id),
        )
        .unique();
      if (gabinetMembership && gabinetMembership.isActive) {
        const gRole = gabinetMembership.gabinetRole;
        // Per-org override first, then baked-in default
        const gOverride = await ctx.db
          .query("gabinetRolePermissions")
          .withIndex("by_orgAndRole", (q) =>
            q.eq("organizationId", args.organizationId).eq("gabinetRole", gRole),
          )
          .unique();
        let gabinetScope: Scope;
        if (gOverride) {
          const gPerms = gOverride.permissions as Record<string, Record<string, string>>;
          gabinetScope = (gPerms?.[feature]?.[action]
            ?? defaultGabinetScope(gRole, feature, action)) as Scope;
        } else {
          gabinetScope = defaultGabinetScope(gRole, feature, action);
        }
        effectiveScope = maxScope(orgScope, gabinetScope);
      }
    }

    return {
      allowed: effectiveScope !== "none",
      scope: effectiveScope,
    };
  },
});
