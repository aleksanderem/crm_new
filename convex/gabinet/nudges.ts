import { query } from "../_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "../_helpers/auth";
import type { NudgeData } from "../nudges";

// --- Appointment nudges ---
export const getAppointmentNudges = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verifyOrgAccess(ctx, args.organizationId);

    const todayStr = new Date().toISOString().split("T")[0];

    const unconfirmed = await ctx.db
      .query("gabinetAppointments")
      .withIndex("by_orgAndDate", (q) =>
        q.eq("organizationId", args.organizationId).eq("date", todayStr),
      )
      .collect();

    const count = unconfirmed.filter((a) => a.status === "scheduled").length;

    if (count === 0) return [];

    return [
      {
        message: "sidebar.nudges.gabinet.appointments.unconfirmedSms",
        messageValues: { count },
        severity: "yellow",
      },
    ];
  },
});

// --- Leave nudges ---
export const getLeaveNudges = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verifyOrgAccess(ctx, args.organizationId);

    const pending = await ctx.db
      .query("gabinetLeaves")
      .withIndex("by_orgAndStatus", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "pending"),
      )
      .collect();

    const count = pending.length;

    if (count === 0) return [];

    return [
      {
        message: "sidebar.nudges.gabinet.leave.pendingApproval",
        messageValues: { count },
        severity: "red",
      },
    ];
  },
});

// --- Package nudges ---
export const getPackageNudges = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verifyOrgAccess(ctx, args.organizationId);
    const nudges: NudgeData[] = [];
    const now = Date.now();
    const thirtyDaysFromNow = now + 30 * 24 * 60 * 60 * 1000;

    const activePackages = await ctx.db
      .query("gabinetTreatmentPackages")
      .withIndex("by_orgAndActive", (q) =>
        q.eq("organizationId", args.organizationId).eq("isActive", true),
      )
      .collect();

    // Expiring package usages within 30 days
    const activeUsages = await ctx.db
      .query("gabinetPackageUsage")
      .withIndex("by_orgAndStatus", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "active"),
      )
      .collect();

    const expiring = activeUsages.filter(
      (u) =>
        u.expiresAt !== undefined &&
        u.expiresAt >= now &&
        u.expiresAt <= thirtyDaysFromNow,
    );
    if (expiring.length > 0) {
      nudges.push({
        message: "sidebar.nudges.gabinet.packages.expiringSoon",
        messageValues: { count: expiring.length },
        severity: "yellow",
      });
    }

    // Active packages with 0 active usage
    const packagesWithUsage = new Set(
      activeUsages.map((u) => String(u.packageId)),
    );
    const noUsage = activePackages.filter(
      (p) => !packagesWithUsage.has(String(p._id)),
    );
    if (noUsage.length > 0) {
      nudges.push({
        message: "sidebar.nudges.gabinet.packages.noUsage",
        messageValues: { count: noUsage.length },
        severity: "yellow",
      });
    }

    return nudges.slice(0, 2);
  },
});

// --- Document nudges ---
export const getDocumentNudges = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verifyOrgAccess(ctx, args.organizationId);

    const pending = await ctx.db
      .query("gabinetDocuments")
      .withIndex("by_orgAndStatus", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("status", "pending_signature"),
      )
      .collect();

    const count = pending.length;

    if (count === 0) return [];

    return [
      {
        message: "sidebar.nudges.gabinet.documents.pendingSignature",
        messageValues: { count },
        severity: "yellow",
      },
    ];
  },
});

// --- Patient nudges ---
export const getPatientNudges = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verifyOrgAccess(ctx, args.organizationId);
    const nudges: NudgeData[] = [];

    const patients = await ctx.db
      .query("gabinetPatients")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const contactIds = Array.from(
      new Set(
        patients
          .map((patient) => patient.contactId)
          .filter((contactId): contactId is NonNullable<typeof contactId> => contactId !== undefined),
      ),
    );
    const contacts = await Promise.all(contactIds.map((contactId) => ctx.db.get(contactId)));
    const contactById = new Map(
      contacts.filter((contact): contact is NonNullable<typeof contact> => contact !== null).map((contact) => [String(contact._id), contact]),
    );

    // Patients missing phone or email - check via linked contact
    const missingContact = patients.filter((patient) => {
      if (!patient.contactId) return true;
      const contact = contactById.get(String(patient.contactId));
      return !contact || (!contact.phone && !contact.email);
    });

    if (missingContact.length > 0) {
      nudges.push({
        message: "sidebar.nudges.gabinet.patients.missingContact",
        messageValues: { count: missingContact.length },
        severity: "yellow",
      });
    }

    // Patients with no recent visit (90 days)
    const ninetyDaysAgoStr = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const recentAppointments = await ctx.db
      .query("gabinetAppointments")
      .withIndex("by_orgAndDate", (q) =>
        q.eq("organizationId", args.organizationId).gte("date", ninetyDaysAgoStr),
      )
      .collect();

    const recentPatientIds = new Set(
      recentAppointments
        .filter((a) => a.status !== "cancelled" && a.status !== "no_show")
        .map((a) => String(a.patientId)),
    );

    const noRecentVisit = patients.filter(
      (p) => !recentPatientIds.has(String(p._id)),
    );
    if (noRecentVisit.length > 3) {
      nudges.push({
        message: "sidebar.nudges.gabinet.patients.noRecentVisit",
        messageValues: { count: noRecentVisit.length },
        severity: "yellow",
      });
    }

    return nudges.slice(0, 2);
  },
});

// --- Treatment nudges ---
export const getTreatmentNudges = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verifyOrgAccess(ctx, args.organizationId);

    const treatments = await ctx.db
      .query("gabinetTreatments")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const activeTreatments = treatments.filter((t) => t.isActive !== false);
    const noPrice = activeTreatments.filter((t) => !t.price || t.price === 0);

    if (noPrice.length > 0) {
      return [
        {
          message: "sidebar.nudges.gabinet.treatments.noPrice",
          messageValues: { count: noPrice.length },
          severity: "yellow",
        },
      ];
    }
    return [];
  },
});
