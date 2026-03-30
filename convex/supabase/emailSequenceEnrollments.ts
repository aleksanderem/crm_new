/**
 * Convex → Supabase Email Sequence Enrollments Write Actions
 *
 * Internal actions that persist email sequence enrollment data to PostgreSQL via Supabase
 * service-role client (bypasses RLS). Dual-write pattern: Convex mutations
 * write to Convex first, then schedule these actions to replicate to Supabase.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "./client";

export const writeEmailSequenceEnrollmentToSupabase = internalAction({
  args: {
    emailSequenceEnrollmentId: v.string(),
    sequenceId: v.string(),
    organizationId: v.string(),
    recipientEmail: v.string(),
    recipientName: v.optional(v.string()),
    payload: v.optional(v.string()),
    currentStep: v.number(),
    status: v.string(),
    enrolledAt: v.number(),
    completedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.emailSequenceEnrollmentId,
      sequence_id: args.sequenceId,
      organization_id: args.organizationId,
      recipient_email: args.recipientEmail,
      recipient_name: args.recipientName ?? null,
      payload: args.payload ?? null,
      current_step: args.currentStep,
      status: args.status,
      enrolled_at: args.enrolledAt,
      completed_at: args.completedAt ?? null,
      cancelled_at: args.cancelledAt ?? null,
    };

    const { data, error } = await client
      .from("email_sequence_enrollments")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for email_sequence_enrollment: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase write returned malformed response: missing id");
    }

    console.info(`EmailSequenceEnrollment written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateEmailSequenceEnrollmentInSupabase = internalAction({
  args: {
    emailSequenceEnrollmentId: v.string(),
    organizationId: v.string(),
    currentStep: v.optional(v.number()),
    status: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = {};
    if (args.currentStep !== undefined) row.current_step = args.currentStep;
    if (args.status !== undefined) row.status = args.status;
    if (args.completedAt !== undefined) row.completed_at = args.completedAt;
    if (args.cancelledAt !== undefined) row.cancelled_at = args.cancelledAt;

    const { data, error } = await client
      .from("email_sequence_enrollments")
      .update(row)
      .eq("id", args.emailSequenceEnrollmentId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for email_sequence_enrollment ${args.emailSequenceEnrollmentId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`EmailSequenceEnrollment updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deleteEmailSequenceEnrollmentFromSupabase = internalAction({
  args: {
    emailSequenceEnrollmentId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("email_sequence_enrollments")
      .delete()
      .eq("id", args.emailSequenceEnrollmentId);

    if (error) {
      const msg = `Supabase delete failed for email_sequence_enrollment ${args.emailSequenceEnrollmentId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`EmailSequenceEnrollment deleted from Supabase id=${args.emailSequenceEnrollmentId} org=${args.organizationId}`);
    return { success: true, id: args.emailSequenceEnrollmentId };
  },
});
