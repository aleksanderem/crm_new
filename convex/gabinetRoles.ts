/**
 * Gabinet roles & permissions API.
 *
 * Two tables backed:
 *   - gabinetRoleDefinitions — per-org registry (system + custom)
 *   - gabinetRolePermissions — per-(org, role) matrix override
 *
 * System roles (doctor/nurse/…/other) auto-seed on first read so a fresh org
 * doesn't have to click anything to see them. Custom roles start with
 * permissions: { } and must be configured by the admin (they evaluate to
 * "none" everywhere until overrides land).
 */

import { query, mutation, action, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { requireOrgAdmin, verifyOrgAccess } from "./_helpers/auth";
import {
  DEFAULT_GABINET_ROLE_PERMISSIONS,
  SYSTEM_GABINET_ROLES,
  SYSTEM_GABINET_ROLE_LABELS,
  isSystemGabinetRole,
  type SystemGabinetRole,
} from "./_helpers/gabinetRolePermissions";
import type { FeaturePermissions } from "./_helpers/permissionTypes";

// --- Definitions ---

export const listDefinitions = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const rows = await ctx.db
      .query("gabinetRoleDefinitions")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    // Surface system rows that haven't been materialized yet so the UI can show
    // them even before the first seed run.
    const present = new Set(rows.map((r) => r.key));
    const virtualSystem = SYSTEM_GABINET_ROLES.filter((r) => !present.has(r)).map((r) => ({
      _id: `system:${r}` as Id<"gabinetRoleDefinitions">,
      _creationTime: 0,
      organizationId: args.organizationId,
      key: r,
      labelPl: SYSTEM_GABINET_ROLE_LABELS[r].pl,
      labelEn: SYSTEM_GABINET_ROLE_LABELS[r].en,
      color: SYSTEM_GABINET_ROLE_LABELS[r].color,
      isSystem: true,
      isClinical: SYSTEM_GABINET_ROLE_LABELS[r].isClinical,
      order: undefined as number | undefined,
      virtual: true as const,
    }));

    return [...rows, ...virtualSystem].sort((a, b) => {
      const ao = a.order ?? 0;
      const bo = b.order ?? 0;
      if (ao !== bo) return ao - bo;
      return a.labelPl.localeCompare(b.labelPl);
    });
  },
});

export const createDefinition = action({
  args: {
    organizationId: v.id("organizations"),
    key: v.string(),
    labelPl: v.string(),
    labelEn: v.string(),
    color: v.optional(v.string()),
    isClinical: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<string> => {
    return await ctx.runMutation(internal.gabinetRoles._createDefinitionInternal, args);
  },
});

export const _createDefinitionInternal = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    key: v.string(),
    labelPl: v.string(),
    labelEn: v.string(),
    color: v.optional(v.string()),
    isClinical: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.organizationId);

    const cleanKey = args.key.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
    if (!cleanKey) throw new Error("Klucz roli nie może być pusty");
    if (isSystemGabinetRole(cleanKey)) {
      throw new Error("Ta nazwa jest zarezerwowana dla roli systemowej");
    }
    const dup = await ctx.db
      .query("gabinetRoleDefinitions")
      .withIndex("by_orgAndKey", (q) =>
        q.eq("organizationId", args.organizationId).eq("key", cleanKey),
      )
      .unique();
    if (dup) throw new Error("Rola o tym kluczu już istnieje");

    const now = Date.now();
    const id = await ctx.db.insert("gabinetRoleDefinitions", {
      organizationId: args.organizationId,
      key: cleanKey,
      labelPl: args.labelPl.trim() || cleanKey,
      labelEn: args.labelEn.trim() || cleanKey,
      color: args.color,
      isSystem: false,
      isClinical: args.isClinical,
      order: 100,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
    return String(id);
  },
});

export const updateDefinition = action({
  args: {
    organizationId: v.id("organizations"),
    definitionId: v.id("gabinetRoleDefinitions"),
    labelPl: v.optional(v.string()),
    labelEn: v.optional(v.string()),
    color: v.optional(v.string()),
    isClinical: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.runMutation(internal.gabinetRoles._updateDefinitionInternal, args);
  },
});

export const _updateDefinitionInternal = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    definitionId: v.id("gabinetRoleDefinitions"),
    labelPl: v.optional(v.string()),
    labelEn: v.optional(v.string()),
    color: v.optional(v.string()),
    isClinical: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);
    const def = await ctx.db.get(args.definitionId);
    if (!def || def.organizationId !== args.organizationId) {
      throw new Error("Definicja roli nie znaleziona");
    }
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.labelPl !== undefined) patch.labelPl = args.labelPl.trim() || def.labelPl;
    if (args.labelEn !== undefined) patch.labelEn = args.labelEn.trim() || def.labelEn;
    if (args.color !== undefined) patch.color = args.color;
    if (args.isClinical !== undefined) patch.isClinical = args.isClinical;
    await ctx.db.patch(args.definitionId, patch);
  },
});

