import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { QueryCtx, MutationCtx } from "../_generated/server";
import {
  getAvailableSlots,
  checkEmployeeQualification,
  checkConflict,
} from "./_availability";
import { createNotificationDirect } from "../notifications";

async function validatePortalSession(
  ctx: QueryCtx | MutationCtx,
  tokenHash: string,
): Promise<{
  patientId: Id<"gabinetPatients">;
  organizationId: Id<"organizations">;
}> {
  const session = await ctx.db
    .query("gabinetPortalSessions")
    .withIndex("by_token", (q) => q.eq("tokenHash", tokenHash))
    .first();

  if (!session || !session.isActive || Date.now() > session.expiresAt) {
    throw new Error("Invalid or expired session");
  }

  return {
    patientId: session.patientId,
    organizationId: session.organizationId,
  };
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
    address: v.optional(
      v.object({
        street: v.optional(v.string()),
        city: v.optional(v.string()),
        postalCode: v.optional(v.string()),
      }),
    ),
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
    const { patientId, organizationId } = await validatePortalSession(
      ctx,
      args.tokenHash,
    );

    const appointments = await ctx.db
      .query("gabinetAppointments")
      .withIndex("by_orgAndPatient", (q) =>
        q.eq("organizationId", organizationId).eq("patientId", patientId),
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
      }),
    );

    return enriched.sort((a, b) => b.date.localeCompare(a.date));
  },
});

export const getMyDocuments = query({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const { patientId, organizationId } = await validatePortalSession(
      ctx,
      args.tokenHash,
    );

    return await ctx.db
      .query("gabinetDocuments")
      .withIndex("by_orgAndPatient", (q) =>
        q.eq("organizationId", organizationId).eq("patientId", patientId),
      )
      .collect();
  },
});

export const getMyPackages = query({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const { patientId, organizationId } = await validatePortalSession(
      ctx,
      args.tokenHash,
    );

    const usages = await ctx.db
      .query("gabinetPackageUsage")
      .withIndex("by_orgAndPatient", (q) =>
        q.eq("organizationId", organizationId).eq("patientId", patientId),
      )
      .collect();

    // Enrich with package names
    return await Promise.all(
      usages.map(async (u) => {
        const pkg = await ctx.db.get(u.packageId);
        return { ...u, packageName: pkg?.name ?? "Unknown" };
      }),
    );
  },
});

export const getMyLoyaltyBalance = query({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const { patientId, organizationId } = await validatePortalSession(
      ctx,
      args.tokenHash,
    );

    return await ctx.db
      .query("gabinetLoyaltyPoints")
      .withIndex("by_orgAndPatient", (q) =>
        q.eq("organizationId", organizationId).eq("patientId", patientId),
      )
      .first();
  },
});

