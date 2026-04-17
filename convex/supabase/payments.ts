/**
 * Convex → Supabase Payments Dual-Write Action
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "./client";

export const writePaymentToSupabase = internalAction({
  args: {
    paymentId: v.string(),
    organizationId: v.string(),
    patientId: v.optional(v.string()),
    appointmentId: v.optional(v.string()),
    packageUsageId: v.optional(v.string()),
    amount: v.number(),
    currency: v.string(),
    paymentMethod: v.string(),
    status: v.string(),
    paidAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args) => {
    const client = createServiceRoleClient();

    const row = {
      id: args.paymentId,
      organization_id: args.organizationId,
      patient_id: args.patientId ?? null,
      appointment_id: args.appointmentId ?? null,
      package_usage_id: args.packageUsageId ?? null,
      amount: args.amount,
      currency: args.currency,
      payment_method: args.paymentMethod,
      status: args.status,
      paid_at: args.paidAt ?? null,
      notes: args.notes ?? null,
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("payments")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for payment: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Payment written to Supabase id=${data!.id}`);
    return { success: true, id: data!.id };
  },
});
