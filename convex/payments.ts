import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { logAudit } from "./auditLog";
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

export const list = action({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
    status: v.optional(paymentStatusValidator),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const { numItems, cursor } = args.paginationOpts;
    const offset = cursor ? Number(cursor) : 0;
    if (!Number.isFinite(offset) || offset < 0) {
      throw new Error("Invalid pagination cursor");
    }

    const db = createSupabaseDb();
    let q = db
      .query("payments")
      .eq("organizationId", String(args.organizationId));
    if (args.status) q = q.eq("status", args.status);

    // Fetch numItems + 1 to detect whether more rows remain.
    const rows = await q
      .order("createdAt", false)
      .range(offset, offset + numItems)
      .collect();

    const hasMore = rows.length > numItems;
    const page = hasMore ? rows.slice(0, numItems) : rows;

    return {
      page,
      isDone: !hasMore,
      continueCursor: hasMore ? String(offset + numItems) : "",
    };
  },
});

export const getByAppointment = action({
  args: {
    organizationId: v.id("organizations"),
    appointmentId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    return await db
      .query("payments")
      .eq("organizationId", String(args.organizationId))
      .eq("appointmentId", args.appointmentId)
      .first();
  },
});

export const listByPackageUsage = action({
  args: {
    organizationId: v.id("organizations"),
    packageUsageId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const rows = await db
      .query("payments")
      .eq("organizationId", String(args.organizationId))
      .eq("packageUsageId", args.packageUsageId)
      .order("createdAt", true)
      .collect();
    return rows;
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
    status: v.optional(paymentStatusValidator),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();
    const now = Date.now();
    const status = args.status ?? "completed";

    const paymentId = await db.insert("payments", {
      organizationId: String(args.organizationId),
      patientId: args.patientId ?? null,
      appointmentId: args.appointmentId ?? null,
      packageUsageId: args.packageUsageId ?? null,
      amount: args.amount,
      currency: args.currency,
      paymentMethod: args.paymentMethod,
      status,
      paidAt: status === "completed" ? now : null,
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

export const splitMarkPaid = action({
  args: {
    organizationId: v.id("organizations"),
    paymentId: v.string(),
    firstMethod: paymentMethodValidator,
    firstAmount: v.number(),
    secondMethod: paymentMethodValidator,
    secondAmount: v.number(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    if (args.firstMethod === args.secondMethod) {
      throw new Error("Split methods must differ");
    }
    if (args.firstAmount <= 0 || args.secondAmount <= 0) {
      throw new Error("Split amounts must be positive");
    }

    const db = createSupabaseDb();
    const payment = await db.get("payments", args.paymentId);
    if (!payment || payment.organizationId !== String(args.organizationId)) {
      throw new Error("Payment not found");
    }
    if (payment.status !== "pending") {
      throw new Error(`Cannot mark ${payment.status} payment as paid`);
    }

    const expected = Math.round((payment.amount as number) * 100) / 100;
    const sum = Math.round((args.firstAmount + args.secondAmount) * 100) / 100;
    if (sum !== expected) {
      throw new Error(`Split amounts must sum to ${expected}`);
    }

    const now = Date.now();
    const baseNotes = (payment.notes as string | null) ?? "";
    const appendSplit = (method: string) => {
      if (!baseNotes) return `split: ${method}`;
      return baseNotes.endsWith(")")
        ? `${baseNotes.slice(0, -1)} split: ${method})`
        : `${baseNotes} split: ${method}`;
    };

    await db.patch("payments", args.paymentId, {
      status: "completed",
      paidAt: now,
      amount: args.firstAmount,
      paymentMethod: args.firstMethod,
      notes: appendSplit(args.firstMethod),
      updatedAt: now,
    });

    const newPaymentId = await db.insert("payments", {
      organizationId: String(args.organizationId),
      patientId: (payment.patientId as string | null) ?? null,
      appointmentId: (payment.appointmentId as string | null) ?? null,
      packageUsageId: (payment.packageUsageId as string | null) ?? null,
      amount: args.secondAmount,
      currency: payment.currency as string,
      paymentMethod: args.secondMethod,
      status: "completed",
      paidAt: now,
      notes: appendSplit(args.secondMethod),
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    try {
      await ctx.runMutation(internal.payments._markPaidSideEffects, {
        paymentId: args.paymentId,
        organizationId: args.organizationId,
        userId: authResult.userId,
        amount: args.firstAmount,
        currency: payment.currency as string,
        appointmentId: (payment.appointmentId as string) ?? null,
      });
      await ctx.runMutation(internal.payments._createPaymentSideEffects, {
        paymentId: newPaymentId,
        organizationId: args.organizationId,
        userId: authResult.userId,
        amount: args.secondAmount,
        currency: payment.currency as string,
      });
    } catch {
      // side effects are best-effort
    }

    return { firstPaymentId: args.paymentId, secondPaymentId: newPaymentId };
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
export const getRevenueSummary = action({
  args: {
    organizationId: v.id("organizations"),
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const payments = await db
      .query<{
        amount: number;
        paymentMethod: string;
        paidAt: number | null;
      }>("payments")
      .eq("organizationId", String(args.organizationId))
      .eq("status", "completed")
      .gte("paidAt", args.startDate)
      .lte("paidAt", args.endDate)
      .collect();

    const total = payments.reduce((sum, p) => sum + p.amount, 0);
    const count = payments.length;

    const byMethod: Record<string, { count: number; total: number }> = {};
    for (const p of payments) {
      if (!byMethod[p.paymentMethod]) {
        byMethod[p.paymentMethod] = { count: 0, total: 0 };
      }
      byMethod[p.paymentMethod].count++;
      byMethod[p.paymentMethod].total += p.amount;
    }

    return { total, count, byMethod };
  },
});
