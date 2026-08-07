import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { logError } from "../_helpers/logged";
import { gabinetWaitlistStatusValidator } from "../schema";
import type { GabinetWaitlistRow } from "../_helpers/supabaseRows";

export const addToWaitlist = action({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.string(),
    treatmentId: v.optional(v.string()),
    employeeId: v.optional(v.string()),
    preferredDates: v.optional(v.array(v.string())),
    preferredTimes: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    priority: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<string> => {
    try {
      const authResult = await ctx.runAction(
        internal._helpers.authAction.verifyOrgAccess,
        { organizationId: args.organizationId },
      );
      await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
        organizationId: args.organizationId,
      });
      const perm = (await ctx.runAction(
        internal._helpers.authAction.checkPermission,
        {
          organizationId: args.organizationId,
          feature: "gabinet_appointments",
          action: "create",
        },
      )) as { allowed: boolean; scope: string };
      if (!perm.allowed) throw new Error("Permission denied");

      const now = Date.now();
      const db = createSupabaseDb();

      const id = await db.insert("gabinetWaitlist", {
        organizationId: String(args.organizationId),
        patientId: args.patientId,
        treatmentId: args.treatmentId ?? null,
        employeeId: args.employeeId ?? null,
        preferredDates: args.preferredDates ?? null,
        preferredTimes: args.preferredTimes ?? null,
        notes: args.notes ?? null,
        status: "waiting",
        priority: args.priority ?? 0,
        createdBy: String(authResult.userId),
        createdAt: now,
        updatedAt: now,
      });

      return id;
    } catch (err) {
      await logError(ctx, err, {
        scope: "gabinet.waitlist",
        fnName: "addToWaitlist",
        argsJson: JSON.stringify({
          organizationId: args.organizationId,
          patientId: args.patientId,
        }),
        organizationId: args.organizationId,
      });
      throw err;
    }
  },
});

export const removeFromWaitlist = action({
  args: {
    organizationId: v.id("organizations"),
    waitlistId: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    try {
      await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
        organizationId: args.organizationId,
      });
      await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
        organizationId: args.organizationId,
      });
      const perm = (await ctx.runAction(
        internal._helpers.authAction.checkPermission,
        {
          organizationId: args.organizationId,
          feature: "gabinet_appointments",
          action: "delete",
        },
      )) as { allowed: boolean; scope: string };
      if (!perm.allowed) throw new Error("Permission denied");

      const db = createSupabaseDb();
      const entry = await db.get("gabinetWaitlist", args.waitlistId);
      if (
        !entry ||
        String(entry.organizationId) !== String(args.organizationId)
      ) {
        throw new Error("Waitlist entry not found");
      }

      await db.patch("gabinetWaitlist", args.waitlistId, {
        status: "cancelled",
        updatedAt: Date.now(),
      });
    } catch (err) {
      await logError(ctx, err, {
        scope: "gabinet.waitlist",
        fnName: "removeFromWaitlist",
        argsJson: JSON.stringify({
          organizationId: args.organizationId,
          waitlistId: args.waitlistId,
        }),
        organizationId: args.organizationId,
      });
      throw err;
    }
  },
});

export const markNotified = action({
  args: {
    organizationId: v.id("organizations"),
    waitlistId: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    try {
      await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
        organizationId: args.organizationId,
      });
      await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
        organizationId: args.organizationId,
      });
      const perm = (await ctx.runAction(
        internal._helpers.authAction.checkPermission,
        {
          organizationId: args.organizationId,
          feature: "gabinet_appointments",
          action: "edit",
        },
      )) as { allowed: boolean; scope: string };
      if (!perm.allowed) throw new Error("Permission denied");

      const db = createSupabaseDb();
      const entry = await db.get("gabinetWaitlist", args.waitlistId);
      if (
        !entry ||
        String(entry.organizationId) !== String(args.organizationId)
      ) {
        throw new Error("Waitlist entry not found");
      }

      const now = Date.now();
      await db.patch("gabinetWaitlist", args.waitlistId, {
        status: "notified",
        notifiedAt: now,
        updatedAt: now,
      });
    } catch (err) {
      await logError(ctx, err, {
        scope: "gabinet.waitlist",
        fnName: "markNotified",
        argsJson: JSON.stringify({
          organizationId: args.organizationId,
          waitlistId: args.waitlistId,
        }),
        organizationId: args.organizationId,
      });
      throw err;
    }
  },
});

export const getWaitlistByOrg = action({
  args: {
    organizationId: v.id("organizations"),
    status: v.optional(gabinetWaitlistStatusValidator),
  },
  handler: async (ctx, args): Promise<GabinetWaitlistRow[]> => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
      organizationId: args.organizationId,
    });
    const perm = (await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "gabinet_appointments",
        action: "view",
      },
    )) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);

    let q = db.query("gabinetWaitlist").eq("organizationId", orgIdStr);
    if (args.status) {
      q = q.eq("status", args.status);
    }
    const rows = await q.order("priority", true).order("createdAt", true).collect();
    return rows as GabinetWaitlistRow[];
  },
});

export const getWaitlistForPatient = action({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.string(),
  },
  handler: async (ctx, args): Promise<GabinetWaitlistRow[]> => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
      organizationId: args.organizationId,
    });
    const perm = (await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "gabinet_appointments",
        action: "view",
      },
    )) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const rows = await db
      .query("gabinetWaitlist")
      .eq("organizationId", String(args.organizationId))
      .eq("patientId", args.patientId)
      .order("createdAt", false)
      .collect();
    return rows as GabinetWaitlistRow[];
  },
});
