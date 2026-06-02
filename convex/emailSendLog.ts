import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
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

// Hard cap on rows returned by `exportRows` to keep a single query under
// Convex's per-query document/byte limits. ~5k rows of log metadata fits
// comfortably under the 16 MiB return budget while still covering most
// real-world export needs for a single org.
const EXPORT_ROW_CAP = 5000;

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
    paginationOpts: paginationOptsValidator,
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    status: v.optional(statusValidator),
    source: v.optional(sourceValidator),
    provider: v.optional(providerValidator),
    recipient: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);

    const result = await ctx.db
      .query("emailSendLog")
      .withIndex("by_org_sentAt", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .order("desc")
      .filter((q) => {
        const exprs = [];
        if (args.status) exprs.push(q.eq(q.field("status"), args.status));
        if (args.source) exprs.push(q.eq(q.field("source"), args.source));
        if (args.provider) exprs.push(q.eq(q.field("provider"), args.provider));
        if (args.startDate !== undefined) {
          exprs.push(q.gte(q.field("sentAt"), args.startDate));
        }
        if (args.endDate !== undefined) {
          exprs.push(q.lte(q.field("sentAt"), args.endDate));
        }
        if (exprs.length === 0) {
          // Tautology — the index already restricts to this org. Returned only
          // because `.filter` requires an expression.
          return q.eq(q.field("organizationId"), args.organizationId);
        }
        if (exprs.length === 1) return exprs[0];
        return q.and(...exprs);
      })
      .paginate(args.paginationOpts);

    const recipientNeedle = args.recipient?.trim().toLowerCase();
    if (recipientNeedle) {
      return {
        ...result,
        page: result.page.filter((e) =>
          e.recipientEmail.toLowerCase().includes(recipientNeedle),
        ),
      };
    }
    return result;
  },
});

// Returns up to `EXPORT_ROW_CAP` matching rows in a single response for CSV
// download. Filters mirror `list`. Callers should display a warning when the
// returned array length equals the cap (export was truncated).
export const exportRows = query({
  args: {
    organizationId: v.id("organizations"),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    status: v.optional(statusValidator),
    source: v.optional(sourceValidator),
    provider: v.optional(providerValidator),
    recipient: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);

    const rows = await ctx.db
      .query("emailSendLog")
      .withIndex("by_org_sentAt", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .order("desc")
      .filter((q) => {
        const exprs = [];
        if (args.status) exprs.push(q.eq(q.field("status"), args.status));
        if (args.source) exprs.push(q.eq(q.field("source"), args.source));
        if (args.provider) exprs.push(q.eq(q.field("provider"), args.provider));
        if (args.startDate !== undefined) {
          exprs.push(q.gte(q.field("sentAt"), args.startDate));
        }
        if (args.endDate !== undefined) {
          exprs.push(q.lte(q.field("sentAt"), args.endDate));
        }
        if (exprs.length === 0) {
          return q.eq(q.field("organizationId"), args.organizationId);
        }
        if (exprs.length === 1) return exprs[0];
        return q.and(...exprs);
      })
      .take(EXPORT_ROW_CAP);

    const recipientNeedle = args.recipient?.trim().toLowerCase();
    const filtered = recipientNeedle
      ? rows.filter((e) =>
          e.recipientEmail.toLowerCase().includes(recipientNeedle),
        )
      : rows;

    return {
      rows: filtered,
      truncated: rows.length === EXPORT_ROW_CAP,
      cap: EXPORT_ROW_CAP,
    };
  },
});
