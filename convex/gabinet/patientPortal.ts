import { action, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import {
  validatePortalSession,
  validatePortalSessionSupabase,
} from "../_helpers/portalSession";
import { createNotificationDirect } from "../notifications";
import {
  getAvailableSlotsSupabase,
  checkEmployeeQualificationSupabase,
  checkConflictSupabase,
} from "./_availability_supabase";

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
// Patient-portal reads (actions — gabinetPortalSessions and all dependent
// gabinet/* tables are Supabase-only since the dual-write cleanup, so these
// must hit Supabase rather than Convex ctx.db).
// ---------------------------------------------------------------------------

export const getMyProfile = action({
  args: { tokenHash: v.string() },
  handler: async (_ctx, args) => {
    const db = createSupabaseDb();
    const { patientId } = await validatePortalSessionSupabase(db, args.tokenHash);

    const patient = await db.get("gabinetPatients", patientId);
    if (!patient) throw new Error("Patient not found");

    const address = patient.address as
      | {
          street?: string;
          city?: string;
          postalCode?: string;
        }
      | null
      | undefined;

    return {
      firstName: (patient.firstName as string | null) ?? "",
      lastName: (patient.lastName as string | null) ?? "",
      email: (patient.email as string | null) ?? undefined,
      phone: (patient.phone as string | null) ?? undefined,
      address: address ?? undefined,
      emergencyContactName:
        (patient.emergencyContactName as string | null) ?? undefined,
      emergencyContactPhone:
        (patient.emergencyContactPhone as string | null) ?? undefined,
      dateOfBirth: (patient.dateOfBirth as string | null) ?? undefined,
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
  handler: async (_ctx, args) => {
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

export const getMyAppointments = action({
  args: { tokenHash: v.string() },
  handler: async (_ctx, args) => {
    const db = createSupabaseDb();
    const { patientId, organizationId } = await validatePortalSessionSupabase(
      db,
      args.tokenHash,
    );

    const appointments = await db
      .query("gabinetAppointments")
      .eq("organizationId", organizationId)
      .eq("patientId", patientId)
      .collect();

    // Resolve treatment names in one batch to avoid N+1 reads against Supabase.
    const treatmentIds = Array.from(
      new Set(
        appointments
          .map((a) => a.treatmentId)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    );
    const treatments = await db.getMany("gabinetTreatments", treatmentIds);
    const treatmentNameById = new Map<string, string>();
    for (const t of treatments) {
      treatmentNameById.set(String(t._id), String(t.name ?? "Unknown"));
    }

    const enriched = appointments.map((appt) => ({
      _id: String(appt._id),
      date: appt.date as string,
      startTime: appt.startTime as string,
      endTime: appt.endTime as string,
      status: appt.status as string,
      treatmentName:
        (appt.treatmentId &&
          treatmentNameById.get(String(appt.treatmentId))) ??
        "Unknown",
      notes: (appt.notes as string | null) ?? undefined,
    }));

    return enriched.sort((a, b) => b.date.localeCompare(a.date));
  },
});

export const getMyPackages = action({
  args: { tokenHash: v.string() },
  handler: async (_ctx, args) => {
    const db = createSupabaseDb();
    const { patientId, organizationId } = await validatePortalSessionSupabase(
      db,
      args.tokenHash,
    );

    const usages = await db
      .query("gabinetPackageUsage")
      .eq("organizationId", organizationId)
      .eq("patientId", patientId)
      .collect();

    const packageIds = Array.from(
      new Set(
        usages
          .map((u) => u.packageId)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    );
    const pkgs = await db.getMany("gabinetTreatmentPackages", packageIds);
    const packageNameById = new Map<string, string>();
    for (const p of pkgs) {
      packageNameById.set(String(p._id), String(p.name ?? "Unknown"));
    }

    return usages.map((u) => ({
      ...u,
      packageName: packageNameById.get(String(u.packageId)) ?? "Unknown",
    }));
  },
});

export const getMyLoyaltyBalance = action({
  args: { tokenHash: v.string() },
  handler: async (_ctx, args) => {
    const db = createSupabaseDb();
    const { patientId, organizationId } = await validatePortalSessionSupabase(
      db,
      args.tokenHash,
    );

    return await db
      .query("gabinetLoyaltyPoints")
      .eq("organizationId", organizationId)
      .eq("patientId", patientId)
      .first();
  },
});

export const getMyLoyaltyTransactions = action({
  args: { tokenHash: v.string() },
  handler: async (_ctx, args) => {
    const db = createSupabaseDb();
    const { patientId, organizationId } = await validatePortalSessionSupabase(
      db,
      args.tokenHash,
    );

    const transactions = await db
      .query("gabinetLoyaltyTransactions")
      .eq("organizationId", organizationId)
      .eq("patientId", patientId)
      .collect();

    return transactions.sort(
      (a, b) => (b.createdAt as number) - (a.createdAt as number),
    );
  },
});

// ---------------------------------------------------------------------------
// Patient self-booking
// ---------------------------------------------------------------------------

/** List active treatments available for booking. */
export const getBookableTreatments = action({
  args: { tokenHash: v.string() },
  handler: async (_ctx, args) => {
    const db = createSupabaseDb();

    // Validate session via Supabase (matches bookFromPortal — the Convex
    // gabinetPortalSessions table is no longer the source of truth).
    const session = await db
      .query("gabinetPortalSessions")
      .eq("tokenHash", args.tokenHash)
      .first();
    if (
      !session ||
      !session.isActive ||
      Date.now() > (session.expiresAt as number)
    ) {
      throw new Error("Invalid or expired session");
    }
    const organizationId = String(session.organizationId);

    const treatments = await db
      .query("gabinetTreatments")
      .eq("organizationId", organizationId)
      .eq("isActive", true)
      .collect();

    // Resolve structured `categoryId` → name so newly created treatments
    // (which only set categoryId) group correctly on the booking page. Fall
    // back to the legacy free-text `category` string for records created
    // before structured categories (see #471, #492).
    const categories = await db
      .query("categoryDefinitions")
      .eq("organizationId", organizationId)
      .eq("entityType", "gabinetTreatment")
      .collect();
    const categoryNameById = new Map<string, string>();
    for (const c of categories) {
      if (!c.isDeleted) categoryNameById.set(String(c._id), String(c.name));
    }

    return treatments.map((t) => {
      let resolvedCategory: string | null = null;
      if (t.categoryId) {
        resolvedCategory = categoryNameById.get(String(t.categoryId)) ?? null;
      }
      if (!resolvedCategory && typeof t.category === "string") {
        resolvedCategory = t.category;
      }
      return {
        _id: t._id as string,
        name: t.name as string,
        description: (t.description as string | null) ?? undefined,
        category: resolvedCategory,
        duration: t.duration as number,
        price: t.price as number,
        currency: (t.currency as string | null) ?? "PLN",
      };
    });
  },
});

/** List active employees qualified for a given treatment. */
export const getQualifiedEmployees = action({
  args: {
    tokenHash: v.string(),
    treatmentId: v.string(),
  },
  handler: async (_ctx, args) => {
    const db = createSupabaseDb();

    // Validate session via Supabase (matches bookFromPortal — the Convex
    // gabinetPortalSessions table is no longer the source of truth).
    const session = await db
      .query("gabinetPortalSessions")
      .eq("tokenHash", args.tokenHash)
      .first();
    if (
      !session ||
      !session.isActive ||
      Date.now() > (session.expiresAt as number)
    ) {
      throw new Error("Invalid or expired session");
    }
    const organizationId = String(session.organizationId);

    const employees = await db
      .query("gabinetEmployees")
      .eq("organizationId", organizationId)
      .eq("isActive", true)
      .collect();

    // Filter to those qualified for the treatment (empty list ⇒ qualified
    // for everything, matching the original Convex behaviour).
    const qualified = employees.filter((e) => {
      const qualifiedIds = (e.qualifiedTreatmentIds as string[] | undefined) ?? [];
      return qualifiedIds.length === 0 || qualifiedIds.includes(args.treatmentId);
    });

    // Resolve user names from Supabase, falling back to names stored on
    // the employee row itself.
    return await Promise.all(
      qualified.map(async (e) => {
        const user = await db.get("users", String(e.userId)).catch(() => null);
        const userName = (user?.name as string | null) ?? null;
        return {
          _id: e._id as string,
          userId: e.userId as string,
          firstName:
            (e.firstName as string | null) ?? userName?.split(" ")[0] ?? "",
          lastName:
            (e.lastName as string | null) ??
            userName?.split(" ").slice(1).join(" ") ??
            "",
          specialization: (e.specialization as string | null) ?? undefined,
        };
      }),
    );
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
  handler: async (_ctx, args) => {
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

      let foundEmployee: string | null = null;
      for (const emp of qualifiedEmployees) {
        const slots = await getAvailableSlotsSupabase(db, {
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