export const getMyLoyaltyTransactions = query({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const { patientId, organizationId } = await validatePortalSession(
      ctx,
      args.tokenHash,
    );

    const transactions = await ctx.db
      .query("gabinetLoyaltyTransactions")
      .withIndex("by_orgAndPatient", (q) =>
        q.eq("organizationId", organizationId).eq("patientId", patientId),
      )
      .collect();

    return transactions.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const signDocument = mutation({
  args: {
    tokenHash: v.string(),
    documentId: v.id("gabinetDocuments"),
    signatureData: v.string(),
  },
  handler: async (ctx, args) => {
    const { patientId, organizationId } = await validatePortalSession(
      ctx,
      args.tokenHash,
    );

    const doc = await ctx.db.get(args.documentId);
    if (
      !doc ||
      doc.organizationId !== organizationId ||
      doc.patientId !== patientId
    ) {
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

// ---------------------------------------------------------------------------
// Patient self-booking
// ---------------------------------------------------------------------------

/** List active treatments available for booking. */
export const getBookableTreatments = query({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const { organizationId } = await validatePortalSession(ctx, args.tokenHash);

    const treatments = await ctx.db
      .query("gabinetTreatments")
      .withIndex("by_orgAndActive", (q) =>
        q.eq("organizationId", organizationId).eq("isActive", true),
      )
      .collect();

    return treatments.map((t) => ({
      _id: t._id,
      name: t.name,
      description: t.description,
      category: t.category,
      duration: t.duration,
      price: t.price,
      currency: t.currency ?? "PLN",
    }));
  },
});

/** List active employees qualified for a given treatment. */
export const getQualifiedEmployees = query({
  args: {
    tokenHash: v.string(),
    treatmentId: v.id("gabinetTreatments"),
  },
  handler: async (ctx, args) => {
    const { organizationId } = await validatePortalSession(ctx, args.tokenHash);

    const employees = await ctx.db
      .query("gabinetEmployees")
      .withIndex("by_orgAndActive", (q) =>
        q.eq("organizationId", organizationId).eq("isActive", true),
      )
      .collect();

    // Filter to those qualified for the treatment
    const qualified = employees.filter(
      (e) =>
        e.qualifiedTreatmentIds.length === 0 ||
        e.qualifiedTreatmentIds.includes(args.treatmentId),
    );

    // Resolve user names
    const enriched = await Promise.all(
      qualified.map(async (e) => {
        const user = await ctx.db.get(e.userId);
        return {
          _id: e._id,
          userId: e.userId,
          firstName: e.firstName ?? user?.name?.split(" ")[0] ?? "",
          lastName:
            e.lastName ?? user?.name?.split(" ").slice(1).join(" ") ?? "",
          specialization: e.specialization,
        };
      }),
    );

    return enriched;
  },
});

/** Get available time slots for portal booking. */
export const getPublicAvailableSlots = query({
  args: {
    tokenHash: v.string(),
    employeeId: v.id("users"),
    date: v.string(),
    duration: v.number(),
  },
  handler: async (ctx, args) => {
    const { organizationId } = await validatePortalSession(ctx, args.tokenHash);

    return await getAvailableSlots(ctx, {
      organizationId,
      userId: args.employeeId,
      date: args.date,
      duration: args.duration,
    });
  },
});

/** Book an appointment from the patient portal. */
export const bookFromPortal = mutation({
  args: {
    tokenHash: v.string(),
    treatmentId: v.id("gabinetTreatments"),
    employeeId: v.optional(v.id("users")),
    preferredDate: v.string(),
    preferredTime: v.string(),
  },
  handler: async (ctx, args) => {
    const { patientId, organizationId } = await validatePortalSession(
      ctx,
      args.tokenHash,
    );

    const treatment = await ctx.db.get(args.treatmentId);
    if (
      !treatment ||
      treatment.organizationId !== organizationId ||
      !treatment.isActive
    ) {
      throw new Error("Treatment not found or inactive");
    }

    const patient = await ctx.db.get(patientId);
    if (!patient) throw new Error("Patient not found");

    // Resolve employee — if not specified, find any qualified available employee
    let employeeId: Id<"users">;

    if (args.employeeId) {
      employeeId = args.employeeId;
    } else {
      // Find any qualified active employee with an available slot
      const employees = await ctx.db
        .query("gabinetEmployees")
        .withIndex("by_orgAndActive", (q) =>
          q.eq("organizationId", organizationId).eq("isActive", true),
        )
        .collect();

      const qualifiedEmployees = employees.filter(
        (e) =>
          e.qualifiedTreatmentIds.length === 0 ||
          e.qualifiedTreatmentIds.includes(args.treatmentId),
      );

      let foundEmployee: Id<"users"> | null = null;
      for (const emp of qualifiedEmployees) {
        const slots = await getAvailableSlots(ctx, {
          organizationId,
          userId: emp.userId,
          date: args.preferredDate,
          duration: treatment.duration,
        });
        if (slots.some((s) => s.start === args.preferredTime)) {
          foundEmployee = emp.userId;
          break;
        }
      }

      if (!foundEmployee) {
        throw new Error("No available employee for this time slot");
      }
      employeeId = foundEmployee;
    }

    // Verify qualification
    const qualification = await checkEmployeeQualification(ctx, {
      organizationId,
      userId: employeeId,
      treatmentId: args.treatmentId,
    });
    if (!qualification.qualified) {
      throw new Error(qualification.reason ?? "Employee not qualified");
    }

    // Calculate end time
    const [h, m] = args.preferredTime.split(":").map(Number);
    const endMinutes = h * 60 + m + treatment.duration;
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;

    // Check conflict
    const conflict = await checkConflict(ctx, {
      organizationId,
      userId: employeeId,
      date: args.preferredDate,
      startTime: args.preferredTime,
      endTime,
    });
    if (conflict.hasConflict) {
      throw new Error(conflict.reason ?? "Time slot is no longer available");
    }

    // Find org owner to use as createdBy (portal patients aren't org members)
    const ownerMembership = await ctx.db
      .query("teamMemberships")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .filter((q) => q.eq(q.field("role"), "owner"))
      .first();

    if (!ownerMembership) {
      throw new Error("Organization configuration error");
    }

    const now = Date.now();
    const patientName = `${patient.firstName}${patient.lastName ? " " + patient.lastName : ""}`;

    const appointmentId = await ctx.db.insert("gabinetAppointments", {
      organizationId,
      patientId,
      treatmentId: args.treatmentId,
      employeeId,
      date: args.preferredDate,
      startTime: args.preferredTime,
      endTime,
      status: "pending_confirmation",
      notes: `Rezerwacja online — ${patientName}`,
      isRecurring: false,
      bookedFromPortal: true,
      bookedByPatientId: patientId,
      createdBy: ownerMembership.userId,
      createdAt: now,
      updatedAt: now,
    });

    // Notify all admins and owners about the new booking request
    const staffMemberships = await ctx.db
      .query("teamMemberships")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect();

    const staffToNotify = staffMemberships.filter(
      (m) => m.role === "owner" || m.role === "admin",
    );

    for (const staff of staffToNotify) {
      await createNotificationDirect(ctx, {
        organizationId,
        userId: staff.userId,
        type: "portal_booking_request",
        title: "Nowa rezerwacja online",
        message: `${patientName} prosi o wizytę: ${treatment.name} dnia ${args.preferredDate} o ${args.preferredTime}`,
      });
    }

    // Also notify the assigned employee
    if (!staffToNotify.some((s) => s.userId === employeeId)) {
      await createNotificationDirect(ctx, {
        organizationId,
        userId: employeeId,
        type: "portal_booking_request",
        title: "Nowa rezerwacja online",
        message: `${patientName} prosi o wizytę: ${treatment.name} dnia ${args.preferredDate} o ${args.preferredTime}`,
      });
    }

    return appointmentId;
  },
});

// ---------------------------------------------------------------------------
// Reschedule Request
// ---------------------------------------------------------------------------

export const requestReschedule = mutation({
  args: {
    tokenHash: v.string(),
    appointmentId: v.id("gabinetAppointments"),
    requestedDate: v.string(), // YYYY-MM-DD
    requestedTime: v.string(), // HH:MM
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { patientId, organizationId } = await validatePortalSession(
      ctx,
      args.tokenHash,
    );

    const appt = await ctx.db.get(args.appointmentId);
    if (
      !appt ||
      appt.organizationId !== organizationId ||
      appt.patientId !== patientId
    ) {
      throw new Error("Appointment not found");
    }

    if (!["scheduled", "confirmed"].includes(appt.status)) {
      throw new Error("Only upcoming appointments can be rescheduled");
    }

    const patient = await ctx.db.get(patientId);
    const patientName = patient
      ? `${patient.firstName} ${patient.lastName}`
      : "Patient";

    const treatment = await ctx.db.get(appt.treatmentId);
    const treatmentName = treatment?.name ?? "appointment";

    // Add reschedule request to internal notes
    const requestNote = [
      `[RESCHEDULE REQUEST] ${new Date().toISOString().split("T")[0]}`,
      `Requested date: ${args.requestedDate} at ${args.requestedTime}`,
      ...(args.reason ? [`Reason: ${args.reason}`] : []),
    ].join("\n");

    const existingNotes = appt.internalNotes ?? "";
    const updatedNotes = existingNotes
      ? `${existingNotes}\n\n${requestNote}`
      : requestNote;

    await ctx.db.patch(args.appointmentId, {
      internalNotes: updatedNotes,
      updatedAt: Date.now(),
    });

    // Notify admins and owners about the reschedule request
    const staffMemberships = await ctx.db
      .query("teamMemberships")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", organizationId),
      )
      .collect();

    const staffToNotify = staffMemberships.filter(
      (m) => m.role === "owner" || m.role === "admin",
    );

    const notifyMessage = `${patientName} requests to reschedule ${treatmentName} to ${args.requestedDate} at ${args.requestedTime}`;

    for (const staff of staffToNotify) {
      await createNotificationDirect(ctx, {
        organizationId,
        userId: staff.userId,
        type: "portal_booking_request",
        title: "Reschedule Request",
        message: notifyMessage,
      });
    }

    // Also notify the appointment's employee if not already notified
    if (!staffToNotify.some((s) => s.userId === appt.employeeId)) {
      await createNotificationDirect(ctx, {
        organizationId,
        userId: appt.employeeId,
        type: "portal_booking_request",
        title: "Reschedule Request",
        message: notifyMessage,
      });
    }

    return { success: true };
  },
});
