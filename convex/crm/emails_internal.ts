import { internalMutation, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { publishActivityEnvelope } from "../_helpers/activityEnvelope";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import type { SupabaseRow } from "../_helpers/supabaseRows";

type EmailAccountRow = SupabaseRow<"emailAccounts">;

// Source of truth: Supabase `email_accounts`. The Convex `emailAccounts`
// table is no longer being written to (see convex/emailAccounts.ts header),
// so reading via `ctx.db` returns empty in production and every inbound
// Resend webhook gets dropped with "No matching account". Read from
// Supabase via an action instead.
export const findEmailAccountByAddress = internalAction({
  args: { addresses: v.array(v.string()) },
  handler: async (_ctx, args): Promise<EmailAccountRow | null> => {
    const db = createSupabaseDb();
    // No `fromEmail` index in Supabase either, so scan all accounts once
    // and match in memory. Pulled out of the address loop since each
    // iteration would otherwise re-fetch the same set.
    const allAccounts = (await db
      .query("emailAccounts")
      .collect()) as EmailAccountRow[];
    for (const address of args.addresses) {
      const normalizedAddress = address.toLowerCase().trim();
      const match = allAccounts.find(
        (a) => a.fromEmail.toLowerCase() === normalizedAddress,
      );
      if (match) return match;
    }
    return null;
  },
});

export const findByMessageId = internalAction({
  args: { messageId: v.string() },
  handler: async (_ctx, args) => {
    const db = createSupabaseDb();
    return await db
      .query("emails")
      .eq("messageId", args.messageId)
      .first();
  },
});

export const findContactByEmail = internalAction({
  args: {
    organizationId: v.id("organizations"),
    email: v.string(),
  },
  handler: async (_ctx, args) => {
    const db = createSupabaseDb();
    return await db
      .query("contacts")
      .eq("organizationId", String(args.organizationId))
      .eq("email", args.email)
      .first();
  },
});

export const insertOutboundGmail = internalAction({
  args: {
    organizationId: v.id("organizations"),
    to: v.array(v.string()),
    cc: v.optional(v.array(v.string())),
    bcc: v.optional(v.array(v.string())),
    subject: v.string(),
    bodyHtml: v.optional(v.string()),
    bodyText: v.optional(v.string()),
    fromEmail: v.string(),
    gmailMessageId: v.string(),
    gmailThreadId: v.optional(v.string()),
    inReplyTo: v.optional(v.string()),
    threadId: v.optional(v.string()),
    contactId: v.optional(v.string()),
    companyId: v.optional(v.string()),
    leadId: v.optional(v.string()),
    sentBy: v.id("users"),
  },
  handler: async (_ctx, args) => {
    const db = createSupabaseDb();
    const now = Date.now();
    const messageId = `<${args.gmailMessageId}@gmail>`;
    const threadId = args.threadId ?? messageId;

    let snippet: string | undefined;
    if (args.bodyText) {
      snippet = args.bodyText.slice(0, 200);
    } else if (args.bodyHtml) {
      snippet = args.bodyHtml.replace(/<[^>]*>/g, "").slice(0, 200);
    }

    await db.insert("emails", {
      organizationId: String(args.organizationId),
      threadId,
      messageId,
      inReplyTo: args.inReplyTo ?? null,
      direction: "outbound",
      from: args.fromEmail,
      to: args.to,
      cc: args.cc ?? null,
      bcc: args.bcc ?? null,
      subject: args.subject,
      bodyHtml: args.bodyHtml ?? null,
      bodyText: args.bodyText ?? null,
      snippet: snippet ?? null,
      isRead: true,
      isStarred: false,
      provider: "google",
      gmailMessageId: args.gmailMessageId,
      gmailThreadId: args.gmailThreadId ?? null,
      contactId: args.contactId ?? null,
      companyId: args.companyId ?? null,
      leadId: args.leadId ?? null,
      sentBy: String(args.sentBy),
      sentAt: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const insertInboundGmail = internalAction({
  args: {
    organizationId: v.id("organizations"),
    gmailMessageId: v.string(),
    gmailThreadId: v.string(),
    from: v.string(),
    to: v.array(v.string()),
    subject: v.string(),
    snippet: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();

    // Check for duplicates by gmailMessageId
    const existing = await db
      .query("emails")
      .eq("gmailMessageId", args.gmailMessageId)
      .first();
    if (existing) return; // Already synced

    const now = Date.now();
    const messageId = `<${args.gmailMessageId}@gmail>`;

    const organization = await db.get("organizations", String(args.organizationId));

    // Auto-link to contact by from email
    const contact = await db
      .query("contacts")
      .eq("organizationId", String(args.organizationId))
      .eq("email", args.from)
      .first();

    const emailId = await db.insert("emails", {
      organizationId: String(args.organizationId),
      threadId: args.gmailThreadId,
      messageId,
      direction: "inbound",
      from: args.from,
      to: args.to,
      subject: args.subject,
      snippet: args.snippet ?? null,
      isRead: false,
      isStarred: false,
      provider: "google",
      gmailMessageId: args.gmailMessageId,
      gmailThreadId: args.gmailThreadId,
      contactId: contact?._id ? String(contact._id) : null,
      sentAt: now,
      createdAt: now,
      updatedAt: now,
    });

    if (organization) {
      await ctx.runMutation(internal.crm.emails_internal._publishInboundActivity, {
        emailId,
        organizationId: args.organizationId,
        performedBy: String(organization.ownerId),
        subject: args.subject,
        from: args.from,
        to: args.to,
        now,
      });
    }
  },
});

export const insertInbound = internalAction({
  args: {
    organizationId: v.id("organizations"),
    threadId: v.string(),
    messageId: v.string(),
    inReplyTo: v.optional(v.string()),
    from: v.string(),
    to: v.array(v.string()),
    subject: v.string(),
    bodyHtml: v.optional(v.string()),
    bodyText: v.optional(v.string()),
    snippet: v.optional(v.string()),
    contactId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();
    const now = Date.now();

    const organization = await db.get("organizations", String(args.organizationId));

    const emailId = await db.insert("emails", {
      organizationId: String(args.organizationId),
      threadId: args.threadId,
      messageId: args.messageId,
      inReplyTo: args.inReplyTo ?? null,
      direction: "inbound",
      from: args.from,
      to: args.to,
      subject: args.subject,
      bodyHtml: args.bodyHtml ?? null,
      bodyText: args.bodyText ?? null,
      snippet: args.snippet ?? null,
      isRead: false,
      isStarred: false,
      contactId: args.contactId ?? null,
      sentAt: now,
      createdAt: now,
      updatedAt: now,
    });

    if (organization) {
      await ctx.runMutation(internal.crm.emails_internal._publishInboundActivity, {
        emailId,
        organizationId: args.organizationId,
        performedBy: String(organization.ownerId),
        subject: args.subject,
        from: args.from,
        to: args.to,
        now,
      });
    }
  },
});

export const _publishInboundActivity = internalMutation({
  args: {
    emailId: v.string(),
    organizationId: v.id("organizations"),
    performedBy: v.string(),
    subject: v.string(),
    from: v.string(),
    to: v.array(v.string()),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    await publishActivityEnvelope(ctx, {
      organizationId: args.organizationId,
      action: "email_received",
      performedBy: args.performedBy as any,
      module: "crm",
      summary: `Received email "${args.subject}" from ${args.from}`,
      occurredAt: args.now,
      actor: {
        type: "external",
        label: args.from,
      },
      payload: {
        emailId: args.emailId,
        direction: "inbound",
        from: args.from,
        to: args.to,
        subject: args.subject,
      },
      eventKey: `crm:email:${args.emailId}:email_received`,
      targets: [
        {
          entityType: "email",
          entityId: args.emailId,
        },
      ],
    });
  },
});
