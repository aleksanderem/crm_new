import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const findEmailAccountByAddress = internalQuery({
  args: { addresses: v.array(v.string()) },
  handler: async (ctx, args) => {
    // Check each address against all email accounts
    for (const address of args.addresses) {
      const normalizedAddress = address.toLowerCase().trim();
      // We need to scan email accounts - no index on fromEmail, so scan by org is not possible
      // Instead, collect all and match
      const allAccounts = await ctx.db.query("emailAccounts").collect();
      const match = allAccounts.find(
        (a) => a.fromEmail.toLowerCase() === normalizedAddress
      );
      if (match) return match;
    }
    return null;
  },
});

export const findByMessageId = internalQuery({
  args: { messageId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("emails")
      .withIndex("by_messageId", (q) => q.eq("messageId", args.messageId))
      .unique();
  },
});

export const findContactByEmail = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contacts")
      .withIndex("by_orgAndEmail", (q) =>
        q.eq("organizationId", args.organizationId).eq("email", args.email)
      )
      .first();
  },
});

export const insertOutboundGmail = internalMutation({
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
    contactId: v.optional(v.id("contacts")),
    companyId: v.optional(v.id("companies")),
    leadId: v.optional(v.id("leads")),
    sentBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const messageId = `<${args.gmailMessageId}@gmail>`;
    const threadId = args.threadId ?? messageId;

    let snippet: string | undefined;
    if (args.bodyText) {
      snippet = args.bodyText.slice(0, 200);
    } else if (args.bodyHtml) {
      snippet = args.bodyHtml.replace(/<[^>]*>/g, "").slice(0, 200);
    }

    await ctx.db.insert("emails", {
      organizationId: args.organizationId,
      threadId,
      messageId,
      inReplyTo: args.inReplyTo,
      direction: "outbound",
      from: args.fromEmail,
      to: args.to,
      cc: args.cc,
      bcc: args.bcc,
      subject: args.subject,
      bodyHtml: args.bodyHtml,
      bodyText: args.bodyText,
      snippet,
      isRead: true,
      isStarred: false,
      provider: "gmail",
      gmailMessageId: args.gmailMessageId,
      gmailThreadId: args.gmailThreadId,
      contactId: args.contactId,
      companyId: args.companyId,
      leadId: args.leadId,
      sentBy: args.sentBy,
      sentAt: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const insertInboundGmail = internalMutation({
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
    // Check for duplicates by gmailMessageId
    const existing = await ctx.db
      .query("emails")
      .withIndex("by_gmailMessageId", (q) =>
        q.eq("gmailMessageId", args.gmailMessageId)
      )
      .first();
    if (existing) return; // Already synced

    const now = Date.now();
    const messageId = `<${args.gmailMessageId}@gmail>`;

    // Auto-link to contact by from email
    const contact = await ctx.db
      .query("contacts")
      .withIndex("by_orgAndEmail", (q) =>
        q.eq("organizationId", args.organizationId).eq("email", args.from)
      )
      .first();

    await ctx.db.insert("emails", {
      organizationId: args.organizationId,
      threadId: args.gmailThreadId,
      messageId,
      direction: "inbound",
      from: args.from,
      to: args.to,
      subject: args.subject,
      snippet: args.snippet,
      isRead: false,
      isStarred: false,
      provider: "gmail",
      gmailMessageId: args.gmailMessageId,
      gmailThreadId: args.gmailThreadId,
      contactId: contact?._id,
      sentAt: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const insertInbound = internalMutation({
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
    contactId: v.optional(v.id("contacts")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("emails", {
      organizationId: args.organizationId,
      threadId: args.threadId,
      messageId: args.messageId,
      inReplyTo: args.inReplyTo,
      direction: "inbound",
      from: args.from,
      to: args.to,
      subject: args.subject,
      bodyHtml: args.bodyHtml,
      bodyText: args.bodyText,
      snippet: args.snippet,
      isRead: false,
      isStarred: false,
      contactId: args.contactId,
      sentAt: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});
