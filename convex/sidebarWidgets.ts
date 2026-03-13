// convex/sidebarWidgets.ts
import { query } from "./_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";

// --- Insights (Dashboard) ---
export const getInsightsKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();
    const thisMonthStart = new Date();
    thisMonthStart.setDate(1);
    thisMonthStart.setHours(0, 0, 0, 0);
    const lastMonthStart = new Date(thisMonthStart);
    lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);

    const leads = await ctx.db
      .query("leads")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const companies = await ctx.db
      .query("companies")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const openLeads = leads.filter((l) => l.status === "open");
    const wonLeads = leads.filter((l) => l.status === "won");
    const lostLeads = leads.filter((l) => l.status === "lost");
    const closedCount = wonLeads.length + lostLeads.length;

    const thisMonthWon = wonLeads.filter((l) => (l.wonAt ?? l.updatedAt) >= thisMonthStart.getTime());
    const lastMonthWon = wonLeads.filter(
      (l) => (l.wonAt ?? l.updatedAt) >= lastMonthStart.getTime() && (l.wonAt ?? l.updatedAt) < thisMonthStart.getTime()
    );

    const thisMonthRevenue = thisMonthWon.reduce((s, l) => s + (l.value ?? 0), 0);
    const lastMonthRevenue = lastMonthWon.reduce((s, l) => s + (l.value ?? 0), 0);
    const revenueTrend = lastMonthRevenue > 0
      ? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
      : 0;

    void user;

    return {
      revenue: thisMonthRevenue,
      revenueTrend,
      pipelineValue: openLeads.reduce((s, l) => s + (l.value ?? 0), 0),
      openDeals: openLeads.length,
      totalContacts: contacts.length,
      totalCompanies: companies.length,
      winRate: closedCount > 0 ? Math.round((wonLeads.length / closedCount) * 100) : 0,
    };
  },
});

// --- Deals ---
export const getDealsKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const open = leads.filter((l) => l.status === "open");
    const won = leads.filter((l) => l.status === "won");
    const lost = leads.filter((l) => l.status === "lost");
    const closed = won.length + lost.length;

    return {
      openCount: open.length,
      pipelineValue: open.reduce((s, l) => s + (l.value ?? 0), 0),
      winRate: closed > 0 ? Math.round((won.length / closed) * 100) : 0,
    };
  },
});

// --- Contacts ---
export const getContactsKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    return {
      total: contacts.length,
      newThisWeek: contacts.filter((c) => c.createdAt >= weekAgo).length,
      unlinked: contacts.filter((c) => !c.companyId).length,
    };
  },
});

// --- Companies ---
export const getCompaniesKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const companies = await ctx.db
      .query("companies")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const leads = await ctx.db
      .query("leads")
      .withIndex("by_orgAndStatus", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "won"))
      .collect();

    const revenue = leads.reduce((s, l) => s + (l.value ?? 0), 0);

    return {
      total: companies.length,
      newThisMonth: companies.filter((c) => c.createdAt >= monthStart.getTime()).length,
      totalRevenue: revenue,
    };
  },
});

// --- Activities ---
export const getActivitiesKpis = query({
  args: { organizationId: v.id("organizations"), userId: v.id("users") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = todayStart.getTime() + 24 * 60 * 60 * 1000;

    const scheduled = await ctx.db
      .query("scheduledActivities")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const userActivities = scheduled.filter((a) => a.ownerId === args.userId);
    const overdue = userActivities.filter((a) => a.dueDate && a.dueDate < now && !a.isCompleted);
    const today = userActivities.filter(
      (a) => a.dueDate && a.dueDate >= todayStart.getTime() && a.dueDate < todayEnd
    );
    const completed = userActivities.filter((a) => a.isCompleted);
    const completionRate = userActivities.length > 0
      ? Math.round((completed.length / userActivities.length) * 100)
      : 0;

    return {
      overdue: overdue.length,
      today: today.length,
      completionRate,
    };
  },
});

// --- Inbox ---
export const getInboxKpis = query({
  args: { organizationId: v.id("organizations"), userId: v.id("users") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const emails = await ctx.db
      .query("emails")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    void args.userId;

    const unread = emails.filter((e) => !e.isRead && e.direction === "inbound");
    const todayReceived = emails.filter(
      (e) => e.direction === "inbound" && e.sentAt >= todayStart.getTime()
    );

    return {
      unread: unread.length,
      todayReceived: todayReceived.length,
    };
  },
});

// --- Calls ---
export const getCallsKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const calls = await ctx.db
      .query("calls")
      .withIndex("by_orgAndDate", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const todayCalls = calls.filter((c) => c.callDate >= todayStart.getTime());
    const answered = todayCalls.filter((c) => c.outcome === "movedConversationForward");
    const withDuration = todayCalls.filter((c) => c.duration != null && c.duration > 0);
    const avgDuration = withDuration.length > 0
      ? Math.round(withDuration.reduce((s, c) => s + (c.duration ?? 0), 0) / withDuration.length)
      : 0;

    return {
      todayCount: todayCalls.length,
      answerRate: todayCalls.length > 0 ? Math.round((answered.length / todayCalls.length) * 100) : 0,
      avgDurationSec: avgDuration,
    };
  },
});

