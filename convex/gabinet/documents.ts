import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { verifyOrgAccess } from "../_helpers/auth";
import { logActivity } from "../_helpers/activities";
import { gabinetDocTypeValidator, gabinetDocStatusValidator } from "../schema";

function renderTemplate(content: string, data: Record<string, string>): string {
  return content.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, key) => {
    const parts = key.split(".");
    let val: any = data;
    for (const p of parts) {
      val = val?.[p];
    }
    return val ?? `{{${key}}}`;
  });
}

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
    status: v.optional(gabinetDocStatusValidator),
    patientId: v.optional(v.id("gabinetPatients")),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    if (args.patientId) {
      const all = await ctx.db
        .query("gabinetDocuments")
        .withIndex("by_orgAndPatient", (q) =>
          q.eq("organizationId", args.organizationId).eq("patientId", args.patientId!)
        )
        .collect();
      const filtered = args.status ? all.filter((d) => d.status === args.status) : all;
      return { page: filtered, isDone: true, continueCursor: "" };
    }

    if (args.status) {
      const all = await ctx.db
        .query("gabinetDocuments")
        .withIndex("by_orgAndStatus", (q) =>
          q.eq("organizationId", args.organizationId).eq("status", args.status!)
        )
        .collect();
      return { page: all, isDone: true, continueCursor: "" };
    }

    return await ctx.db
      .query("gabinetDocuments")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getById = query({
  args: {
    organizationId: v.id("organizations"),
    documentId: v.id("gabinetDocuments"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.organizationId !== args.organizationId) throw new Error("Document not found");
    return doc;
  },
});

export const listByPatient = query({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.id("gabinetPatients"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.db
      .query("gabinetDocuments")
      .withIndex("by_orgAndPatient", (q) =>
        q.eq("organizationId", args.organizationId).eq("patientId", args.patientId)
      )
      .collect();
  },
});

export const getByAppointment = query({
  args: {
    organizationId: v.id("organizations"),
    appointmentId: v.id("gabinetAppointments"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.db
      .query("gabinetDocuments")
      .withIndex("by_appointment", (q) => q.eq("appointmentId", args.appointmentId))
      .collect();
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.id("gabinetPatients"),
    appointmentId: v.optional(v.id("gabinetAppointments")),
    templateId: v.optional(v.id("gabinetDocumentTemplates")),
    title: v.string(),
    type: gabinetDocTypeValidator,
    content: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();

    let content = args.content ?? "";

    // Render template if provided
    if (args.templateId) {
      const tmpl = await ctx.db.get(args.templateId);
      if (tmpl) {
        const patient = await ctx.db.get(args.patientId);
        if (patient) {
          content = renderTemplate(tmpl.content, {
            "patient.firstName": patient.firstName,
            "patient.lastName": patient.lastName,
            "patient.email": patient.email,
            "patient.phone": patient.phone ?? "",
            "patient.pesel": patient.pesel ?? "",
            "patient.dateOfBirth": patient.dateOfBirth ?? "",
            "date": new Date().toISOString().split("T")[0],
          });
        } else {
          content = tmpl.content;
        }
      }
    }

    const id = await ctx.db.insert("gabinetDocuments", {
      organizationId: args.organizationId,
      patientId: args.patientId,
      appointmentId: args.appointmentId,
      templateId: args.templateId,
      title: args.title,
      type: args.type,
      content,
      status: "draft",
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetDocument",
      entityId: id,
      action: "created",
      description: `Created document: ${args.title}`,
      performedBy: user._id,
    });

    return id;
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    documentId: v.id("gabinetDocuments"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.organizationId !== args.organizationId) throw new Error("Document not found");

    const { organizationId, documentId, ...updates } = args;
    await ctx.db.patch(documentId, { ...updates, updatedAt: Date.now() });
    return documentId;
  },
});

export const requestSignature = mutation({
  args: {
    organizationId: v.id("organizations"),
    documentId: v.id("gabinetDocuments"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.organizationId !== args.organizationId) throw new Error("Document not found");

    await ctx.db.patch(args.documentId, {
      status: "pending_signature",
      updatedAt: Date.now(),
    });
  },
});

export const sign = mutation({
  args: {
    organizationId: v.id("organizations"),
    documentId: v.id("gabinetDocuments"),
    signatureData: v.string(),
    signedByPatient: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.organizationId !== args.organizationId) throw new Error("Document not found");

    await ctx.db.patch(args.documentId, {
      status: "signed",
      signatureData: args.signatureData,
      signedAt: Date.now(),
      signedByPatient: args.signedByPatient,
      signedByEmployee: args.signedByPatient ? undefined : user._id,
      updatedAt: Date.now(),
    });

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetDocument",
      entityId: args.documentId,
      action: "updated",
      description: `Document signed: ${doc.title}`,
      performedBy: user._id,
    });
  },
});

export const archive = mutation({
  args: {
    organizationId: v.id("organizations"),
    documentId: v.id("gabinetDocuments"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.organizationId !== args.organizationId) throw new Error("Document not found");

    await ctx.db.patch(args.documentId, { status: "archived", updatedAt: Date.now() });
  },
});
