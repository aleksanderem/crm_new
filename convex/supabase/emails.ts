/**
 * Convex → Supabase Email Write Actions
 *
 * Internal actions that persist email data to PostgreSQL via Supabase
 * service-role client (bypasses RLS). Dual-write pattern: Convex mutations
 * write to Convex first, then schedule these actions to replicate to Supabase.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "./client";

export const writeEmailToSupabase = internalAction({
  args: {
    emailId: v.string(),
    organizationId: v.string(),
    threadId: v.string(),
    messageId: v.string(),
    inReplyTo: v.optional(v.string()),
    direction: v.string(),
    from: v.string(),
    to: v.array(v.string()),
    cc: v.optional(v.array(v.string())),
    bcc: v.optional(v.array(v.string())),
    subject: v.string(),
    bodyHtml: v.optional(v.string()),
    bodyText: v.optional(v.string()),
    snippet: v.optional(v.string()),
    isRead: v.boolean(),
    isStarred: v.optional(v.boolean()),
    contactId: v.optional(v.string()),
    companyId: v.optional(v.string()),
    leadId: v.optional(v.string()),
    provider: v.optional(v.string()),
    mailProviderId: v.optional(v.string()),
    gmailMessageId: v.optional(v.string()),
    gmailThreadId: v.optional(v.string()),
    sentBy: v.optional(v.string()),
    templateId: v.optional(v.string()),
    patientId: v.optional(v.string()),
    appointmentId: v.optional(v.string()),
    employeeId: v.optional(v.string()),
    sentAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.emailId,
      organization_id: args.organizationId,
      thread_id: args.threadId,
      message_id: args.messageId,
      in_reply_to: args.inReplyTo ?? null,
      direction: args.direction,
      from: args.from,
      to: args.to,
      cc: args.cc ?? null,
      bcc: args.bcc ?? null,
      subject: args.subject,
      body_html: args.bodyHtml ?? null,
      body_text: args.bodyText ?? null,
      snippet: args.snippet ?? null,
      is_read: args.isRead,
      is_starred: args.isStarred ?? null,
      contact_id: args.contactId ?? null,
      company_id: args.companyId ?? null,
      lead_id: args.leadId ?? null,
      provider: args.provider ?? null,
      mail_provider_id: args.mailProviderId ?? null,
      gmail_message_id: args.gmailMessageId ?? null,
      gmail_thread_id: args.gmailThreadId ?? null,
      sent_by: args.sentBy ?? null,
      template_id: args.templateId ?? null,
      patient_id: args.patientId ?? null,
      appointment_id: args.appointmentId ?? null,
      employee_id: args.employeeId ?? null,
      sent_at: args.sentAt,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("emails")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for email: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase write returned malformed response: missing id");
    }

    console.info(`Email written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateEmailInSupabase = internalAction({
  args: {
    emailId: v.string(),
    organizationId: v.string(),
    isRead: v.optional(v.boolean()),
    isStarred: v.optional(v.boolean()),
    contactId: v.optional(v.string()),
    companyId: v.optional(v.string()),
    leadId: v.optional(v.string()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.isRead !== undefined) row.is_read = args.isRead;
    if (args.isStarred !== undefined) row.is_starred = args.isStarred;
    if (args.contactId !== undefined) row.contact_id = args.contactId;
    if (args.companyId !== undefined) row.company_id = args.companyId;
    if (args.leadId !== undefined) row.lead_id = args.leadId;

    const { data, error } = await client
      .from("emails")
      .update(row)
      .eq("id", args.emailId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for email ${args.emailId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Email updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deleteEmailFromSupabase = internalAction({
  args: {
    emailId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("emails")
      .delete()
      .eq("id", args.emailId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for email ${args.emailId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Email deleted from Supabase id=${args.emailId} org=${args.organizationId}`);
    return { success: true, id: args.emailId };
  },
});
