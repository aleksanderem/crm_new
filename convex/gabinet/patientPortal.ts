import { query, action, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { validatePortalSession } from "../_helpers/portalSession";
import { createNotificationDirect } from "../notifications";

// ---------------------------------------------------------------------------
// Internal query: validate portal session via Supabase
// ---------------------------------------------------------------------------

export const _validatePortalSessionQuery = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    return await validatePortalSession(ctx, args.tokenHash);
  },
});

// ---------------------------------------------------------------------------
// Queries (unchanged — still read from Convex ctx.db)
// ---------------------------------------------------------------------------

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

export const updateMyProfile = action({
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
    // Validate session via Supabase
    const db = createSupabaseDb();
    const session = await db.query("gabinetPortalSessions")
      .eq("tokenHash", args.tokenHash)
      .first();

    if (!session || !session.isActive || Date.now() > (session.expiresAt as number)) {
      throw new Error("Invalid or expired session");
    }

    const patientId = String(session.patientId);

    // Patch patient in Supabase
    const { tokenHash, ...updates } = args;
    await db.patch("gabinetPatients", patientId, { ...updates, updatedAt: Date.now() });
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
        const treatment = appt.treatmentId ? await ctx.db.get(appt.treatmentId) : null;
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
export const getPublicAvailableSlots = action({
  args: {
    tokenHash: v.string(),
    employeeId: v.string(),
    date: v.string(),
    duration: v.number(),
  },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();

    // Validate portal session (read-only — via Supabase)
    const session = await db
      .query("gabinetPortalSessions")
      .eq("tokenHash", args.tokenHash)
      .first();
    if (!session || !session.isActive || Date.now() > (session.expiresAt as number)) {
      throw new Error("Invalid or expired session");
    }
    const organizationId = String(session.organizationId);

    const { getAvailableSlotsSupabase } = await import("./_availability_supabase");
    return await getAvailableSlotsSupabase(db, {
      organizationId,
      userId: args.employeeId,
      date: args.date,
      duration: args.duration,
      locationId: undefined,
    });
  },
});

/** Book an appointment from the patient portal. */
export const bookFromPortal = action({
  args: {
    tokenHash: v.string(),
    treatmentId: v.string(),
    employeeId: v.optional(v.string()),
    preferredDate: v.string(),
    preferredTime: v.string(),
  },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();

    // Validate session via Supabase
    const session = await db.query("gabinetPortalSessions")
      .eq("tokenHash", args.tokenHash)
      .first();

    if (!session || !session.isActive || Date.now() > (session.expiresAt as number)) {
      throw new Error("Invalid or expired session");
    }

    const patientId = String(session.patientId);
    const organizationId = String(session.organizationId) as Id<"organizations">;

    // Read treatment from Supabase
    const treatment = await db.get("gabinetTreatments", args.treatmentId);
    if (
      !treatment ||
      String(treatment.organizationId) !== String(organizationId) ||
      !treatment.isActive
    ) {
      throw new Error("Treatment not found or inactive");
    }

    // Read patient from Supabase
    const patient = await db.get("gabinetPatients", patientId);
    if (!patient) throw new Error("Patient not found");

    // Resolve employee — if not specified, find any qualified available employee
    let employeeId: string;

    if (args.employeeId) {
      employeeId = args.employeeId;
    } else {
      // Find any qualified active employee with an available slot
      const employees = await db.query("gabinetEmployees")
        .eq("organizationId", String(organizationId))
        .eq("isActive", true)
        .collect();

      const qualifiedEmployees = employees.filter(
        (e) => {
          const qualifiedIds = e.qualifiedTreatmentIds as string[] | undefined;
          return !qualifiedIds || qualifiedIds.length === 0 ||
            qualifiedIds.includes(args.treatmentId);
        },
      );

      const {
        getAvailableSlotsSupabase: _slotsFn,
      } = await import("./_availability_supabase");

      let foundEmployee: string | null = null;
      for (const emp of qualifiedEmployees) {
        const slots = await _slotsFn(db, {
          organizationId: String(organizationId),
          userId: String(emp.userId),
          date: args.preferredDate,
          duration: treatment.duration as number,
        });
        if (slots.some((s) => s.start === args.preferredTime)) {
          foundEmployee = String(emp.userId);
          break;
        }
      }

      if (!foundEmployee) {
        throw new Error("No available employee for this time slot");
      }
      employeeId = foundEmployee;
    }

    // Verify qualification via Supabase
    const {
      checkEmployeeQualificationSupabase,
      checkConflictSupabase,
    } = await import("./_availability_supabase");
    const qualification = await checkEmployeeQualificationSupabase(db, {
      organizationId: String(organizationId),
      userId: employeeId,
      treatmentId: args.treatmentId,
    });
    if (!qualification.qualified) {
      throw new Error(qualification.reason ?? "Employee not qualified");
    }

    // Calculate end time
    const [h, m] = args.preferredTime.split(":").map(Number);
    const endMinutes = h * 60 + m + (treatment.duration as number);
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;

    // Check conflict via Supabase
    const conflict = await checkConflictSupabase(db, {
      organizationId: String(organizationId),
      userId: employeeId,
      date: args.preferredDate,
      startTime: args.preferredTime,
      endTime,
    });
    if (conflict.hasConflict) {
      throw new Error(conflict.reason ?? "Time slot is no longer available");
    }

    // Find org owner via internalQuery
    const ownerUserId = await ctx.runQuery(
      internal.gabinet.patientPortal._findOrgOwner,
      { organizationId },
    ) as string;

    const now = Date.now();
    const patientName = `${patient.firstName}${patient.lastName ? " " + patient.lastName : ""}`;

    // Write appointment directly to Supabase
    const appointmentId = await db.insert("gabinetAppointments", {
      organizationId: String(organizationId),
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
      createdBy: ownerUserId,
      createdAt: now,
      updatedAt: now,
    });

    // Delegate notifications to internalMutation
    try {
      await ctx.runMutation(
        internal.gabinet.patientPortal._bookingNotifications,
        {
          organizationId,
          employeeId,
          patientName,
          treatmentName: treatment.name as string,
          date: args.preferredDate,
          time: args.preferredTime,
        },
      );
    } catch (e) {
      console.error("[bookFromPortal] Notifications FAILED:", e);
    }

    return appointmentId;
  },
});

