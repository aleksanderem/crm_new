import { action, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { v } from "convex/values";
import { publishActivityEnvelope } from "../_helpers/activityEnvelope";
import { sendEmail } from "@cvx/email";
import type { EmailRow } from "../_helpers/supabaseRows";

// Dual-write refs removed — Supabase is now primary for email writes
// listInbox, getThread, getById, getUnreadCount removed — frontend reads from Supabase via use-supabase-emails.ts

export const listByEntity = action({
  args: {
    organizationId: v.string(),
    entityType: v.string(),
    entityId: v.string(),
  },
  handler: async (ctx, args): Promise<EmailRow[]> => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);
    let emails: EmailRow[];

    if (args.entityType === "contact") {
      emails = (await db.query("emails")
        .eq("organizationId", orgIdStr)
        .eq("contactId", args.entityId)
        .collect()) as EmailRow[];
    } else if (args.entityType === "company") {
      emails = (await db.query("emails")
        .eq("organizationId", orgIdStr)
        .eq("companyId", args.entityId)
        .collect()) as EmailRow[];
    } else if (args.entityType === "lead") {
      emails = (await db.query("emails")
        .eq("organizationId", orgIdStr)
        .eq("leadId", args.entityId)
        .collect()) as EmailRow[];
    } else {
      throw new Error(`Invalid entity type: ${args.entityType}`);
    }

    return emails.sort((a, b) => (b.sentAt ?? 0) - (a.sentAt ?? 0));
  },
});

