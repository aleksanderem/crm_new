import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { verifyOrgAccess } from "./_helpers/auth";
import { logActivity } from "./_helpers/activities";

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

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.optional(v.id("gabinetPatients")),
    appointmentId: v.optional(v.id("gabinetAppointments")),
    packageUsageId: v.optional(v.id("gabinetPackageUsage")),
    amount: v.number(),
    currency: v.string(),
    paymentMethod: paymentMethodValidator,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();

    const paymentId = await ctx.db.insert("payments", {
      organizationId: args.organizationId,
      patientId: args.patientId,
      appointmentId: args.appointmentId,
      packageUsageId: args.packageUsageId,
      amount: args.amount,
      currency: args.currency,
      paymentMethod: args.paymentMethod,
      status: "pending",
      notes: args.notes,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    return paymentId;
  },
});

export const markPaid = mutation({
  args: {
    organizationId: v.id("organizations"),
    paymentId: v.id("payments"),
    paymentMethod: v.optional(paymentMethodValidator),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);

    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.organizationId !== args.organizationId) {
      throw new Error("Payment not found");
    }

    if (payment.status !== "pending") {
      throw new Error(`Cannot mark ${payment.status} payment as paid`);
    }

    const now = Date.now();
    await ctx.db.patch(args.paymentId, {
      status: "completed",
      paidAt: now,
      ...(args.paymentMethod ? { paymentMethod: args.paymentMethod } : {}),
      updatedAt: now,
    });

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetAppointment",
      entityId: payment.appointmentId ?? args.paymentId,
      action: "updated",
      description: `Payment of ${payment.amount} ${payment.currency} marked as paid`,
      performedBy: user._id,
    });

    return args.paymentId;
  },
});

export const refund = mutation({
  args: {
    organizationId: v.id("organizations"),
    paymentId: v.id("payments"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);

    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.organizationId !== args.organizationId) {
      throw new Error("Payment not found");
    }

    if (payment.status !== "completed") {
      throw new Error(`Cannot refund a ${payment.status} payment`);
    }

    await ctx.db.patch(args.paymentId, {
      status: "refunded",
      notes: args.reason
        ? `${payment.notes ? payment.notes + "\n" : ""}Refund: ${args.reason}`
        : payment.notes,
      updatedAt: Date.now(),
    });

    return args.paymentId;
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