/**
 * Internal: find org owner user ID.
 */
export const _findOrgOwner = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const ownerMembership = await ctx.db
      .query("teamMemberships")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .filter((q) => q.eq(q.field("role"), "owner"))
      .first();

    if (!ownerMembership) {
      throw new Error("Organization configuration error");
    }

    return String(ownerMembership.userId);
  },
});

/**
 * Internal: send booking notifications to staff and assigned employee.
 */
export const _bookingNotifications = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    employeeId: v.string(),
    patientName: v.string(),
    treatmentName: v.string(),
    date: v.string(),
    time: v.string(),
  },
  handler: async (ctx, args) => {
    const staffMemberships = await ctx.db
      .query("teamMemberships")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const staffToNotify = staffMemberships.filter(
      (m) => m.role === "owner" || m.role === "admin",
    );

    const message = `${args.patientName} prosi o wizytę: ${args.treatmentName} dnia ${args.date} o ${args.time}`;

    for (const staff of staffToNotify) {
      await createNotificationDirect(ctx, {
        organizationId: args.organizationId,
        userId: staff.userId,
        type: "portal_booking_request",
        title: "Nowa rezerwacja online",
        message,
      });
    }

    // Also notify the assigned employee if not already notified
    const employeeUserId = args.employeeId as Id<"users">;
    if (!staffToNotify.some((s) => s.userId === employeeUserId)) {
      await createNotificationDirect(ctx, {
        organizationId: args.organizationId,
        userId: employeeUserId,
        type: "portal_booking_request",
        title: "Nowa rezerwacja online",
        message,
      });
    }
  },
});

