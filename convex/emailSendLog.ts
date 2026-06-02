import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireOrgAdmin } from "./_helpers/auth";

const sourceValidator = v.union(
  v.literal("signing"),
  v.literal("automation"),
  v.literal("manual_compose"),
  v.literal("auto_generate"),
  v.literal("event_trigger"),
  v.literal("system"),
);

const providerValidator = v.union(
  v.literal("resend"),
  v.literal("mailgun"),
  v.literal("google"),
  v.literal("microsoft"),
  v.literal("gmail"),
  v.literal("dev_intercept"),
);

const statusValidator = v.union(
  v.literal("sent"),
  v.literal("failed"),
  v.literal("skipped"),
);

export const record = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    source: sourceValidator,
    templateId: v.optional(v.string()),
    provider: v.optional(providerValidator),
    status: statusValidator,
    errorMessage: v.optional(v.string()),
    recipientEmail: v.string(),
    recipientName: v.optional(v.string()),
    fromEmail: v.optional(v.string()),
    subject: v.optional(v.string()),
    relatedEntityType: v.optional(v.string()),
    relatedEntityId: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    triggeredBy: v.optional(v.id("users")),
    sentAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { sentAt, ...rest } = args;
    return await ctx.db.insert("emailSendLog", {
      ...rest,
      sentAt: sentAt ?? Date.now(),
    });
  },
});

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    status: v.optional(statusValidator),
    source: v.optional(sourceValidator),
    provider: v.optional(providerValidator),
    recipient: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);
    const limit = Math.min(args.limit ?? 100, 500);

    const entries = await ctx.db
      .query("emailSendLog")
      .withIndex("by_org_sentAt", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .order("desc")
      .collect();

    const recipientNeedle = args.recipient?.trim().toLowerCase();

    const filtered = entries.filter((e) => {
      if (args.status && e.status !== args.status) return false;
      if (args.source && e.source !== args.source) return false;
      if (args.provider && e.provider !== args.provider) return false;
      if (args.startDate !== undefined && e.sentAt < args.startDate) return false;
      if (args.endDate !== undefined && e.sentAt > args.endDate) return false;
      if (recipientNeedle && !e.recipientEmail.toLowerCase().includes(recipientNeedle)) {
        return false;
      }
      return true;
    });

    return filtered.slice(0, limit);
  },
});
