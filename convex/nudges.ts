// convex/nudges.ts
import { query, mutation } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";

export interface NudgeData {
  message: string;
  messageValues?: Record<string, string | number>;
  severity: "red" | "yellow" | "green";
  icon?: string;
}

// --- Insights nudges ---
export const getInsightsNudges = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verifyOrgAccess(ctx, args.organizationId);
    const nudges: NudgeData[] = [];
    const now = Date.now();
    const weekEnd = now + 7 * 24 * 60 * 60 * 1000;

    const leads = await ctx.db
      .query("leads")
      .withIndex("by_orgAndStatus", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "open"))
      .collect();

    // Deals closing this week
    const closingThisWeek = leads.filter((l) => l.expectedCloseDate && l.expectedCloseDate <= weekEnd);
    if (closingThisWeek.length > 0) {
      nudges.push({
        message: "sidebar.nudges.insights.closingThisWeek",
        messageValues: { count: closingThisWeek.length },
        severity: "red",
      });
    }

    // Overdue scheduled activities
    const scheduled = await ctx.db
      .query("scheduledActivities")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const overdue = scheduled.filter((a) => a.dueDate && a.dueDate < now && !a.isCompleted);
    if (overdue.length > 0) {
      nudges.push({
        message: "sidebar.nudges.insights.overdueActivities",
        messageValues: { count: overdue.length },
        severity: "yellow",
      });
    }

    return nudges.slice(0, 2);
  },
});

// --- Deals nudges ---
export const getDealsNudges = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verifyOrgAccess(ctx, args.organizationId);
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const leads = await ctx.db
      .query("leads")
      .withIndex("by_orgAndStatus", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "open"))
      .collect();

    // Get activities (activity log) to check last interaction per lead
    const activities = await ctx.db
      .query("activities")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const lastActivityByLead = new Map<string, number>();
    for (const activity of activities) {
      if (!activity.entityId) continue;
      const previous = lastActivityByLead.get(activity.entityId);
      if (previous === undefined || activity.createdAt > previous) {
        lastActivityByLead.set(activity.entityId, activity.createdAt);
      }
    }

    const staleLeads = leads.filter((lead) => {
      const lastActivityAt = lastActivityByLead.get(String(lead._id));
      return lastActivityAt === undefined || lastActivityAt < sevenDaysAgo;
    });

    if (staleLeads.length > 0) {
      return [{
        message: "sidebar.nudges.deals.stale",
        messageValues: { count: staleLeads.length },
        severity: "yellow",
      }];
    }
    return [];
  },
});

// --- Contacts nudges ---
export const getContactsNudges = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verifyOrgAccess(ctx, args.organizationId);
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    // Contacts are linked to companies via objectRelationships (sourceType="contact", targetType="company")
    const relationships = await ctx.db
      .query("objectRelationships")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const contactsWithCompany = new Set(
      relationships
        .filter((r) => r.sourceType === "contact" && r.targetType === "company")
        .map((r) => r.sourceId)
    );

    const unlinked = contacts.filter((c) => !contactsWithCompany.has(String(c._id)));
    if (unlinked.length > 0) {
      return [{
        message: "sidebar.nudges.contacts.unlinkedCompany",
        messageValues: { count: unlinked.length },
        severity: "yellow",
      }];
    }
    return [];
  },
});

// --- Inbox nudges ---
export const getInboxNudges = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verifyOrgAccess(ctx, args.organizationId);
    const twoDaysAgo = Date.now() - 48 * 60 * 60 * 1000;

    const emails = await ctx.db
      .query("emails")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const unanswered = emails.filter(
      (e) => e.direction === "inbound" && !e.isRead && e.sentAt < twoDaysAgo
    );

    if (unanswered.length > 0) {
      return [{
        message: "sidebar.nudges.inbox.unanswered",
        messageValues: { count: unanswered.length },
        severity: "red",
      }];
    }
    return [];
  },
});

// --- Activities nudges ---
export const getActivitiesNudges = query({
  args: { organizationId: v.id("organizations"), userId: v.id("users") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();

    const scheduled = await ctx.db
      .query("scheduledActivities")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const overdue = scheduled.filter(
      (a) => a.ownerId === args.userId && a.dueDate && a.dueDate < now && !a.isCompleted
    );

    if (overdue.length > 0) {
      const oldest = overdue.sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0))[0];
      const daysOld = Math.floor((now - (oldest.dueDate ?? now)) / (24 * 60 * 60 * 1000));
      return [{
        message: "sidebar.nudges.activities.overdueOldest",
        messageValues: { count: overdue.length, days: daysOld },
        severity: "red",
      }];
    }
    return [];
  },
});

// --- Documents nudges ---
export const getDocumentsNudges = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verifyOrgAccess(ctx, args.organizationId);

    const docs = await ctx.db
      .query("documents")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const pending = docs.filter((d) => d.status === "sent");
    if (pending.length > 0) {
      return [{
        message: "sidebar.nudges.documents.pendingApproval",
        messageValues: { count: pending.length },
        severity: "yellow",
      }];
    }
    return [];
  },
});

