import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { verifyOrgAccess } from "./_helpers/auth";
import { logActivity } from "./_helpers/activities";
import { emailDirectionValidator } from "@cvx/schema";
import { sendEmail } from "@cvx/email";
import { Id } from "./_generated/dataModel";

export const listInbox = query({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    direction: v.optional(emailDirectionValidator),
    isRead: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    if (args.search) {
      let searchQuery = ctx.db
        .query("emails")
        .withSearchIndex("search_emails", (q) => {
          let sq = q
            .search("subject", args.search!)
            .eq("organizationId", args.organizationId);
          if (args.direction) {
            sq = sq.eq("direction", args.direction);
          }
          return sq;
        });

      const results = await searchQuery.take(50);

      const filtered =
        args.isRead !== undefined
          ? results.filter((e) => e.isRead === args.isRead)
          : results;

      return { page: filtered, isDone: true, continueCursor: "" };
    }

    let q = ctx.db
      .query("emails")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .order("desc");

    if (args.direction) {
      const all = await q.collect();
      const filtered = all.filter((e) => {
        if (args.direction && e.direction !== args.direction) return false;
        if (args.isRead !== undefined && e.isRead !== args.isRead) return false;
        return true;
      });
      const start = 0;
      const numItems = args.paginationOpts.numItems;
      const page = filtered.slice(start, start + numItems);
      return {
        page,
        isDone: filtered.length <= numItems,
        continueCursor: "",
      };
    }

    if (args.isRead !== undefined) {
      const all = await q.collect();
      const filtered = all.filter((e) => e.isRead === args.isRead);
      const numItems = args.paginationOpts.numItems;
      const page = filtered.slice(0, numItems);
      return {
        page,
        isDone: filtered.length <= numItems,
        continueCursor: "",
      };
    }

    return await q.paginate(args.paginationOpts);
  },
});

export const getThread = query({
  args: {
    organizationId: v.id("organizations"),
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const emails = await ctx.db
      .query("emails")
      .withIndex("by_thread", (q) =>
        q.eq("organizationId", args.organizationId).eq("threadId", args.threadId)
      )
      .collect();

    return emails.sort((a, b) => a.sentAt - b.sentAt);
  },
});

export const getById = query({
  args: {
    organizationId: v.id("organizations"),
    emailId: v.id("emails"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const email = await ctx.db.get(args.emailId);
    if (!email || email.organizationId !== args.organizationId) {
      throw new Error("Email not found");
    }

    return email;
  },
});

export const listByEntity = query({
  args: {
    organizationId: v.id("organizations"),
    entityType: v.string(),
    entityId: v.string(),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    let emails;

    if (args.entityType === "contact") {
      emails = await ctx.db
        .query("emails")
        .withIndex("by_contact", (q) =>
          q.eq("contactId", args.entityId as Id<"contacts">)
        )
        .collect();
    } else if (args.entityType === "company") {
      emails = await ctx.db
        .query("emails")
        .withIndex("by_company", (q) =>
          q.eq("companyId", args.entityId as Id<"companies">)
        )
        .collect();
    } else if (args.entityType === "lead") {
      emails = await ctx.db
        .query("emails")
        .withIndex("by_lead", (q) =>
          q.eq("leadId", args.entityId as Id<"leads">)
        )
        .collect();
    } else {
      throw new Error(`Invalid entity type: ${args.entityType}`);
    }

    return emails.sort((a, b) => b.sentAt - a.sentAt);
  },
});

export const getUnreadCount = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const emails = await ctx.db
      .query("emails")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    return emails.filter((e) => e.isRead === false).length;
  },
});

export const send = mutation({
  args: {
    organizationId: v.id("organizations"),
    to: v.array(v.string()),
    cc: v.optional(v.array(v.string())),
    bcc: v.optional(v.array(v.string())),
    subject: v.string(),
    bodyHtml: v.optional(v.string()),
    bodyText: v.optional(v.string()),
    contactId: v.optional(v.id("contacts")),
    companyId: v.optional(v.id("companies")),
    leadId: v.optional(v.id("leads")),
    inReplyTo: v.optional(v.string()),
    threadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();

    // Get default email account for org
    const emailAccounts = await ctx.db
      .query("emailAccounts")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const defaultAccount = emailAccounts.find((a) => a.isDefault);
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
    });

    // Insert email record
    const emailId = await ctx.db.insert("emails", {
      organizationId: args.organizationId,
      threadId,
      messageId,
      inReplyTo: args.inReplyTo,
      direction: "outbound",
      from: defaultAccount.fromEmail,
      to: args.to,
      cc: args.cc,
      bcc: args.bcc,
      subject: args.subject,
      bodyHtml: args.bodyHtml,
      bodyText: args.bodyText,
      snippet,
      isRead: true,
      isStarred: false,
      contactId: args.contactId,
      companyId: args.companyId,
      leadId: args.leadId,
      sentBy: user._id,
      sentAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "email",
      entityId: emailId,
      action: "email_sent",
      description: `Sent email "${args.subject}" to ${args.to.join(", ")}`,
      performedBy: user._id,
    });

    return emailId;
  },
});

export const markRead = mutation({
  args: {
    organizationId: v.id("organizations"),
    emailId: v.id("emails"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const email = await ctx.db.get(args.emailId);
    if (!email || email.organizationId !== args.organizationId) {
      throw new Error("Email not found");
    }

    await ctx.db.patch(args.emailId, {
      isRead: true,
      updatedAt: Date.now(),
    });

    return args.emailId;
  },
});

export const markUnread = mutation({
  args: {
    organizationId: v.id("organizations"),
    emailId: v.id("emails"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const email = await ctx.db.get(args.emailId);
    if (!email || email.organizationId !== args.organizationId) {
      throw new Error("Email not found");
    }

    await ctx.db.patch(args.emailId, {
      isRead: false,
      updatedAt: Date.now(),
    });

    return args.emailId;
  },
});

export const toggleStar = mutation({
  args: {
    organizationId: v.id("organizations"),
    emailId: v.id("emails"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const email = await ctx.db.get(args.emailId);
    if (!email || email.organizationId !== args.organizationId) {
      throw new Error("Email not found");
    }

    await ctx.db.patch(args.emailId, {
      isStarred: !email.isStarred,
      updatedAt: Date.now(),
    });

    return args.emailId;
  },
});

export const linkToEntity = mutation({
  args: {
    organizationId: v.id("organizations"),
    emailId: v.id("emails"),
    contactId: v.optional(v.id("contacts")),
    companyId: v.optional(v.id("companies")),
    leadId: v.optional(v.id("leads")),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const email = await ctx.db.get(args.emailId);
    if (!email || email.organizationId !== args.organizationId) {
      throw new Error("Email not found");
    }

    await ctx.db.patch(args.emailId, {
      contactId: args.contactId,
      companyId: args.companyId,
      leadId: args.leadId,
      updatedAt: Date.now(),
    });

    return args.emailId;
  },
});
