import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { verifyOrgAccess } from "../_helpers/auth";
import { checkPermission } from "../_helpers/permissions";
import { logActivity } from "../_helpers/activities";

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_patients", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    if (args.search) {
      const results = await ctx.db
        .query("gabinetPatients")
        .withSearchIndex("search_patients", (q) =>
          q.search("firstName", args.search!).eq("organizationId", args.organizationId)
        )
        .take(50);
      if (perm.scope === "own") {
        const filtered = results.filter((r) => r.createdBy === user._id);
        return { page: filtered, isDone: true, continueCursor: "" };
      }
      return { page: results, isDone: true, continueCursor: "" };
    }

    const result = await ctx.db
      .query("gabinetPatients")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .paginate(args.paginationOpts);
    if (perm.scope === "own") {
      return { ...result, page: result.page.filter((r) => r.createdBy === user._id) };
    }
    return result;
  },
});

export const getById = query({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.id("gabinetPatients"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_patients", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const patient = await ctx.db.get(args.patientId);
    if (!patient || patient.organizationId !== args.organizationId) {
      throw new Error("Patient not found");
    }
    if (perm.scope === "own" && patient.createdBy !== user._id) {
      throw new Error("Permission denied: you can only view your own records");
    }

    return patient;
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    contactId: v.optional(v.id("contacts")),
    firstName: v.string(),
    lastName: v.string(),
    pesel: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    gender: v.optional(v.union(v.literal("male"), v.literal("female"), v.literal("other"))),
    email: v.string(),
    phone: v.optional(v.string()),
    address: v.optional(v.object({
      street: v.optional(v.string()),
      city: v.optional(v.string()),
      postalCode: v.optional(v.string()),
    })),
    medicalNotes: v.optional(v.string()),
    allergies: v.optional(v.string()),
    bloodType: v.optional(v.string()),
    emergencyContactName: v.optional(v.string()),
    emergencyContactPhone: v.optional(v.string()),
    referralSource: v.optional(v.string()),
    referredByPatientId: v.optional(v.id("gabinetPatients")),
    tags: v.optional(v.array(v.string())),
    customFields: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_patients", "create");
    if (!perm.allowed) throw new Error("Permission denied");
    const now = Date.now();

    const patientId = await ctx.db.insert("gabinetPatients", {
      ...args,
      isActive: true,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetPatient",
      entityId: patientId,
      action: "created",
      description: `Created patient ${args.firstName} ${args.lastName}`,
      performedBy: user._id,
    });

    return patientId;
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.id("gabinetPatients"),
    contactId: v.optional(v.id("contacts")),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    pesel: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    gender: v.optional(v.union(v.literal("male"), v.literal("female"), v.literal("other"))),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.object({
      street: v.optional(v.string()),
      city: v.optional(v.string()),
      postalCode: v.optional(v.string()),
    })),
    medicalNotes: v.optional(v.string()),
    allergies: v.optional(v.string()),
    bloodType: v.optional(v.string()),
    emergencyContactName: v.optional(v.string()),
    emergencyContactPhone: v.optional(v.string()),
    referralSource: v.optional(v.string()),
    referredByPatientId: v.optional(v.id("gabinetPatients")),
    tags: v.optional(v.array(v.string())),
    customFields: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_patients", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const patient = await ctx.db.get(args.patientId);
    if (!patient || patient.organizationId !== args.organizationId) {
      throw new Error("Patient not found");
    }
    if (perm.scope === "own" && patient.createdBy !== user._id) {
      throw new Error("Permission denied: you can only edit your own records");
    }

    const { organizationId, patientId, ...updates } = args;
    await ctx.db.patch(patientId, { ...updates, updatedAt: Date.now() });

    await logActivity(ctx, {
      organizationId,
      entityType: "gabinetPatient",
      entityId: patientId,
      action: "updated",
      description: `Updated patient ${patient.firstName} ${patient.lastName}`,
      performedBy: user._id,
    });

    return patientId;
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.id("gabinetPatients"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_patients", "delete");
    if (!perm.allowed) throw new Error("Permission denied");

    const patient = await ctx.db.get(args.patientId);
    if (!patient || patient.organizationId !== args.organizationId) {
      throw new Error("Patient not found");
    }
    if (perm.scope === "own" && patient.createdBy !== user._id) {
      throw new Error("Permission denied: you can only delete your own records");
    }

    await ctx.db.patch(args.patientId, {
      isActive: false,
      updatedAt: Date.now(),
    });

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetPatient",
      entityId: args.patientId,
      action: "deleted",
      description: `Deleted patient ${patient.firstName} ${patient.lastName}`,
      performedBy: user._id,
    });

    return args.patientId;
  },
});

export const getByContact = query({
  args: {
    organizationId: v.id("organizations"),
    contactId: v.id("contacts"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_patients", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const results = await ctx.db
      .query("gabinetPatients")
      .withIndex("by_orgAndContact", (q) =>
        q.eq("organizationId", args.organizationId).eq("contactId", args.contactId)
      )
      .collect();
    if (perm.scope === "own") {
      return results.filter((r) => r.createdBy === user._id);
    }
    return results;
  },
});
