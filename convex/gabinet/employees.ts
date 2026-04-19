import { query, action, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "../_generated/api";
import { verifyOrgAccess } from "../_helpers/auth";
import { checkPermission } from "../_helpers/permissions";
import { logActivity } from "../_helpers/activities";
import { gabinetEmployeeRoleValidator } from "../schema";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { Id } from "../_generated/dataModel";

// Dual-write refs removed — Supabase is now primary for employee writes

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
    role: v.optional(gabinetEmployeeRoleValidator),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_employees", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    if (args.role) {
      const all = await ctx.db
        .query("gabinetEmployees")
        .withIndex("by_orgAndRole", (q) =>
          q.eq("organizationId", args.organizationId).eq("role", args.role!)
        )
        .collect();
      let filtered = args.activeOnly ? all.filter((e) => e.isActive) : all;
      if (perm.scope === "own") {
        filtered = filtered.filter((e) => e.createdBy === user._id);
      }
      return filtered;
    }

    if (args.activeOnly) {
      const results = await ctx.db
        .query("gabinetEmployees")
        .withIndex("by_orgAndActive", (q) =>
          q.eq("organizationId", args.organizationId).eq("isActive", true)
        )
        .collect();
      if (perm.scope === "own") {
        return results.filter((e) => e.createdBy === user._id);
      }
      return results;
    }

    const result = await ctx.db
      .query("gabinetEmployees")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .paginate(args.paginationOpts);
    if (perm.scope === "own") {
      return { ...result, page: result.page.filter((e) => e.createdBy === user._id) };
    }
    return result;
  },
});

export const listAll = query({
  args: {
    organizationId: v.id("organizations"),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_employees", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    if (args.activeOnly) {
      const results = await ctx.db
        .query("gabinetEmployees")
        .withIndex("by_orgAndActive", (q) =>
          q.eq("organizationId", args.organizationId).eq("isActive", true)
        )
        .collect();
      if (perm.scope === "own") {
        return results.filter((e) => e.createdBy === user._id);
      }
      return results;
    }

    const results = await ctx.db
      .query("gabinetEmployees")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    if (perm.scope === "own") {
      return results.filter((e) => e.createdBy === user._id);
    }
    return results;
  },
});

export const getById = query({
  args: {
    organizationId: v.id("organizations"),
    employeeId: v.id("gabinetEmployees"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_employees", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const emp = await ctx.db.get(args.employeeId);
    if (!emp || emp.organizationId !== args.organizationId) {
      throw new Error("Employee not found");
    }
    if (perm.scope === "own" && emp.createdBy !== user._id) {
      throw new Error("Permission denied: you can only view your own records");
    }
    return emp;
  },
});

export const getByUserId = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_employees", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    return await ctx.db
      .query("gabinetEmployees")
      .withIndex("by_orgAndUser", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .first();
  },
});

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    role: gabinetEmployeeRoleValidator,
    specialization: v.optional(v.string()),
    qualifiedTreatmentIds: v.optional(v.array(v.string())),
    licenseNumber: v.optional(v.string()),
    hireDate: v.optional(v.string()),
    color: v.optional(v.string()),
    notes: v.optional(v.string()),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // --- Auth + permissions (via internal queries) ---
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    // Require admin role (mirrors requireOrgAdmin)
    if (authResult.role !== "owner" && authResult.role !== "admin") {
      throw new Error("Admin access required");
    }
    await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_employees",
      action: "create",
    }).then((perm: { allowed: boolean; scope: string }) => {
      if (!perm.allowed) throw new Error("Permission denied");
    });

    const now = Date.now();
    const db = createSupabaseDb();

    // --- Check if employee already exists (via Supabase) ---
    const existing = await db.query("gabinetEmployees")
      .eq("organizationId", String(args.organizationId))
      .eq("userId", args.userId)
      .collect();
    if (existing.length > 0) {
      throw new Error("Employee profile already exists for this user");
    }

    // --- INSERT employee directly to Supabase ---
    const employeeId = await db.insert("gabinetEmployees", {
      organizationId: String(args.organizationId),
      userId: args.userId,
      firstName: args.firstName ?? null,
      lastName: args.lastName ?? null,
      role: args.role,
      specialization: args.specialization ?? null,
      qualifiedTreatmentIds: args.qualifiedTreatmentIds ?? [],
      licenseNumber: args.licenseNumber ?? null,
      hireDate: args.hireDate ?? null,
      isActive: true,
      color: args.color ?? null,
      notes: args.notes ?? null,
      tagIds: args.tagIds ?? null,
      categoryId: args.categoryId ?? null,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    // --- Delegate Convex-only side effects ---
    try {
      await ctx.runMutation(internal.gabinet.employees._createSideEffects, {
        employeeId,
        organizationId: args.organizationId,
        createdBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[employees.create] Side effects FAILED for employee", employeeId, ":", e);
    }

    return employeeId;
  },
});

export const _createSideEffects = internalMutation({
  args: {
    employeeId: v.string(),
    organizationId: v.id("organizations"),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    const createdByUserId = args.createdBy as Id<"users">;

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetEmployee",
      entityId: args.employeeId as Id<"gabinetEmployees">,
      action: "created",
      description: `Created employee profile`,
      performedBy: createdByUserId,
    });
  },
});