export const send = action({
  args: {
    organizationId: v.string(),
    to: v.array(v.string()),
    cc: v.optional(v.array(v.string())),
    bcc: v.optional(v.array(v.string())),
    subject: v.string(),
    bodyHtml: v.optional(v.string()),
    bodyText: v.optional(v.string()),
    contactId: v.optional(v.string()),
    companyId: v.optional(v.string()),
    leadId: v.optional(v.string()),
    mailProviderId: v.optional(v.string()),
    inReplyTo: v.optional(v.string()),
    threadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // --- Auth (via internal query) ---
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const now = Date.now();
    const db = createSupabaseDb();

    // Get default email account for org
    const accounts = await db.query("emailAccounts")
      .eq("organizationId", String(args.organizationId))
      .collect();
    const defaultAccount = accounts.find((a: any) => a.isDefault);
    if (!defaultAccount) {
      throw new Error("No default email account configured");
    }

    const messageId = `<${crypto.randomUUID()}@crm.app>`;
    const threadId = args.threadId ?? messageId;

    // Create snippet
    let snippet: string | undefined;
    if (args.bodyText) {
      snippet = args.bodyText.slice(0, 200);
    } else if (args.bodyHtml) {
      snippet = args.bodyHtml.replace(/<[^>]*>/g, "").slice(0, 200);
    }

    // Send via Resend
    await sendEmail({
      to: args.to[0],
      subject: args.subject,
      html: args.bodyHtml ?? args.bodyText ?? "",
      log: {
        ctx,
        organizationId: args.organizationId,
        source: "manual_compose",
        triggeredBy: authResult.userId,
        relatedEntityType: args.contactId
          ? "contact"
          : args.companyId
            ? "company"
            : args.leadId
              ? "lead"
              : undefined,
        relatedEntityId: args.contactId ?? args.companyId ?? args.leadId,
      },
    });

    // --- INSERT email directly to Supabase ---
    const emailId = await db.insert("emails", {
      organizationId: String(args.organizationId),
      threadId,
      messageId,
      inReplyTo: args.inReplyTo ?? null,
      direction: "outbound",
      from: defaultAccount.fromEmail as string,
      to: args.to,
      cc: args.cc ?? null,
      bcc: args.bcc ?? null,
      subject: args.subject,
      bodyHtml: args.bodyHtml ?? null,
      bodyText: args.bodyText ?? null,
      snippet: snippet ?? null,
      isRead: true,
      isStarred: false,
      contactId: args.contactId ?? null,
      companyId: args.companyId ?? null,
      leadId: args.leadId ?? null,
      mailProviderId: args.mailProviderId ?? null,
      sentBy: String(authResult.userId),
      sentAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // --- Delegate post-write side effects ---
    try {
      await ctx.runMutation(internal.crm.emails._sendSideEffects, {
        emailId,
        organizationId: args.organizationId,
        to: args.to,
        subject: args.subject,
        sentBy: String(authResult.userId),
        sentAt: now,
      });
    } catch (e) {
      console.error("[emails.send] Side effects FAILED for email", emailId, ":", e);
    }

    return emailId;
  },
});

export const _sendSideEffects = internalMutation({
  args: {
    emailId: v.string(),
    organizationId: v.string(),
    to: v.array(v.string()),
    subject: v.string(),
    sentBy: v.string(),
    sentAt: v.number(),
  },
  handler: async (_ctx, args) => {
    await publishActivityEnvelope({
      organizationId: args.organizationId,
      action: "email_sent",
      performedBy: args.sentBy,
      module: "crm",
      summary: `Sent email "${args.subject}" to ${args.to.join(", ")}`,
      occurredAt: args.sentAt,
      actor: {
        type: "user",
        userId: args.sentBy,
      },
      payload: {
        emailId: args.emailId,
        direction: "outbound",
        to: args.to,
        subject: args.subject,
      },
      eventKey: `crm:email:${args.emailId}:email_sent`,
      targets: [
        {
          entityType: "email",
          entityId: args.emailId,
        },
      ],
    });
  },
});

export const markRead = action({
  args: {
    organizationId: v.string(),
    emailId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();

    const email = await db.get("emails", args.emailId);
    if (!email || String(email.organizationId) !== String(args.organizationId)) {
      throw new Error("Email not found");
    }

    await db.patch("emails", args.emailId, {
      isRead: true,
      updatedAt: Date.now(),
    });

    return args.emailId;
  },
});

export const markUnread = action({
  args: {
    organizationId: v.string(),
    emailId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();

    const email = await db.get("emails", args.emailId);
    if (!email || String(email.organizationId) !== String(args.organizationId)) {
      throw new Error("Email not found");
    }

    await db.patch("emails", args.emailId, {
      isRead: false,
      updatedAt: Date.now(),
    });

    return args.emailId;
  },
});

export const toggleStar = action({
  args: {
    organizationId: v.string(),
    emailId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();

    const email = await db.get("emails", args.emailId);
    if (!email || String(email.organizationId) !== String(args.organizationId)) {
      throw new Error("Email not found");
    }

    await db.patch("emails", args.emailId, {
      isStarred: !email.isStarred,
      updatedAt: Date.now(),
    });

    return args.emailId;
  },
});

export const listByPatient = action({
  args: {
    organizationId: v.string(),
    patientId: v.string(),
  },
  handler: async (ctx, args): Promise<EmailRow[]> => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const db = createSupabaseDb();
    return (await db
      .query("emails")
      .eq("organizationId", String(args.organizationId))
      .eq("patientId", args.patientId)
      .order("sentAt", false)
      .take(50)
      .collect()) as EmailRow[];
  },
});

export const listByAppointment = action({
  args: {
    organizationId: v.string(),
    appointmentId: v.string(),
  },
  handler: async (ctx, args): Promise<EmailRow[]> => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const db = createSupabaseDb();
    return (await db
      .query("emails")
      .eq("organizationId", String(args.organizationId))
      .eq("appointmentId", args.appointmentId)
      .order("sentAt", false)
      .take(50)
      .collect()) as EmailRow[];
  },
});

export const listByEmployee = action({
  args: {
    organizationId: v.string(),
    employeeId: v.string(),
  },
  handler: async (ctx, args): Promise<EmailRow[]> => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const db = createSupabaseDb();
    return (await db
      .query("emails")
      .eq("organizationId", String(args.organizationId))
      .eq("employeeId", args.employeeId)
      .order("sentAt", false)
      .take(50)
      .collect()) as EmailRow[];
  },
});

export const linkToEntity = action({
  args: {
    organizationId: v.string(),
    emailId: v.string(),
    contactId: v.optional(v.string()),
    companyId: v.optional(v.string()),
    leadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();

    const email = await db.get("emails", args.emailId);
    if (!email || String(email.organizationId) !== String(args.organizationId)) {
      throw new Error("Email not found");
    }

    await db.patch("emails", args.emailId, {
      contactId: args.contactId ?? null,
      companyId: args.companyId ?? null,
      leadId: args.leadId ?? null,
      updatedAt: Date.now(),
    });

    return args.emailId;
  },
});