// --- Calendar nudges ---
export const getCalendarNudges = query({
  args: { organizationId: v.id("organizations"), userId: v.id("users") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();
    const yesterdayStart = new Date();
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);

    const scheduled = await ctx.db
      .query("scheduledActivities")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const yesterdayOverdue = scheduled.filter(
      (a) => a.ownerId === args.userId && a.dueDate && a.dueDate >= yesterdayStart.getTime() && a.dueDate < now && !a.isCompleted
    );

    if (yesterdayOverdue.length > 0) {
      return [{
        message: "sidebar.nudges.calendar.yesterdayOverdue",
        messageValues: { count: yesterdayOverdue.length },
        severity: "yellow",
      }];
    }
    return [];
  },
});

// --- Companies nudges ---
export const getCompaniesNudges = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verifyOrgAccess(ctx, args.organizationId);
    const nudges: NudgeData[] = [];

    const companies = await ctx.db
      .query("companies")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    // Companies with no contacts linked (via objectRelationships)
    const relationships = await ctx.db
      .query("objectRelationships")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const companiesWithContacts = new Set(
      relationships
        .filter((r) => r.sourceType === "company" && r.targetType === "contact")
        .map((r) => r.sourceId)
    );
    // Also check reverse: contact→company
    const companiesLinkedFromContacts = new Set(
      relationships
        .filter((r) => r.sourceType === "contact" && r.targetType === "company")
        .map((r) => r.targetId)
    );

    const noContacts = companies.filter(
      (c) => !companiesWithContacts.has(String(c._id)) && !companiesLinkedFromContacts.has(String(c._id))
    );
    if (noContacts.length > 0) {
      nudges.push({
        message: "sidebar.nudges.companies.noContacts",
        messageValues: { count: noContacts.length },
        severity: "yellow",
      });
    }

    // Companies missing industry
    const noIndustry = companies.filter((c) => !c.industry);
    if (noIndustry.length > 3) {
      nudges.push({
        message: "sidebar.nudges.companies.noIndustry",
        messageValues: { count: noIndustry.length },
        severity: "yellow",
      });
    }

    return nudges.slice(0, 2);
  },
});

// --- Calls nudges ---
export const getCallsNudges = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verifyOrgAccess(ctx, args.organizationId);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const calls = await ctx.db
      .query("calls")
      .withIndex("by_orgAndDate", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const todayCalls = calls.filter((c) => c.callDate >= todayStart.getTime());
    const noOutcome = todayCalls.filter((c) => !c.outcome);

    if (noOutcome.length > 0) {
      return [{
        message: "sidebar.nudges.calls.noOutcome",
        messageValues: { count: noOutcome.length },
        severity: "yellow",
      }];
    }
    return [];
  },
});

// --- Products nudges ---
export const getProductsNudges = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verifyOrgAccess(ctx, args.organizationId);

    const products = await ctx.db
      .query("products")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const usedProductIds = new Set<string>();
    for (const p of products) {
      const hasDeals = await ctx.db
        .query("dealProducts")
        .withIndex("by_product", (q) => q.eq("productId", p._id))
        .first();
      if (hasDeals) {
        usedProductIds.add(String(p._id));
      }
    }
    const unused = products.filter((p) => !usedProductIds.has(String(p._id)));

    if (unused.length > 0) {
      return [{
        message: "sidebar.nudges.products.unused",
        messageValues: { count: unused.length },
        severity: "yellow",
      }];
    }
    return [];
  },
});

// --- Get all CRM nudges ---
export const getAll = query({
  args: { organizationId: v.id("organizations"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verifyOrgAccess(ctx, args.organizationId);
    const nudges: NudgeData[] = [];

    // Fetch nudges from all sources in parallel
    const [insights, deals, contacts, inbox, documents, companies, calls, products] = await Promise.all([
      ctx.runQuery(api.nudges.getInsightsNudges, { organizationId: args.organizationId }),
      ctx.runQuery(api.nudges.getDealsNudges, { organizationId: args.organizationId }),
      ctx.runQuery(api.nudges.getContactsNudges, { organizationId: args.organizationId }),
      ctx.runQuery(api.nudges.getInboxNudges, { organizationId: args.organizationId }),
      ctx.runQuery(api.nudges.getDocumentsNudges, { organizationId: args.organizationId }),
      ctx.runQuery(api.nudges.getCompaniesNudges, { organizationId: args.organizationId }),
      ctx.runQuery(api.nudges.getCallsNudges, { organizationId: args.organizationId }),
      ctx.runQuery(api.nudges.getProductsNudges, { organizationId: args.organizationId }),
    ]);

    // User-specific nudges
    if (args.userId) {
      const [activities, calendar] = await Promise.all([
        ctx.runQuery(api.nudges.getActivitiesNudges, { organizationId: args.organizationId, userId: args.userId }),
        ctx.runQuery(api.nudges.getCalendarNudges, { organizationId: args.organizationId, userId: args.userId }),
      ]);
      nudges.push(...activities, ...calendar);
    }

    // Add all other nudges (limit to avoid overwhelming)
    nudges.push(
      ...insights,
      ...deals,
      ...contacts,
      ...inbox,
      ...documents,
      ...companies,
      ...calls,
      ...products,
    );

    // Sort by severity (red > yellow > green) and limit to 10
    const severityOrder = { red: 0, yellow: 1, green: 2 };
    nudges.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return nudges.slice(0, 10);
  },
});
