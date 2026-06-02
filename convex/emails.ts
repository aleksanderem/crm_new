import { query, action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { verifyOrgAccess } from "./_helpers/auth";
import { publishActivityEnvelope } from "./_helpers/activityEnvelope";
import { emailDirectionValidator } from "@cvx/schema";
import { sendEmail } from "@cvx/email";
import { Id } from "./_generated/dataModel";
import type { EmailRow } from "./_helpers/supabaseRows";

// Dual-write refs removed — Supabase is now primary for email writes

export const listInbox = query({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    direction: v.optional(emailDirectionValidator),
    isRead: v.optional(v.boolean()),
    mailProviderId: v.optional(v.id("mailProviders")),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    if (args.search) {
      const searchQuery = ctx.db
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

      const filtered = results.filter((e) => {
        if (args.isRead !== undefined && e.isRead !== args.isRead) return false;
        if (args.mailProviderId && e.mailProviderId !== args.mailProviderId) return false;
        return true;
      });

      return { page: filtered, isDone: true, continueCursor: "" };
    }

    const baseQuery = args.mailProviderId
      ? ctx.db
          .query("emails")
          .withIndex("by_org_provider", (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("mailProviderId", args.mailProviderId)
          )
          .order("desc")
      : ctx.db
          .query("emails")
          .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
          .order("desc");

    if (args.direction || args.isRead !== undefined) {
      const all = await baseQuery.collect();
      const filtered = all.filter((e) => {
        if (args.direction && e.direction !== args.direction) return false;
        if (args.isRead !== undefined && e.isRead !== args.isRead) return false;
        return true;
      });
      const numItems = args.paginationOpts.numItems;
      const page = filtered.slice(0, numItems);
      return {
        page,
        isDone: filtered.length <= numItems,
        continueCursor: "",
      };
    }

    return await baseQuery.paginate(args.paginationOpts);
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

export const listByEntity = action({
  args: {
    organizationId: v.id("organizations"),
    entityType: v.string(),
    entityId: v.string(),
  },
  handler: async (ctx, args): Promise<EmailRow[]> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
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

export const send = action({
  args: {
    organizationId: v.id("organizations"),
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
    const authResult = await ctx.runQuery(
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
        triggeredBy: authResult.userId as Id<"users">,
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

    // --- Delegate Convex-only side effects ---
    try {
      await ctx.runMutation(internal.emails._sendSideEffects, {
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
    organizationId: v.id("organizations"),
    to: v.array(v.string()),
    subject: v.string(),
    sentBy: v.string(),
    sentAt: v.number(),
  },
  handler: async (ctx, args) => {
    const sentByUserId = args.sentBy as Id<"users">;

    await publishActivityEnvelope(ctx, {
      organizationId: args.organizationId,
      action: "email_sent",
      performedBy: sentByUserId,
      module: "crm",
      summary: `Sent email "${args.subject}" to ${args.to.join(", ")}`,
      occurredAt: args.sentAt,
      actor: {
        type: "user",
        userId: sentByUserId,
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
    organizationId: v.id("organizations"),
    emailId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(
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
    organizationId: v.id("organizations"),
    emailId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(
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
    organizationId: v.id("organizations"),
    emailId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(
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
    organizationId: v.id("organizations"),
    patientId: v.string(),
  },
  handler: async (ctx, args): Promise<EmailRow[]> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
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
    organizationId: v.id("organizations"),
    appointmentId: v.string(),
  },
  handler: async (ctx, args): Promise<EmailRow[]> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
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
    organizationId: v.id("organizations"),
    employeeId: v.string(),
  },
  handler: async (ctx, args): Promise<EmailRow[]> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
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
    organizationId: v.id("organizations"),
    emailId: v.string(),
    contactId: v.optional(v.string()),
    companyId: v.optional(v.string()),
    leadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(
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