export const update = action({
  args: {
    organizationId: v.id("organizations"),
    employeeId: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    role: v.optional(gabinetEmployeeRoleValidator),
    specialization: v.optional(v.string()),
    qualifiedTreatmentIds: v.optional(v.array(v.string())),
    licenseNumber: v.optional(v.string()),
    hireDate: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    color: v.optional(v.string()),
    notes: v.optional(v.string()),
    // Detailed employee data
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    pesel: v.optional(v.string()),
    address: v.optional(
      v.object({
        street: v.optional(v.string()),
        city: v.optional(v.string()),
        postalCode: v.optional(v.string()),
      }),
    ),
    employmentType: v.optional(
      v.union(
        v.literal("umowa_o_prace"),
        v.literal("umowa_zlecenie"),
        v.literal("b2b"),
        v.literal("staz"),
      ),
    ),
    endDate: v.optional(v.string()),
    position: v.optional(v.string()),
    department: v.optional(v.string()),
    skills: v.optional(v.array(v.string())),
    yearsOfExperience: v.optional(v.number()),
    certifications: v.optional(
      v.array(
        v.object({
          name: v.string(),
          dateObtained: v.optional(v.string()),
          expiryDate: v.optional(v.string()),
        }),
      ),
    ),
    baseSalary: v.optional(v.number()),
    commissionPercent: v.optional(v.number()),
    bankAccount: v.optional(v.string()),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // --- Auth + permissions (via internal queries) ---
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    // Require admin role (mirrors requireOrgAdmin)
    if (authResult.role !== "owner" && authResult.role !== "admin") {
      throw new Error("Admin access required");
    }
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "gabinet_employees",
        action: "edit",
      },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    // --- Read employee from Supabase ---
    const emp = await db.get("gabinetEmployees", args.employeeId);
    if (!emp || String(emp.organizationId) !== String(args.organizationId)) {
      throw new Error("Employee not found");
    }
    if (perm.scope === "own" && String(emp.createdBy) !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only edit your own records");
    }

    // --- Build updates and PATCH to Supabase ---
    const { organizationId, employeeId, ...updates } = args;
    await db.patch("gabinetEmployees", employeeId, { ...updates, updatedAt: Date.now() });

    // --- Delegate Convex-only side effects ---
    try {
      await ctx.runMutation(internal.gabinet.employees._updateSideEffects, {
        employeeId,
        organizationId,
        updatedBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[employees.update] Side effects FAILED for employee", employeeId, ":", e);
    }

    return employeeId;
  },
});

export const _updateSideEffects = internalMutation({
  args: {
    employeeId: v.string(),
    organizationId: v.id("organizations"),
    updatedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const updatedByUserId = args.updatedBy as Id<"users">;

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetEmployee",
      entityId: args.employeeId as Id<"gabinetEmployees">,
      action: "updated",
      description: `Updated employee profile`,
      performedBy: updatedByUserId,
    });
  },
});

