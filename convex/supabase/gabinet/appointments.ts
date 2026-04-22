/**
 * Convex → Supabase Appointment Write Actions
 *
 * Internal actions that persist gabinet appointment data to PostgreSQL via Supabase
 * service-role client (bypasses RLS). Dual-write pattern: Convex mutations
 * write to Convex first, then schedule these actions to replicate to Supabase.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { internal } from "@cvx/_generated/api";
import { createServiceRoleClient, upsertWithFkRetry } from "../client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GenericActionCtx } from "convex/server";
import type { DataModel } from "@cvx/_generated/dataModel";

type ActionCtx = GenericActionCtx<DataModel>;

async function ensureRowExists(
  client: SupabaseClient,
  table: string,
  id: string,
): Promise<boolean> {
  const { data } = await client
    .from(table)
    .select("id")
    .eq("id", id)
    .maybeSingle();
  return !!data;
}

async function ensureFkDeps(
  ctx: ActionCtx,
  client: SupabaseClient,
  args: {
    patientId: string;
    employeeId: string;
    treatmentId?: string;
    createdBy: string;
    organizationId: string;
    cancelledBy?: string;
    bookedByPatientId?: string;
  },
) {
  const userIds = new Set([args.employeeId, args.createdBy]);
  if (args.cancelledBy) userIds.add(args.cancelledBy);

  try {
    for (const userId of userIds) {
      if (!(await ensureRowExists(client, "users", userId))) {
        const user = await ctx.runQuery(internal.supabase.backfill._getUser, {
          userId,
        });
        if (user) {
          await client.from("users").upsert(
            {
              id: user._id,
              name: user.name ?? null,
              username: (user as any).username ?? null,
              image_storage_id: (user as any).imageStorageId ?? null,
              image: user.image ?? null,
              email: user.email ?? null,
              email_verification_time: (user as any).emailVerificationTime ?? null,
              phone: user.phone ?? null,
              phone_verification_time: (user as any).phoneVerificationTime ?? null,
              is_anonymous: (user as any).isAnonymous ?? false,
              customer_id: (user as any).customerId ?? null,
              language: (user as any).language ?? null,
              theme: (user as any).theme ?? null,
              timezone: (user as any).timezone ?? null,
              created_at: Math.floor(user._creationTime),
              updated_at: Math.floor(user._creationTime),
            },
            { onConflict: "id" },
          );
        }
      }
    }

    const patientIds = [args.patientId];
    if (args.bookedByPatientId) patientIds.push(args.bookedByPatientId);

    for (const patientId of patientIds) {
      if (!(await ensureRowExists(client, "gabinet_patients", patientId))) {
        await ctx.runAction(internal.supabase.backfill.backfillSinglePatient, {
          patientId,
        });
      }
    }

    if (args.treatmentId) {
      if (
        !(await ensureRowExists(client, "gabinet_treatments", args.treatmentId))
      ) {
        await ctx.runAction(internal.supabase.backfill.backfillSingleTreatment, {
          treatmentId: args.treatmentId,
        });
      }
    }
  } catch (e) {
    console.warn("ensureFkDeps failed (non-fatal, proceeding with write):", e);
  }
}

export const writeAppointmentToSupabase = internalAction({
  args: {
    appointmentId: v.string(),
    organizationId: v.string(),
    patientId: v.string(),
    treatmentId: v.optional(v.string()),
    employeeId: v.string(),
    date: v.string(),
    startTime: v.string(),
    endTime: v.string(),
    status: v.string(),
    notes: v.optional(v.string()),
    internalNotes: v.optional(v.string()),
    bodyChartData: v.optional(v.string()),
    treatmentParameterValues: v.optional(v.string()),
    interviewNotes: v.optional(v.string()),
    clinicalRemarks: v.optional(v.string()),
    photos: v.optional(v.any()),
    color: v.optional(v.string()),
    isRecurring: v.boolean(),
    recurringRule: v.optional(v.any()),
    recurringGroupId: v.optional(v.string()),
    recurringIndex: v.optional(v.number()),
    prepaymentRequired: v.optional(v.boolean()),
    prepaymentAmount: v.optional(v.number()),
    prepaymentStatus: v.optional(v.string()),
    prepaymentPaidAt: v.optional(v.number()),
    packageUsageId: v.optional(v.string()),
    scheduledActivityId: v.optional(v.string()),
    reminderSentAt: v.optional(v.number()),
    sendReminder: v.optional(v.boolean()),
    cancelledAt: v.optional(v.number()),
    cancelledBy: v.optional(v.string()),
    cancellationReason: v.optional(v.string()),
    bookedFromPortal: v.optional(v.boolean()),
    bookedByPatientId: v.optional(v.string()),
    locationId: v.optional(v.string()),
    roomId: v.optional(v.string()),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
    requiresCompletion: v.optional(v.boolean()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    // Self-healing: ensure FK dependencies exist in Supabase before insert
    await ensureFkDeps(ctx, client, args);

    const row = {
      id: args.appointmentId,
      organization_id: args.organizationId,
      patient_id: args.patientId,
      treatment_id: args.treatmentId ?? null,
      employee_id: args.employeeId,
      date: args.date,
      start_time: args.startTime,
      end_time: args.endTime,
      status: args.status,
      notes: args.notes ?? null,
      internal_notes: args.internalNotes ?? null,
      body_chart_data: args.bodyChartData ?? null,
      treatment_parameter_values: args.treatmentParameterValues ?? null,
      interview_notes: args.interviewNotes ?? null,
      clinical_remarks: args.clinicalRemarks ?? null,
      photos: args.photos ?? null,
      color: args.color ?? null,
      is_recurring: args.isRecurring,
      recurring_rule: args.recurringRule ?? null,
      recurring_group_id: args.recurringGroupId ?? null,
      recurring_index: args.recurringIndex ?? null,
      prepayment_required: args.prepaymentRequired ?? null,
      prepayment_amount: args.prepaymentAmount ?? null,
      prepayment_status: args.prepaymentStatus ?? null,
      prepayment_paid_at: args.prepaymentPaidAt ?? null,
      package_usage_id: args.packageUsageId ?? null,
      scheduled_activity_id: null,
      reminder_sent_at: args.reminderSentAt ?? null,
      send_reminder: args.sendReminder ?? null,
      cancelled_at: args.cancelledAt ?? null,
      cancelled_by: args.cancelledBy ?? null,
      cancellation_reason: args.cancellationReason ?? null,
      booked_from_portal: args.bookedFromPortal ?? null,
      booked_by_patient_id: args.bookedByPatientId ?? null,
      location_id: args.locationId ?? null,
      room_id: args.roomId ?? null,
      tag_ids: args.tagIds ?? null,
      category_id: args.categoryId ?? null,
      requires_completion: args.requiresCompletion ?? null,
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const data = await upsertWithFkRetry(client, "gabinet_appointments", row);

    console.info(`Appointment written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateAppointmentInSupabase = internalAction({
  args: {
    appointmentId: v.string(),
    organizationId: v.string(),
    patientId: v.optional(v.string()),
    treatmentId: v.optional(v.string()),
    employeeId: v.optional(v.string()),
    date: v.optional(v.string()),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
    status: v.optional(v.string()),
    notes: v.optional(v.string()),
    internalNotes: v.optional(v.string()),
    bodyChartData: v.optional(v.string()),
    treatmentParameterValues: v.optional(v.string()),
    interviewNotes: v.optional(v.string()),
    clinicalRemarks: v.optional(v.string()),
    photos: v.optional(v.any()),
    color: v.optional(v.string()),
    isRecurring: v.optional(v.boolean()),
    recurringRule: v.optional(v.any()),
    recurringGroupId: v.optional(v.string()),
    recurringIndex: v.optional(v.number()),
    prepaymentRequired: v.optional(v.boolean()),
    prepaymentAmount: v.optional(v.number()),
    prepaymentStatus: v.optional(v.string()),
    prepaymentPaidAt: v.optional(v.number()),
    packageUsageId: v.optional(v.string()),
    scheduledActivityId: v.optional(v.string()),
    reminderSentAt: v.optional(v.number()),
    sendReminder: v.optional(v.boolean()),
    cancelledAt: v.optional(v.number()),
    cancelledBy: v.optional(v.string()),
    cancellationReason: v.optional(v.string()),
    bookedFromPortal: v.optional(v.boolean()),
    bookedByPatientId: v.optional(v.string()),
    locationId: v.optional(v.string()),
    roomId: v.optional(v.string()),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
    requiresCompletion: v.optional(v.boolean()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.patientId !== undefined) row.patient_id = args.patientId;
    if (args.treatmentId !== undefined) row.treatment_id = args.treatmentId;
    if (args.employeeId !== undefined) row.employee_id = args.employeeId;
    if (args.date !== undefined) row.date = args.date;
    if (args.startTime !== undefined) row.start_time = args.startTime;
    if (args.endTime !== undefined) row.end_time = args.endTime;
    if (args.status !== undefined) row.status = args.status;
    if (args.notes !== undefined) row.notes = args.notes;
    if (args.internalNotes !== undefined) row.internal_notes = args.internalNotes;
    if (args.bodyChartData !== undefined) row.body_chart_data = args.bodyChartData;
    if (args.treatmentParameterValues !== undefined) row.treatment_parameter_values = args.treatmentParameterValues;
    if (args.interviewNotes !== undefined) row.interview_notes = args.interviewNotes;
    if (args.clinicalRemarks !== undefined) row.clinical_remarks = args.clinicalRemarks;
    if (args.photos !== undefined) row.photos = args.photos;
    if (args.color !== undefined) row.color = args.color;
    if (args.isRecurring !== undefined) row.is_recurring = args.isRecurring;
    if (args.recurringRule !== undefined) row.recurring_rule = args.recurringRule;
    if (args.recurringGroupId !== undefined) row.recurring_group_id = args.recurringGroupId;
    if (args.recurringIndex !== undefined) row.recurring_index = args.recurringIndex;
    if (args.prepaymentRequired !== undefined) row.prepayment_required = args.prepaymentRequired;
    if (args.prepaymentAmount !== undefined) row.prepayment_amount = args.prepaymentAmount;
    if (args.prepaymentStatus !== undefined) row.prepayment_status = args.prepaymentStatus;
    if (args.prepaymentPaidAt !== undefined) row.prepayment_paid_at = args.prepaymentPaidAt;
    if (args.packageUsageId !== undefined) row.package_usage_id = args.packageUsageId;
    if (args.scheduledActivityId !== undefined) row.scheduled_activity_id = args.scheduledActivityId;
    if (args.reminderSentAt !== undefined) row.reminder_sent_at = args.reminderSentAt;
    if (args.sendReminder !== undefined) row.send_reminder = args.sendReminder;
    if (args.cancelledAt !== undefined) row.cancelled_at = args.cancelledAt;
    if (args.cancelledBy !== undefined) row.cancelled_by = args.cancelledBy;
    if (args.cancellationReason !== undefined) row.cancellation_reason = args.cancellationReason;
    if (args.bookedFromPortal !== undefined) row.booked_from_portal = args.bookedFromPortal;
    if (args.bookedByPatientId !== undefined) row.booked_by_patient_id = args.bookedByPatientId;
    if (args.locationId !== undefined) row.location_id = args.locationId;
    if (args.roomId !== undefined) row.room_id = args.roomId;
    if (args.tagIds !== undefined) row.tag_ids = args.tagIds;
    if (args.categoryId !== undefined) row.category_id = args.categoryId;
    if (args.requiresCompletion !== undefined) row.requires_completion = args.requiresCompletion;

    const { data, error } = await client
      .from("gabinet_appointments")
      .update(row)
      .eq("id", args.appointmentId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for appointment ${args.appointmentId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Appointment updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deleteAppointmentFromSupabase = internalAction({
  args: {
    appointmentId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    // Soft-delete: set status to cancelled (appointments are never hard-deleted)
    const { error } = await client
      .from("gabinet_appointments")
      .update({ status: "cancelled", cancelled_at: Date.now(), updated_at: Date.now() })
      .eq("id", args.appointmentId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for appointment ${args.appointmentId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Appointment soft-deleted in Supabase id=${args.appointmentId} org=${args.organizationId}`);
    return { success: true, id: args.appointmentId };
  },
});