// --- Products ---
export const getProductsKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const products = await ctx.db
      .query("products")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const dealProducts = await ctx.db
      .query("dealProducts")
      .collect();

    const productUsage = new Map<string, number>();
    for (const dp of dealProducts) {
      productUsage.set(String(dp.productId), (productUsage.get(String(dp.productId)) ?? 0) + 1);
    }

    let topSeller = "";
    let topCount = 0;
    for (const [pid, count] of productUsage) {
      if (count > topCount) {
        topCount = count;
        const product = products.find((p) => String(p._id) === pid);
        topSeller = product?.name ?? "";
      }
    }

    return {
      total: products.length,
      inDeals: productUsage.size,
      topSeller,
      topSellerCount: topCount,
    };
  },
});

// --- Documents (CRM) ---
export const getDocumentsKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const docs = await ctx.db
      .query("documents")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    return {
      total: docs.length,
      newThisMonth: docs.filter((d) => d.createdAt >= monthStart.getTime()).length,
      pendingSignature: docs.filter((d) => d.status === "pending_signature").length,
    };
  },
});

// --- Calendar (CRM) ---
export const getCalendarKpis = query({
  args: { organizationId: v.id("organizations"), userId: v.id("users") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = todayStart.getTime() + 24 * 60 * 60 * 1000;
    const weekEnd = todayStart.getTime() + 7 * 24 * 60 * 60 * 1000;

    const scheduled = await ctx.db
      .query("scheduledActivities")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const userActivities = scheduled.filter((a) => a.ownerId === args.userId);

    return {
      today: userActivities.filter((a) => a.dueDate && a.dueDate >= todayStart.getTime() && a.dueDate < todayEnd).length,
      overdue: userActivities.filter((a) => a.dueDate && a.dueDate < now && !a.isCompleted).length,
      thisWeek: userActivities.filter((a) => a.dueDate && a.dueDate >= todayStart.getTime() && a.dueDate < weekEnd).length,
    };
  },
});

// --- Upcoming Events (Smart Agenda) ---
export const getUpcomingEvents = query({
  args: { organizationId: v.id("organizations"), userId: v.id("users"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();
    const limit = args.limit ?? 3;

    const scheduled = await ctx.db
      .query("scheduledActivities")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    return scheduled
      .filter((a) => a.ownerId === args.userId && a.dueDate && a.dueDate >= now && !a.isCompleted)
      .sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0))
      .slice(0, limit)
      .map((a) => ({
        id: a._id,
        title: a.title,
        startTime: a.dueDate!,
        type: a.activityType,
      }));
  },
});

// --- Leads by Stage (Mini Funnel) ---
export const getLeadsByStage = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const stages = await ctx.db
      .query("pipelineStages")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const leads = await ctx.db
      .query("leads")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const openLeads = leads.filter((l) => l.status === "open");

    const stageColors = [
      "bg-blue-500", "bg-violet-500", "bg-amber-500", "bg-emerald-500",
      "bg-rose-500", "bg-cyan-500", "bg-orange-500", "bg-pink-500",
    ];

    return stages
      .sort((a, b) => a.order - b.order)
      .map((stage, i) => ({
        label: stage.name,
        count: openLeads.filter((l) => l.pipelineStageId === stage._id).length,
        color: stage.color ?? stageColors[i % stageColors.length],
      }))
      .filter((s) => s.count > 0);
  },
});

// --- Contacts by Source (Source Bar) ---
export const getContactsBySource = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const sourceColors = [
      "bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500",
      "bg-rose-500", "bg-cyan-500", "bg-orange-500",
    ];

    const sourceCounts = new Map<string, number>();
    for (const c of contacts) {
      const src = c.source ?? "unknown";
      sourceCounts.set(src, (sourceCounts.get(src) ?? 0) + 1);
    }

    const entries = Array.from(sourceCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    const total = entries.reduce((s, [, c]) => s + c, 0) || 1;

    return entries.map(([label, count], i) => ({
      label,
      count,
      pct: Math.round((count / total) * 100),
      color: sourceColors[i % sourceColors.length],
    }));
  },
});

// --- Top Products (Bar Ranking) ---
export const getTopProducts = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const products = await ctx.db
      .query("products")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const dealProducts = await ctx.db
      .query("dealProducts")
      .collect();

    const countMap = new Map<string, number>();
    for (const dp of dealProducts) {
      const key = String(dp.productId);
      countMap.set(key, (countMap.get(key) ?? 0) + 1);
    }

    return products
      .map((p) => ({ label: p.name, value: countMap.get(String(p._id)) ?? 0 }))
      .filter((p) => p.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  },
});

// --- Email Templates ---
export const getEmailTemplatesKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const templates = await ctx.db
      .query("emailTemplates")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const emails = await ctx.db
      .query("emails")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const thisMonthEmails = emails.filter(
      (e) => e.templateId != null && e.createdAt >= monthStart.getTime()
    );

    const usageMap = new Map<string, number>();
    for (const e of thisMonthEmails) {
      if (e.templateId) {
        const key = String(e.templateId);
        usageMap.set(key, (usageMap.get(key) ?? 0) + 1);
      }
    }

    let topTemplateName = "";
    let topCount = 0;
    for (const [tid, count] of usageMap) {
      if (count > topCount) {
        topCount = count;
        const tmpl = templates.find((t) => String(t._id) === tid);
        topTemplateName = tmpl?.name ?? "";
      }
    }

    return {
      totalTemplates: templates.length,
      usagesThisMonth: thisMonthEmails.length,
      topTemplateName,
    };
  },
});
