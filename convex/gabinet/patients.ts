import { query, mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { verifyOrgAccess } from "../_helpers/auth";
import { checkPermission } from "../_helpers/permissions";
import { logActivity } from "../_helpers/activities";

// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const writePatientRef = internal.supabase.gabinet.patients.writePatientToSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const updatePatientRef = internal.supabase.gabinet.patients.updatePatientInSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const deletePatientRef = internal.supabase.gabinet.patients.deletePatientFromSupabase;

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

export const searchUnlinkedContacts = query({
  args: {
    organizationId: v.id("organizations"),
    search: v.string(),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "contacts", "view");
    if (!perm.allowed) return [];

    if (!args.search.trim()) return [];

    const contacts = await ctx.db
      .query("contacts")
      .withSearchIndex("search_contacts", (q) =>
        q.search("firstName", args.search).eq("organizationId", args.organizationId)
      )
      .take(20);

    const linkedPatients = await ctx.db
      .query("gabinetPatients")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const linkedContactIds = new Set(
      linkedPatients
        .filter((p) => p.contactId)
        .map((p) => p.contactId!)
    );

    return contacts
      .filter((c) => !linkedContactIds.has(c._id))
      .map((c) => ({
        _id: c._id,
        firstName: c.firstName,
        lastName: c.lastName ?? "",
        email: c.email ?? "",
        phone: c.phone ?? "",
      }));
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
    tagIds: v.optional(v.array(v.id("tagDefinitions"))),
    categoryId: v.optional(v.id("categoryDefinitions")),
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

    await ctx.runMutation(internal.automation.emitEvent, {
      organizationId: args.organizationId,
      module: "gabinet",
      eventType: "gabinet.patient.created",
      entityType: "gabinetPatient",
      entityId: String(patientId),
      actorUserId: user._id,
      correlationKey: `patient:${patientId}`,
      eventIdempotencyKey: `automation-event:${args.organizationId}:${patientId}:created`,
      payload: JSON.stringify({
        organizationId: String(args.organizationId),
        patientId: String(patientId),
        contactId: args.contactId ? String(args.contactId) : undefined,
        firstName: args.firstName,
        lastName: args.lastName,
        patientName: `${args.firstName}${args.lastName ? ` ${args.lastName}` : ""}`,
        patientEmail: args.email,
        patientPhone: args.phone,
        referralSource: args.referralSource,
        createdBy: String(user._id),
      }),
      occurredAt: now,
    });

    // Dual-write: replicate new patient to Supabase
    await ctx.scheduler.runAfter(0, writePatientRef, {
      patientId: patientId as string,
      organizationId: args.organizationId as string,
      contactId: args.contactId ? (args.contactId as string) : undefined,
      firstName: args.firstName,
      lastName: args.lastName,
      pesel: args.pesel,
      dateOfBirth: args.dateOfBirth,
      gender: args.gender,
      email: args.email,
      phone: args.phone,
      address: args.address,
      medicalNotes: args.medicalNotes,
      allergies: args.allergies,
      bloodType: args.bloodType,
      emergencyContactName: args.emergencyContactName,
      emergencyContactPhone: args.emergencyContactPhone,
      referralSource: args.referralSource,
      referredByPatientId: args.referredByPatientId ? (args.referredByPatientId as string) : undefined,
      isActive: true,
      tags: args.tags,
      tagIds: args.tagIds?.map((id) => id as string),
      categoryId: args.categoryId ? (args.categoryId as string) : undefined,
      customFields: args.customFields,
      createdBy: user._id as string,
      createdAt: now,
      updatedAt: now,
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
    tagIds: v.optional(v.array(v.id("tagDefinitions"))),
    categoryId: v.optional(v.id("categoryDefinitions")),
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

    // Dual-write: replicate update to Supabase
    await ctx.scheduler.runAfter(0, updatePatientRef, {
      patientId: patientId as string,
      organizationId: organizationId as string,
      ...Object.fromEntries(
        Object.entries(updates)
          .filter(([k]) => k !== "updatedAt")
          .map(([k, val]) => {
            if (k === "contactId" && val) return [k, val as string];
            if (k === "referredByPatientId" && val) return [k, val as string];
            if (k === "tagIds" && Array.isArray(val)) return [k, val.map((id) => id as string)];
            if (k === "categoryId" && val) return [k, val as string];
            return [k, val];
          })
      ),
      updatedAt: Date.now(),
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

    // Dual-write: replicate soft-delete to Supabase
    await ctx.scheduler.runAfter(0, deletePatientRef, {
      patientId: args.patientId as string,
      organizationId: args.organizationId as string,
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