export const remove = action({
  args: {
    organizationId: v.id("organizations"),
    employeeId: v.string(),
  },
  handler: async (ctx, args) => {
    // --- Auth + permissions (via internal queries) ---
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    // Require admin role (mirrors requireOrgAdmin)
    if (authResult.role !== "owner" && authResult.role !== "admin") {
      throw new Error("Admin access required");
    }
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "gabinet_employees",
        action: "delete",
      },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    // --- Read employee from Supabase ---
    const emp = await db.get("gabinetEmployees", args.employeeId);
    if (!emp || String(emp.organizationId) !== String(args.organizationId)) {
      throw new Error("Employee not found");
    }
    if (perm.scope === "own" && String(emp.createdBy) !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only delete your own records");
    }

    // --- Soft-delete: PATCH isActive=false in Supabase ---
    await db.patch("gabinetEmployees", args.employeeId, {
      isActive: false,
      updatedAt: Date.now(),
    });

    // --- Delegate Convex-only side effects ---
    try {
      await ctx.runMutation(internal.gabinet.employees._removeSideEffects, {
        employeeId: args.employeeId,
        organizationId: args.organizationId,
        deletedBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[employees.remove] Side effects FAILED for employee", args.employeeId, ":", e);
    }
  },
});

export const _removeSideEffects = internalMutation({
  args: {
    employeeId: v.string(),
    organizationId: v.id("organizations"),
    deletedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const deletedByUserId = args.deletedBy as Id<"users">;

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetEmployee",
      entityId: args.employeeId as Id<"gabinetEmployees">,
      action: "deleted",
      description: `Deactivated employee profile`,
      performedBy: deletedByUserId,
    });
  },
});

/** Get employees qualified for a specific treatment */
export const getQualifiedForTreatment = query({
  args: {
    organizationId: v.id("organizations"),
    treatmentId: v.id("gabinetTreatments"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_employees", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const employees = await ctx.db
      .query("gabinetEmployees")
      .withIndex("by_orgAndActive", (q) =>
        q.eq("organizationId", args.organizationId).eq("isActive", true)
      )
      .collect();

    return employees.filter((e) =>
      e.qualifiedTreatmentIds.includes(args.treatmentId)
    );
  },
});

/** Update treatment qualifications for an employee */
export const setQualifiedTreatments = action({
  args: {
    organizationId: v.id("organizations"),
    employeeId: v.string(),
    treatmentIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // --- Auth + permissions (via internal queries) ---
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    // Require admin role (mirrors requireOrgAdmin)
    if (authResult.role !== "owner" && authResult.role !== "admin") {
      throw new Error("Admin access required");
    }
    await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_employees",
      action: "edit",
    }).then((perm: { allowed: boolean; scope: string }) => {
      if (!perm.allowed) throw new Error("Permission denied");
    });

    const db = createSupabaseDb();

    // --- Read employee from Supabase ---
    const emp = await db.get("gabinetEmployees", args.employeeId);
    if (!emp || String(emp.organizationId) !== String(args.organizationId)) {
      throw new Error("Employee not found");
    }

    // --- PATCH to Supabase ---
    await db.patch("gabinetEmployees", args.employeeId, {
      qualifiedTreatmentIds: args.treatmentIds,
      updatedAt: Date.now(),
    });

    // --- Delegate Convex-only side effects ---
    try {
      await ctx.runMutation(internal.gabinet.employees._setQualifiedSideEffects, {
        employeeId: args.employeeId,
        organizationId: args.organizationId,
        treatmentCount: args.treatmentIds.length,
        updatedBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[employees.setQualifiedTreatments] Side effects FAILED:", e);
    }
  },
});

export const _setQualifiedSideEffects = internalMutation({
  args: {
    employeeId: v.string(),
    organizationId: v.id("organizations"),
    treatmentCount: v.number(),
    updatedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const updatedByUserId = args.updatedBy as Id<"users">;

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetEmployee",
      entityId: args.employeeId as Id<"gabinetEmployees">,
      action: "updated",
      description: `Updated treatment qualifications (${args.treatmentCount} treatments)`,
      performedBy: updatedByUserId,
    });
  },
});
