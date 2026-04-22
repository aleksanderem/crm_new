import { query, action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { verifyOrgAccess } from "./_helpers/auth";

const paymentMethodValidator = v.union(
  v.literal("cash"),
  v.literal("card"),
  v.literal("transfer"),
  v.literal("other"),
);

const paymentStatusValidator = v.union(
  v.literal("pending"),
  v.literal("completed"),
  v.literal("refunded"),
  v.literal("cancelled"),
);

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
    status: v.optional(paymentStatusValidator),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    if (args.status) {
      return await ctx.db
        .query("payments")
        .withIndex("by_orgAndStatus", (q) =>
          q.eq("organizationId", args.organizationId).eq("status", args.status!)
        )
        .order("desc")
        .paginate(args.paginationOpts);
    }

    return await ctx.db
      .query("payments")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .paginate(args.paginationOpts);
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
      .query("payments")
      .withIndex("by_appointment", (q) => q.eq("appointmentId", args.appointmentId))
      .first();
  },
});

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.optional(v.string()),
    appointmentId: v.optional(v.string()),
    packageUsageId: v.optional(v.string()),
    amount: v.number(),
    currency: v.string(),
    paymentMethod: paymentMethodValidator,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();
    const now = Date.now();

    const paymentId = await db.insert("payments", {
      organizationId: String(args.organizationId),
      patientId: args.patientId ?? null,
      appointmentId: args.appointmentId ?? null,
      packageUsageId: args.packageUsageId ?? null,
      amount: args.amount,
      currency: args.currency,
      paymentMethod: args.paymentMethod,
      status: "completed",
      paidAt: now,
      notes: args.notes ?? null,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    // Side effects (audit log) via internal mutation
    try {
      await ctx.runMutation(internal.payments._createPaymentSideEffects, {
        paymentId,
        organizationId: args.organizationId,
        userId: authResult.userId,
        amount: args.amount,
        currency: args.currency,
      });
    } catch {
      // side effects are best-effort
    }

    return paymentId;
  },
});

export const markPaid = action({
  args: {
    organizationId: v.id("organizations"),
    paymentId: v.string(),
    paymentMethod: v.optional(paymentMethodValidator),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();
    const payment = await db.get("payments", args.paymentId);
    if (!payment || payment.organizationId !== String(args.organizationId)) {
      throw new Error("Payment not found");
    }

    if (payment.status !== "pending") {
      throw new Error(`Cannot mark ${payment.status} payment as paid`);
    }

    const now = Date.now();
    const updates: Record<string, unknown> = {
      status: "completed",
      paidAt: now,
      updatedAt: now,
    };
    if (args.paymentMethod) updates.paymentMethod = args.paymentMethod;

    await db.patch("payments", args.paymentId, updates);

    // Side effects via internal mutation
    try {
      await ctx.runMutation(internal.payments._markPaidSideEffects, {
        paymentId: args.paymentId,
        organizationId: args.organizationId,
        userId: authResult.userId,
        amount: payment.amount as number,
        currency: payment.currency as string,
        appointmentId: (payment.appointmentId as string) ?? null,
      });
    } catch {
      // side effects are best-effort
    }

    return args.paymentId;
  },
});

export const refund = action({
  args: {
    organizationId: v.id("organizations"),
    paymentId: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();
    const payment = await db.get("payments", args.paymentId);
    if (!payment || payment.organizationId !== String(args.organizationId)) {
      throw new Error("Payment not found");
    }

    if (payment.status !== "completed") {
      throw new Error(`Cannot refund a ${payment.status} payment`);
    }

    await db.patch("payments", args.paymentId, {
      status: "refunded",
      notes: args.reason
        ? `${payment.notes ? (payment.notes as string) + "\n" : ""}Refund: ${args.reason}`
        : (payment.notes as string) ?? null,
      updatedAt: Date.now(),
    });

    // Side effects via internal mutation
    try {
      await ctx.runMutation(internal.payments._refundSideEffects, {
        paymentId: args.paymentId,
        organizationId: args.organizationId,
        userId: authResult.userId,
        amount: payment.amount as number,
        reason: args.reason,
      });
    } catch {
      // side effects are best-effort
    }

    return args.paymentId;
  },
});

// --- Internal side-effect mutations ---

export const _createPaymentSideEffects = internalMutation({
  args: {
    paymentId: v.string(),
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    amount: v.number(),
    currency: v.string(),
  },
  handler: async (ctx, args) => {
    const { logAudit } = await import("./auditLog");
    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: args.userId,
      action: "payment_created",
      entityType: "payment",
      entityId: args.paymentId as any,
      details: JSON.stringify({ amount: args.amount, currency: args.currency }),
    });
  },
});

export const _markPaidSideEffects = internalMutation({
  args: {
    paymentId: v.string(),
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    amount: v.number(),
    currency: v.string(),
    appointmentId: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const { logActivity } = await import("./_helpers/activities");
    const { logAudit } = await import("./auditLog");

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetAppointment",
      entityId: (args.appointmentId ?? args.paymentId) as any,
      action: "updated",
      description: `Payment of ${args.amount} ${args.currency} marked as paid`,
      performedBy: args.userId,
    });

    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: args.userId,
      action: "payment_completed",
      entityType: "payment",
      entityId: args.paymentId as any,
      details: JSON.stringify({ amount: args.amount }),
    });
  },
});

export const _refundSideEffects = internalMutation({
  args: {
    paymentId: v.string(),
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    amount: v.number(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { logAudit } = await import("./auditLog");
    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: args.userId,
      action: "payment_refunded",
      entityType: "payment",
      entityId: args.paymentId as any,
      details: JSON.stringify({ amount: args.amount, reason: args.reason }),
    });
  },
});

/** Revenue summary for a time range */
export const getRevenueSummary = query({
  args: {
    organizationId: v.id("organizations"),
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_orgAndStatus", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "completed")
      )
      .collect();

    const filtered = payments.filter(
      (p) => p.paidAt && p.paidAt >= args.startDate && p.paidAt <= args.endDate
    );

    const total = filtered.reduce((sum, p) => sum + p.amount, 0);
    const count = filtered.length;

    // Group by payment method
    const byMethod: Record<string, { count: number; total: number }> = {};
    for (const p of filtered) {
      if (!byMethod[p.paymentMethod]) {
        byMethod[p.paymentMethod] = { count: 0, total: 0 };
      }
      byMethod[p.paymentMethod].count++;
      byMethod[p.paymentMethod].total += p.amount;
    }

    return { total, count, byMethod };
  },
});
