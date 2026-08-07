import { action, internalAction } from "../_generated/server";
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

/**
 * Fired internally when a slot opens (appointment cancelled or new slot created).
 * Notifies all "waiting" entries whose treatment preference matches (or is unset),
 * and whose preferred dates include the freed date (or are unset).
 * Marks each notified entry as "notified" and sends the appointment_waitlist email.
 */
export const notifyWaitlistOnSlotOpen = internalAction({
  args: {
    organizationId: v.id("organizations"),
    treatmentId: v.optional(v.string()),
    employeeUserId: v.optional(v.string()),
    date: v.string(),
    startTime: v.string(),
  },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);

    const allWaiting = await db
      .query("gabinetWaitlist")
      .eq("organizationId", orgIdStr)
      .eq("status", "waiting")
      .order("priority", true)
      .order("createdAt", true)
      .collect();

    const matching = (allWaiting as GabinetWaitlistRow[]).filter((entry) => {
      if (entry.treatmentId && entry.treatmentId !== args.treatmentId) return false;
      const preferred = entry.preferredDates as string[] | null;
      if (preferred && preferred.length > 0 && !preferred.includes(args.date)) return false;
      return true;
    });

    if (matching.length === 0) return;

    const treatment = args.treatmentId
      ? await db.get("gabinetTreatments", args.treatmentId)
      : null;
    const treatmentName = (treatment as { name?: string } | null)?.name ?? "Treatment";

    const employee = args.employeeUserId
      ? await db.get<{ name?: string }>("users", args.employeeUserId)
      : null;
    const employeeName = employee?.name ?? "Specjalista";

    const now = Date.now();
    for (const entry of matching) {
      try {
        const patient = await db.get("gabinetPatients", String(entry.patientId));
        if (!patient?.email) continue;

        const patientName = `${patient.firstName}${patient.lastName ? " " + patient.lastName : ""}`;

        await ctx.runAction(internal.emailEventTrigger.triggerEmailEvent, {
          organizationId: args.organizationId,
          eventType: "appointment_waitlist",
          recipientEmail: String(patient.email),
          recipientName: patientName,
          payload: JSON.stringify({
            patientName,
            appointmentDate: args.date,
            appointmentTime: args.startTime,
            treatmentName,
            employeeName,
          }),
          relatedEntityType: "gabinetWaitlist",
          relatedEntityId: String(entry._id),
          idempotencyKey: `waitlist-notify:${String(entry._id)}:${args.date}:${args.startTime}`,
        });

        await db.patch("gabinetWaitlist", String(entry._id), {
          status: "notified",
          notifiedAt: now,
          updatedAt: now,
        });
      } catch (err) {
        await logError(ctx, err, {
          scope: "gabinet.waitlist",
          fnName: "notifyWaitlistOnSlotOpen",
          argsJson: JSON.stringify({ waitlistId: entry._id }),
          organizationId: args.organizationId,
        });
      }
    }
  },
});
