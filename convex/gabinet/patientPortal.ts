import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { QueryCtx, MutationCtx } from "../_generated/server";

async function validatePortalSession(
  ctx: QueryCtx | MutationCtx,
  tokenHash: string
): Promise<{ patientId: Id<"gabinetPatients">; organizationId: Id<"organizations"> }> {
  const session = await ctx.db
    .query("gabinetPortalSessions")
    .withIndex("by_token", (q) => q.eq("tokenHash", tokenHash))
    .first();

  if (!session || !session.isActive || Date.now() > session.expiresAt) {
    throw new Error("Invalid or expired session");
  }

  return { patientId: session.patientId, organizationId: session.organizationId };
}

export const getMyProfile = query({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const { patientId } = await validatePortalSession(ctx, args.tokenHash);
    const patient = await ctx.db.get(patientId);
    if (!patient) throw new Error("Patient not found");

    return {
      firstName: patient.firstName,
      lastName: patient.lastName,
      email: patient.email,
      phone: patient.phone,
      address: patient.address,
      emergencyContactName: patient.emergencyContactName,
      emergencyContactPhone: patient.emergencyContactPhone,
      dateOfBirth: patient.dateOfBirth,
    };
  },
});

export const updateMyProfile = mutation({
  args: {
    tokenHash: v.string(),
    phone: v.optional(v.string()),
    address: v.optional(v.object({
      street: v.optional(v.string()),
      city: v.optional(v.string()),
      postalCode: v.optional(v.string()),
    })),
    emergencyContactName: v.optional(v.string()),
    emergencyContactPhone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { patientId } = await validatePortalSession(ctx, args.tokenHash);
    const { tokenHash, ...updates } = args;
    await ctx.db.patch(patientId, { ...updates, updatedAt: Date.now() });
  },
});

export const getMyAppointments = query({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const { patientId, organizationId } = await validatePortalSession(ctx, args.tokenHash);

    const appointments = await ctx.db
      .query("gabinetAppointments")
      .withIndex("by_orgAndPatient", (q) =>
        q.eq("organizationId", organizationId).eq("patientId", patientId)
      )
      .collect();

    // Enrich with treatment names
    const enriched = await Promise.all(
      appointments.map(async (appt) => {
        const treatment = await ctx.db.get(appt.treatmentId);
        return {
          _id: appt._id,
          date: appt.date,
          startTime: appt.startTime,
          endTime: appt.endTime,
          status: appt.status,
          treatmentName: treatment?.name ?? "Unknown",
          notes: appt.notes,
        };
      })
    );

    return enriched.sort((a, b) => b.date.localeCompare(a.date));
  },
});

export const getMyDocuments = query({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const { patientId, organizationId } = await validatePortalSession(ctx, args.tokenHash);

    return await ctx.db
      .query("gabinetDocuments")
      .withIndex("by_orgAndPatient", (q) =>
        q.eq("organizationId", organizationId).eq("patientId", patientId)
      )
      .collect();
  },
});

export const getMyPackages = query({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const { patientId, organizationId } = await validatePortalSession(ctx, args.tokenHash);

    const usages = await ctx.db
      .query("gabinetPackageUsage")
      .withIndex("by_orgAndPatient", (q) =>
        q.eq("organizationId", organizationId).eq("patientId", patientId)
      )
      .collect();

    // Enrich with package names
    return await Promise.all(
      usages.map(async (u) => {
        const pkg = await ctx.db.get(u.packageId);
        return { ...u, packageName: pkg?.name ?? "Unknown" };
      })
    );
  },
});

export const getMyLoyaltyBalance = query({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const { patientId, organizationId } = await validatePortalSession(ctx, args.tokenHash);

    return await ctx.db
      .query("gabinetLoyaltyPoints")
      .withIndex("by_orgAndPatient", (q) =>
        q.eq("organizationId", organizationId).eq("patientId", patientId)
      )
      .first();
  },
});

export const signDocument = mutation({
  args: {
    tokenHash: v.string(),
    documentId: v.id("gabinetDocuments"),
    signatureData: v.string(),
  },
  handler: async (ctx, args) => {
    const { patientId, organizationId } = await validatePortalSession(ctx, args.tokenHash);

    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.organizationId !== organizationId || doc.patientId !== patientId) {
      throw new Error("Document not found");
    }
    if (doc.status !== "pending_signature") {
      throw new Error("Document is not pending signature");
    }

    await ctx.db.patch(args.documentId, {
      status: "signed",
      signatureData: args.signatureData,
      signedAt: Date.now(),
      signedByPatient: true,
      updatedAt: Date.now(),
    });
  },
});
