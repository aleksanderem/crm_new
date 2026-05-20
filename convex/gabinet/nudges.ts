import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import type { SupabaseRow } from "../_helpers/supabaseRows";
import type { NudgeData } from "../nudges";

// All gabinet nudges are Supabase-primary actions now — business tables
// (gabinet_appointments, gabinet_leaves, gabinet_treatment_packages,
// gabinet_package_usage, gabinet_patients, contacts, gabinet_treatments)
// live in Supabase.

async function verify(ctx: any, organizationId: string) {
  await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
    organizationId,
  });
}

// --- Appointment nudges ---
export const getAppointmentNudges = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verify(ctx, args.organizationId);
    const db = createSupabaseDb();
    const todayStr = new Date().toISOString().split("T")[0];

    const unconfirmed = (await db
      .query("gabinetAppointments")
      .eq("organizationId", String(args.organizationId))
      .eq("date", todayStr)
      .collect()) as Array<{ status: string }>;

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
export const getLeaveNudges = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verify(ctx, args.organizationId);
    const db = createSupabaseDb();

    const pending = await db
      .query("gabinetLeaves")
      .eq("organizationId", String(args.organizationId))
      .eq("status", "pending")
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
export const getPackageNudges = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verify(ctx, args.organizationId);
    const db = createSupabaseDb();
    const orgId = String(args.organizationId);

    const nudges: NudgeData[] = [];
    const now = Date.now();
    const thirtyDaysFromNow = now + 30 * 24 * 60 * 60 * 1000;

    const [activePackages, activeUsages] = await Promise.all([
      db.query("gabinetTreatmentPackages").eq("organizationId", orgId).eq("isActive", true).collect(),
      db.query("gabinetPackageUsage").eq("organizationId", orgId).eq("status", "active").collect(),
    ]);

    const expiring = (activeUsages as any[]).filter(
      (u) =>
        u.expiresAt !== undefined &&
        u.expiresAt !== null &&
        (u.expiresAt as number) >= now &&
        (u.expiresAt as number) <= thirtyDaysFromNow,
    );
    if (expiring.length > 0) {
      nudges.push({
        message: "sidebar.nudges.gabinet.packages.expiringSoon",
        messageValues: { count: expiring.length },
        severity: "yellow",
      });
    }

    const packagesWithUsage = new Set(
      (activeUsages as any[]).map((u) => String(u.packageId)),
    );
    const noUsage = (activePackages as any[]).filter(
      (p) => !packagesWithUsage.has(String(p._id ?? p.id)),
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

// --- Patient nudges ---
export const getPatientNudges = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verify(ctx, args.organizationId);
    const db = createSupabaseDb();
    const orgId = String(args.organizationId);

    const nudges: NudgeData[] = [];

    const patients = (await db
      .query("gabinetPatients")
      .eq("organizationId", orgId)
      .collect()) as any[];

    const contactIds = Array.from(
      new Set(
        patients
          .map((p) => (p.contactId ? String(p.contactId) : null))
          .filter((id): id is string => id !== null),
      ),
    );
    const contacts = await Promise.all(
      contactIds.map((cid) => db.get("contacts", cid).catch(() => null)),
    );
    const contactById = new Map(
      contacts
        .filter((c): c is SupabaseRow<"contacts"> => c !== null)
        .map((c) => [String(c._id), c]),
    );

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

    const ninetyDaysAgoStr = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const recentAppointments = (await db
      .query("gabinetAppointments")
      .eq("organizationId", orgId)
      .gte("date", ninetyDaysAgoStr)
      .collect()) as any[];

    const recentPatientIds = new Set(
      recentAppointments
        .filter((a) => a.status !== "cancelled" && a.status !== "no_show")
        .map((a) => String(a.patientId)),
    );

    const noRecentVisit = patients.filter(
      (p) => !recentPatientIds.has(String(p._id ?? p.id)),
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
export const getTreatmentNudges = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verify(ctx, args.organizationId);
    const db = createSupabaseDb();

    const treatments = (await db
      .query("gabinetTreatments")
      .eq("organizationId", String(args.organizationId))
      .collect()) as any[];

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

// --- Get all Gabinet nudges ---
export const getAll = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verify(ctx, args.organizationId);
    const nudges: NudgeData[] = [];

    // Inline fetches — each sub-fetch already runs as its own action; no need
    // for ctx.runAction round-trips.
    const db = createSupabaseDb();
    const orgId = String(args.organizationId);
    const todayStr = new Date().toISOString().split("T")[0];
    const now = Date.now();
    const thirtyDaysFromNow = now + 30 * 24 * 60 * 60 * 1000;
    const ninetyDaysAgoStr = new Date(now - 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const [
      todayAppointments,
      pendingLeaves,
      activePackages,
      activeUsages,
      patients,
      recentAppointments,
      treatments,
    ] = await Promise.all([
      db.query("gabinetAppointments").eq("organizationId", orgId).eq("date", todayStr).collect(),
      db.query("gabinetLeaves").eq("organizationId", orgId).eq("status", "pending").collect(),
      db.query("gabinetTreatmentPackages").eq("organizationId", orgId).eq("isActive", true).collect(),
      db.query("gabinetPackageUsage").eq("organizationId", orgId).eq("status", "active").collect(),
      db.query("gabinetPatients").eq("organizationId", orgId).collect(),
      db
        .query("gabinetAppointments")
        .eq("organizationId", orgId)
        .gte("date", ninetyDaysAgoStr)
        .collect(),
      db.query("gabinetTreatments").eq("organizationId", orgId).collect(),
    ]);

    // Appointment nudge
    const unconfirmed = (todayAppointments as any[]).filter((a) => a.status === "scheduled").length;
    if (unconfirmed > 0) {
      nudges.push({
        message: "sidebar.nudges.gabinet.appointments.unconfirmedSms",
        messageValues: { count: unconfirmed },
        severity: "yellow",
      });
    }

    // Leave nudge
    if (pendingLeaves.length > 0) {
      nudges.push({
        message: "sidebar.nudges.gabinet.leave.pendingApproval",
        messageValues: { count: pendingLeaves.length },
        severity: "red",
      });
    }

    // Package nudges
    const expiring = (activeUsages as any[]).filter(
      (u) =>
        u.expiresAt !== undefined &&
        u.expiresAt !== null &&
        (u.expiresAt as number) >= now &&
        (u.expiresAt as number) <= thirtyDaysFromNow,
    );
    if (expiring.length > 0) {
      nudges.push({
        message: "sidebar.nudges.gabinet.packages.expiringSoon",
        messageValues: { count: expiring.length },
        severity: "yellow",
      });
    }
    const packagesWithUsage = new Set(
      (activeUsages as any[]).map((u) => String(u.packageId)),
    );
    const noUsage = (activePackages as any[]).filter(
      (p) => !packagesWithUsage.has(String(p._id ?? p.id)),
    );
    if (noUsage.length > 0) {
      nudges.push({
        message: "sidebar.nudges.gabinet.packages.noUsage",
        messageValues: { count: noUsage.length },
        severity: "yellow",
      });
    }

    // Patient nudges
    const contactIds = Array.from(
      new Set(
        (patients as any[])
          .map((p) => (p.contactId ? String(p.contactId) : null))
          .filter((id): id is string => id !== null),
      ),
    );
    const contacts = await Promise.all(
      contactIds.map((cid) => db.get("contacts", cid).catch(() => null)),
    );
    const contactById = new Map(
      contacts
        .filter((c): c is SupabaseRow<"contacts"> => c !== null)
        .map((c) => [String(c._id), c]),
    );
    const missingContact = (patients as any[]).filter((patient) => {
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

    const recentPatientIds = new Set(
      (recentAppointments as any[])
        .filter((a) => a.status !== "cancelled" && a.status !== "no_show")
        .map((a) => String(a.patientId)),
    );
    const noRecentVisit = (patients as any[]).filter(
      (p) => !recentPatientIds.has(String(p._id ?? p.id)),
    );
    if (noRecentVisit.length > 3) {
      nudges.push({
        message: "sidebar.nudges.gabinet.patients.noRecentVisit",
        messageValues: { count: noRecentVisit.length },
        severity: "yellow",
      });
    }

    // Treatment nudge
    const activeTreatments = (treatments as any[]).filter((t) => t.isActive !== false);
    const noPrice = activeTreatments.filter((t) => !t.price || t.price === 0);
    if (noPrice.length > 0) {
      nudges.push({
        message: "sidebar.nudges.gabinet.treatments.noPrice",
        messageValues: { count: noPrice.length },
        severity: "yellow",
      });
    }

    // Sort by severity (red > yellow > green) and limit to 10
    const severityOrder = { red: 0, yellow: 1, green: 2 };
    nudges.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return nudges.slice(0, 10);
  },
});