// ---------------------------------------------------------------------------
// Reschedule Request
// ---------------------------------------------------------------------------

export const requestReschedule = action({
  args: {
    tokenHash: v.string(),
    appointmentId: v.string(),
    requestedDate: v.string(), // YYYY-MM-DD
    requestedTime: v.string(), // HH:MM
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();

    // Validate session via Supabase
    const session = await db.query("gabinetPortalSessions")
      .eq("tokenHash", args.tokenHash)
      .first();

    if (!session || !session.isActive || Date.now() > (session.expiresAt as number)) {
      throw new Error("Invalid or expired session");
    }

    const patientId = String(session.patientId);
    const organizationId = String(session.organizationId) as Id<"organizations">;

    // Read appointment from Supabase
    const appt = await db.get("gabinetAppointments", args.appointmentId);
    if (
      !appt ||
      String(appt.organizationId) !== String(organizationId) ||
      String(appt.patientId) !== patientId
    ) {
      throw new Error("Appointment not found");
    }

    if (!["scheduled", "confirmed"].includes(appt.status as string)) {
      throw new Error("Only upcoming appointments can be rescheduled");
    }

    // Read patient name from Supabase
    const patient = await db.get("gabinetPatients", patientId);
    const patientName = patient
      ? `${patient.firstName} ${patient.lastName}`
      : "Patient";

    const treatment = appt.treatmentId
      ? await db.get("gabinetTreatments", String(appt.treatmentId))
      : null;
    const treatmentName = (treatment?.name as string) ?? "appointment";

    // Add reschedule request to internal notes
    const requestNote = [
      `[RESCHEDULE REQUEST] ${new Date().toISOString().split("T")[0]}`,
      `Requested date: ${args.requestedDate} at ${args.requestedTime}`,
      ...(args.reason ? [`Reason: ${args.reason}`] : []),
    ].join("\n");

    const existingNotes = (appt.internalNotes as string) ?? "";
    const updatedNotes = existingNotes
      ? `${existingNotes}\n\n${requestNote}`
      : requestNote;

    // Patch appointment in Supabase
    await db.patch("gabinetAppointments", args.appointmentId, {
      internalNotes: updatedNotes,
      updatedAt: Date.now(),
    });

    // Delegate notifications to internalMutation
    try {
      await ctx.runMutation(
        internal.gabinet.patientPortal._rescheduleNotifications,
        {
          organizationId,
          employeeId: String(appt.employeeId),
          patientName,
          treatmentName,
          requestedDate: args.requestedDate,
          requestedTime: args.requestedTime,
        },
      );
    } catch (e) {
      console.error("[requestReschedule] Notifications FAILED:", e);
    }

    return { success: true };
  },
});

/**
 * Internal: send reschedule notifications to staff and assigned employee.
 */
export const _rescheduleNotifications = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    employeeId: v.string(),
    patientName: v.string(),
    treatmentName: v.string(),
    requestedDate: v.string(),
    requestedTime: v.string(),
  },
  handler: async (ctx, args) => {
    const staffMemberships = await ctx.db
      .query("teamMemberships")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .collect();

    const staffToNotify = staffMemberships.filter(
      (m) => m.role === "owner" || m.role === "admin",
    );

    const notifyMessage = `${args.patientName} requests to reschedule ${args.treatmentName} to ${args.requestedDate} at ${args.requestedTime}`;

    for (const staff of staffToNotify) {
      await createNotificationDirect(ctx, {
        organizationId: args.organizationId,
        userId: staff.userId,
        type: "portal_booking_request",
        title: "Reschedule Request",
        message: notifyMessage,
      });
    }

    // Also notify the appointment's employee if not already notified
    const employeeUserId = args.employeeId as Id<"users">;
    if (!staffToNotify.some((s) => s.userId === employeeUserId)) {
      await createNotificationDirect(ctx, {
        organizationId: args.organizationId,
        userId: employeeUserId,
        type: "portal_booking_request",
        title: "Reschedule Request",
        message: notifyMessage,
      });
    }
  },
});