export const deleteDefinition = action({
  args: {
    organizationId: v.id("organizations"),
    definitionId: v.id("gabinetRoleDefinitions"),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.runMutation(internal.gabinetRoles._deleteDefinitionInternal, args);
  },
});

export const _deleteDefinitionInternal = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    definitionId: v.id("gabinetRoleDefinitions"),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);
    const def = await ctx.db.get(args.definitionId);
    if (!def || def.organizationId !== args.organizationId) {
      throw new Error("Definicja roli nie znaleziona");
    }
    if (def.isSystem) throw new Error("Nie można usunąć roli systemowej");
    // Refuse if any active membership references this role.
    const inUse = await ctx.db
      .query("gabinetMemberships")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    if (inUse.some((m) => m.gabinetRole === def.key && m.isActive)) {
      throw new Error("Rola jest przypisana do pracowników — przepisz ich najpierw");
    }
    // Drop the permissions override row too, if any.
    const overrides = await ctx.db
      .query("gabinetRolePermissions")
      .withIndex("by_orgAndRole", (q) =>
        q.eq("organizationId", args.organizationId).eq("gabinetRole", def.key),
      )
      .collect();
    for (const o of overrides) await ctx.db.delete(o._id);
    await ctx.db.delete(args.definitionId);
  },
});

// --- Permissions matrix ---

/** Returns the effective (post-default-merge) FeaturePermissions for a given
 *  gabinet role. Used by the matrix UI. */
export const getPermissions = query({
  args: { organizationId: v.id("organizations"), gabinetRole: v.string() },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const override = await ctx.db
      .query("gabinetRolePermissions")
      .withIndex("by_orgAndRole", (q) =>
        q.eq("organizationId", args.organizationId).eq("gabinetRole", args.gabinetRole),
      )
      .unique();
    if (override) return override.permissions as FeaturePermissions;
    if (isSystemGabinetRole(args.gabinetRole)) {
      return DEFAULT_GABINET_ROLE_PERMISSIONS[args.gabinetRole as SystemGabinetRole];
    }
    return null;
  },
});

export const setPermissions = action({
  args: {
    organizationId: v.id("organizations"),
    gabinetRole: v.string(),
    permissions: v.any(),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.runMutation(internal.gabinetRoles._setPermissionsInternal, args);
  },
});

export const _setPermissionsInternal = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    gabinetRole: v.string(),
    permissions: v.any(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.organizationId);
    const existing = await ctx.db
      .query("gabinetRolePermissions")
      .withIndex("by_orgAndRole", (q) =>
        q.eq("organizationId", args.organizationId).eq("gabinetRole", args.gabinetRole),
      )
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        permissions: args.permissions,
        updatedBy: user._id,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("gabinetRolePermissions", {
        organizationId: args.organizationId,
        gabinetRole: args.gabinetRole,
        permissions: args.permissions,
        updatedBy: user._id,
        updatedAt: now,
      });
    }
  },
});

/** Reset to baked-in defaults for a system role; for custom roles this deletes
 *  the override row (effective permissions revert to "none" everywhere). */
export const resetPermissionsToDefault = action({
  args: { organizationId: v.id("organizations"), gabinetRole: v.string() },
  handler: async (ctx, args): Promise<void> => {
    await ctx.runMutation(internal.gabinetRoles._resetPermissionsInternal, args);
  },
});

export const _resetPermissionsInternal = internalMutation({
  args: { organizationId: v.id("organizations"), gabinetRole: v.string() },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);
    const existing = await ctx.db
      .query("gabinetRolePermissions")
      .withIndex("by_orgAndRole", (q) =>
        q.eq("organizationId", args.organizationId).eq("gabinetRole", args.gabinetRole),
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

// --- Per-employee permission overrides ---

/** Return the per-employee permission override blob for a given user, or null
 *  if no override exists (i.e. role-level permissions apply). */
export const getEmployeePermissions = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);
    const override = await ctx.db
      .query("gabinetMembershipPermissions")
      .withIndex("by_orgAndUser", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId),
      )
      .unique();
    return override?.permissions ?? null;
  },
});

/** Upsert per-employee permission overrides. For each feature/action present in
 *  the permissions blob, that value REPLACES the role-derived scope (supports
 *  both elevation and restriction). Missing entries inherit from the role. */
export const setEmployeePermissions = mutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    permissions: v.any(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.organizationId);
    const now = Date.now();
    const existing = await ctx.db
      .query("gabinetMembershipPermissions")
      .withIndex("by_orgAndUser", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        permissions: args.permissions,
        updatedBy: user._id,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("gabinetMembershipPermissions", {
        organizationId: args.organizationId,
        userId: args.userId,
        permissions: args.permissions,
        updatedBy: user._id,
        updatedAt: now,
      });
    }
  },
});

/** Remove the per-employee permission override, reverting the employee to
 *  role-level permissions. */
export const resetEmployeePermissions = mutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);
    const existing = await ctx.db
      .query("gabinetMembershipPermissions")
      .withIndex("by_orgAndUser", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId),
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});
