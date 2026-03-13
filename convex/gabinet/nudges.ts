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
        message: `${count} wizyt bez potwierdzenia SMS`,
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
        message: `${count} wnioskow urlopowych do akceptacji`,
        severity: "red",
      },
    ];
  },
});

// --- Package nudges (placeholder) ---
export const getPackageNudges = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verifyOrgAccess(ctx, args.organizationId);
    return [];
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
        message: `${count} dokumentow oczekuje na podpis pacjenta`,
        severity: "yellow",
      },
    ];
  },
});
