import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "../_generated/api";
import { verifyOrgAccess, requireOrgAdmin } from "../_helpers/auth";
import { checkPermission } from "../_helpers/permissions";
import { logActivity } from "../_helpers/activities";
import { gabinetEmployeeRoleValidator } from "../schema";

// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const writeEmployeeRef = internal.supabase.gabinet.employees.writeEmployeeToSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const updateEmployeeRef = internal.supabase.gabinet.employees.updateEmployeeInSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const deleteEmployeeRef = internal.supabase.gabinet.employees.deleteEmployeeFromSupabase;

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

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    role: gabinetEmployeeRoleValidator,
    specialization: v.optional(v.string()),
    qualifiedTreatmentIds: v.optional(v.array(v.id("gabinetTreatments"))),
    licenseNumber: v.optional(v.string()),
    hireDate: v.optional(v.string()),
    color: v.optional(v.string()),
    notes: v.optional(v.string()),
    tagIds: v.optional(v.array(v.id("tagDefinitions"))),
    categoryId: v.optional(v.id("categoryDefinitions")),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_employees", "create");
    if (!perm.allowed) throw new Error("Permission denied");
    const now = Date.now();

    // Check if employee already exists for this user
    const existing = await ctx.db
      .query("gabinetEmployees")
      .withIndex("by_orgAndUser", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .first();
    if (existing) {
      throw new Error("Employee profile already exists for this user");
    }

    const id = await ctx.db.insert("gabinetEmployees", {
      organizationId: args.organizationId,
      userId: args.userId,
      firstName: args.firstName,
      lastName: args.lastName,
      role: args.role,
      specialization: args.specialization,
      qualifiedTreatmentIds: args.qualifiedTreatmentIds ?? [],
      licenseNumber: args.licenseNumber,
      hireDate: args.hireDate,
      isActive: true,
      color: args.color,
      notes: args.notes,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetEmployee",
      entityId: id,
      action: "created",
      description: `Created employee profile`,
      performedBy: user._id,
    });

    // Dual-write: replicate new employee to Supabase
    await ctx.scheduler.runAfter(0, writeEmployeeRef, {
      employeeId: id as string,
      organizationId: args.organizationId as string,
      userId: args.userId as string,
      firstName: args.firstName,
      lastName: args.lastName,
      role: args.role,
      specialization: args.specialization,
      qualifiedTreatmentIds: (args.qualifiedTreatmentIds ?? []).map((id) => id as string),
      licenseNumber: args.licenseNumber,
      hireDate: args.hireDate,
      isActive: true,
      color: args.color,
      notes: args.notes,
      tagIds: args.tagIds?.map((id) => id as string),
      categoryId: args.categoryId ? (args.categoryId as string) : undefined,
      createdBy: user._id as string,
      createdAt: now,
      updatedAt: now,
    });

    return id;
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    employeeId: v.id("gabinetEmployees"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    role: v.optional(gabinetEmployeeRoleValidator),
    specialization: v.optional(v.string()),
    qualifiedTreatmentIds: v.optional(v.array(v.id("gabinetTreatments"))),
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
    tagIds: v.optional(v.array(v.id("tagDefinitions"))),
    categoryId: v.optional(v.id("categoryDefinitions")),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_employees", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const emp = await ctx.db.get(args.employeeId);
    if (!emp || emp.organizationId !== args.organizationId) {
      throw new Error("Employee not found");
    }
    if (perm.scope === "own" && emp.createdBy !== user._id) {
      throw new Error("Permission denied: you can only edit your own records");
    }

    const { organizationId, employeeId, ...updates } = args;
    await ctx.db.patch(employeeId, { ...updates, updatedAt: Date.now() });

    await logActivity(ctx, {
      organizationId,
      entityType: "gabinetEmployee",
      entityId: employeeId,
      action: "updated",
      description: `Updated employee profile`,
      performedBy: user._id,
    });

    // Dual-write: replicate update to Supabase
    await ctx.scheduler.runAfter(0, updateEmployeeRef, {
      employeeId: employeeId as string,
      organizationId: organizationId as string,
      ...Object.fromEntries(
        Object.entries(updates)
          .filter(([k]) => k !== "updatedAt")
          .map(([k, val]) => {
            if (k === "qualifiedTreatmentIds" && Array.isArray(val)) return [k, val.map((id) => id as string)];
            if (k === "tagIds" && Array.isArray(val)) return [k, val.map((id) => id as string)];
            if (k === "categoryId" && val) return [k, val as string];
            return [k, val];
          })
      ),
      updatedAt: Date.now(),
    });

    return employeeId;
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    employeeId: v.id("gabinetEmployees"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_employees", "delete");
    if (!perm.allowed) throw new Error("Permission denied");

    const emp = await ctx.db.get(args.employeeId);
    if (!emp || emp.organizationId !== args.organizationId) {
      throw new Error("Employee not found");
    }
    if (perm.scope === "own" && emp.createdBy !== user._id) {
      throw new Error("Permission denied: you can only delete your own records");
    }

    // Soft-delete: deactivate
    await ctx.db.patch(args.employeeId, { isActive: false, updatedAt: Date.now() });

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetEmployee",
      entityId: args.employeeId,
      action: "deleted",
      description: `Deactivated employee profile`,
      performedBy: user._id,
    });

    // Dual-write: replicate soft-delete to Supabase
    await ctx.scheduler.runAfter(0, deleteEmployeeRef, {
      employeeId: args.employeeId as string,
      organizationId: args.organizationId as string,
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
export const setQualifiedTreatments = mutation({
  args: {
    organizationId: v.id("organizations"),
    employeeId: v.id("gabinetEmployees"),
    treatmentIds: v.array(v.id("gabinetTreatments")),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_employees", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const emp = await ctx.db.get(args.employeeId);
    if (!emp || emp.organizationId !== args.organizationId) {
      throw new Error("Employee not found");
    }
    if (perm.scope === "own" && emp.createdBy !== user._id) {
      throw new Error("Permission denied: you can only edit your own records");
    }

    await ctx.db.patch(args.employeeId, {
      qualifiedTreatmentIds: args.treatmentIds,
      updatedAt: Date.now(),
    });

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetEmployee",
      entityId: args.employeeId,
      action: "updated",
      description: `Updated treatment qualifications (${args.treatmentIds.length} treatments)`,
      performedBy: user._id,
    });

    // Dual-write: replicate qualified treatment IDs to Supabase
    await ctx.scheduler.runAfter(0, updateEmployeeRef, {
      employeeId: args.employeeId as string,
      organizationId: args.organizationId as string,
      qualifiedTreatmentIds: args.treatmentIds.map((id) => id as string),
      updatedAt: Date.now(),
    });
  },
});
