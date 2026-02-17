import { query, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { requireOrgAdmin } from "./_helpers/auth";

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
    actionFilter: v.optional(v.string()),
    userFilter: v.optional(v.id("users")),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);
    const limit = args.limit ?? 50;

    const entries = await ctx.db
      .query("auditLog")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .collect();

    let filtered = entries;

    if (args.actionFilter) {
      filtered = filtered.filter((e) => e.action === args.actionFilter);
    }
    if (args.userFilter) {
      filtered = filtered.filter((e) => e.userId === args.userFilter);
    }
    if (args.startDate) {
      filtered = filtered.filter((e) => e.createdAt >= args.startDate!);
    }
    if (args.endDate) {
      filtered = filtered.filter((e) => e.createdAt <= args.endDate!);
    }

    filtered = filtered.slice(0, limit);

    // Resolve user details
    const userIds = [...new Set(filtered.map((e) => e.userId))];
    const users = await Promise.all(userIds.map((id) => ctx.db.get(id)));
    const userMap = new Map(
      users
        .filter((u) => u !== null)
        .map((u) => [u!._id, { name: u!.name, email: u!.email }])
    );

    return filtered.map((entry) => ({
      ...entry,
      user: userMap.get(entry.userId) ?? null,
    }));
  },
});

export async function logAudit(
  ctx: MutationCtx,
  data: {
    organizationId: Id<"organizations">;
    userId: Id<"users">;
    action: string;
    entityType?: string;
    entityId?: string;
    details?: string;
  }
) {
  await ctx.db.insert("auditLog", {
    ...data,
    createdAt: Date.now(),
  });
}
