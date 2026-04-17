// convex/sidebarWidgets.ts
import { query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { verifyOrgAccess } from "./_helpers/auth";

// --- Insights (Dashboard) ---
export const getInsightsKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
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

// --- Weekly CRM trend (contacts + deals created per day, last 7 days) ---
export const getWeeklyCrmTrend = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const dayNames = ["ni", "po", "wt", "śr", "cz", "pt", "so"];
    const now = new Date();
    const days: { day: string; contacts: number; deals: number }[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const start = d.getTime();
      const end = start + 24 * 60 * 60 * 1000;
      days.push({ day: dayNames[d.getDay()], contacts: 0, deals: 0, _start: start, _end: end } as any);
    }

    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const leads = await ctx.db
      .query("leads")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const weekStart = days[0] as any;
    const recentContacts = contacts.filter((c) => c.createdAt >= weekStart._start);
    const recentLeads = leads.filter((l) => l.createdAt >= weekStart._start);

    for (const day of days as any[]) {
      day.contacts = recentContacts.filter((c) => c.createdAt >= day._start && c.createdAt < day._end).length;
      day.deals = recentLeads.filter((l) => l.createdAt >= day._start && l.createdAt < day._end).length;
    }

    return days.map(({ day, contacts, deals }) => ({ day, contacts, deals }));
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

    const productUsage = new Map<string, number>();
    for (const p of products) {
      const dpCount = (await ctx.db
        .query("dealProducts")
        .withIndex("by_product", (q) => q.eq("productId", p._id))
        .collect()).length;
      if (dpCount > 0) {
        productUsage.set(String(p._id), dpCount);
      }
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
      pendingSent: docs.filter((d) => d.status === "sent").length,
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
      requiresCompletion: userActivities.filter((a) => a.requiresCompletion === true).length,
    };
  },
});

// --- Upcoming Events (Smart Agenda) ---
export const getUpcomingEvents = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    onlyMine: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();
    const limit = args.limit ?? 5;
    const onlyMine = args.onlyMine ?? false;

    const scheduled = await ctx.db
      .query("scheduledActivities")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const filtered = scheduled
      .filter((a) => {
        if (a.isCompleted || !a.dueDate || a.dueDate < now) return false;
        if (onlyMine && a.ownerId !== args.userId) return false;
        return true;
      })
      .sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0))
      .slice(0, limit);

    // Resolve owner info
    const ownerIds = [...new Set(filtered.map((a) => a.ownerId))];
    const owners = await Promise.all(ownerIds.map((id) => ctx.db.get(id)));
    const ownerMap = new Map(owners.filter(Boolean).map((u) => [u!._id, u!]));

    return filtered.map((a) => {
      const owner = ownerMap.get(a.ownerId);
      const isAppointment = a.moduleRef?.moduleId === "gabinet" && a.moduleRef.entityType === "appointment";
      return {
        id: a._id,
        title: a.title,
        startTime: a.dueDate!,
        type: a.activityType,
        // For gabinet appointments: navigate to detail page; for CRM activities: open drawer
        appointmentLink: isAppointment
          ? `/dashboard/gabinet/appointments/${a.moduleRef!.entityId}`
          : null,
        ownerId: a.ownerId,
        ownerName: owner?.name ?? owner?.email ?? "?",
        ownerImage: owner?.image ?? null,
      };
    });
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

    const results: { label: string; value: number }[] = [];
    for (const p of products) {
      const dpCount = (await ctx.db
        .query("dealProducts")
        .withIndex("by_product", (q) => q.eq("productId", p._id))
        .collect()).length;
      if (dpCount > 0) {
        results.push({ label: p.name, value: dpCount });
      }
    }

    return results
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

// --- Top Companies (by won deal value) ---
export const getTopCompanies = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const companies = await ctx.db
      .query("companies")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const leads = await ctx.db
      .query("leads")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const companyValues: { label: string; value: number }[] = [];
    for (const company of companies) {
      const companyLeads = leads.filter(
        (l) => l.companyId === company._id && l.status === "won"
      );
      const totalValue = companyLeads.reduce((sum, l) => sum + (l.value ?? 0), 0);
      if (totalValue > 0) {
        companyValues.push({ label: company.name, value: totalValue });
      }
    }

    return companyValues
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  },
});

// --- Weekly Contacts trend (new contacts per day, last 7 days) ---
export const getWeeklyContactsTrend = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const dayNames = ["ni", "po", "wt", "śr", "cz", "pt", "so"];
    const now = new Date();
    const days: { day: string; value: number; _start: number; _end: number }[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const start = d.getTime();
      days.push({ day: dayNames[d.getDay()], value: 0, _start: start, _end: start + 86400000 });
    }

    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const recent = contacts.filter((c) => c.createdAt >= days[0]._start);
    for (const day of days) {
      day.value = recent.filter((c) => c.createdAt >= day._start && c.createdAt < day._end).length;
    }

    return days.map(({ day, value }) => ({ day, value }));
  },
});

// --- Weekly Companies trend (new companies per day, last 7 days) ---
export const getWeeklyCompaniesTrend = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const dayNames = ["ni", "po", "wt", "śr", "cz", "pt", "so"];
    const now = new Date();
    const days: { day: string; value: number; _start: number; _end: number }[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const start = d.getTime();
      days.push({ day: dayNames[d.getDay()], value: 0, _start: start, _end: start + 86400000 });
    }

    const companies = await ctx.db
      .query("companies")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const recent = companies.filter((c) => c.createdAt >= days[0]._start);
    for (const day of days) {
      day.value = recent.filter((c) => c.createdAt >= day._start && c.createdAt < day._end).length;
    }

    return days.map(({ day, value }) => ({ day, value }));
  },
});

// --- Weekly Deals trend (new + won per day, last 7 days) ---
export const getWeeklyDealsTrend = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const dayNames = ["ni", "po", "wt", "śr", "cz", "pt", "so"];
    const now = new Date();
    const days: { day: string; created: number; won: number; _start: number; _end: number }[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const start = d.getTime();
      days.push({ day: dayNames[d.getDay()], created: 0, won: 0, _start: start, _end: start + 86400000 });
    }

    const leads = await ctx.db
      .query("leads")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const recent = leads.filter((l) => l.createdAt >= days[0]._start);
    const recentWon = leads.filter((l) => l.status === "won" && (l.wonAt ?? l.updatedAt) >= days[0]._start);

    for (const day of days) {
      day.created = recent.filter((l) => l.createdAt >= day._start && l.createdAt < day._end).length;
      day.won = recentWon.filter((l) => (l.wonAt ?? l.updatedAt) >= day._start && (l.wonAt ?? l.updatedAt) < day._end).length;
    }

    return days.map(({ day, created, won }) => ({ day, created, won }));
  },
});

// --- Weekly Activities trend (completed vs created per day, last 7 days) ---
export const getWeeklyActivitiesTrend = query({
  args: { organizationId: v.id("organizations"), userId: v.id("users") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const dayNames = ["ni", "po", "wt", "śr", "cz", "pt", "so"];
    const now = new Date();
    const days: { day: string; created: number; completed: number; _start: number; _end: number }[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const start = d.getTime();
      days.push({ day: dayNames[d.getDay()], created: 0, completed: 0, _start: start, _end: start + 86400000 });
    }

    const activities = await ctx.db
      .query("scheduledActivities")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const userActivities = activities.filter((a) => a.ownerId === args.userId);
    const recentCreated = userActivities.filter((a) => a._creationTime >= days[0]._start);
    const recentCompleted = userActivities.filter((a) => a.isCompleted && a.completedAt && a.completedAt >= days[0]._start);

    for (const day of days) {
      day.created = recentCreated.filter((a) => a._creationTime >= day._start && a._creationTime < day._end).length;
      day.completed = recentCompleted.filter((a) => a.completedAt! >= day._start && a.completedAt! < day._end).length;
    }

    return days.map(({ day, created, completed }) => ({ day, created, completed }));
  },
});

// --- Weekly Calls trend (calls per day, last 7 days) ---
export const getWeeklyCallsTrend = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const dayNames = ["ni", "po", "wt", "śr", "cz", "pt", "so"];
    const now = new Date();
    const days: { day: string; value: number; _start: number; _end: number }[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const start = d.getTime();
      days.push({ day: dayNames[d.getDay()], value: 0, _start: start, _end: start + 86400000 });
    }

    const calls = await ctx.db
      .query("calls")
      .withIndex("by_orgAndDate", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const recent = calls.filter((c) => c.callDate >= days[0]._start);
    for (const day of days) {
      day.value = recent.filter((c) => c.callDate >= day._start && c.callDate < day._end).length;
    }

    return days.map(({ day, value }) => ({ day, value }));
  },
});

// --- Top Templates (by email usage) ---
export const getTopTemplates = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const emails = await ctx.db
      .query("emails")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    // Count emails by templateId (emails that used a template)
    const templateCounts = new Map<string, number>();
    for (const email of emails) {
      if (email.templateId) {
        templateCounts.set(
          String(email.templateId),
          (templateCounts.get(String(email.templateId)) ?? 0) + 1
        );
      }
    }

    // Look up template names
    const results: { label: string; value: number }[] = [];
    for (const [templateId, count] of templateCounts) {
      const template = await ctx.db.get(templateId as Id<"emailTemplates">);
      if (template && "name" in template && (template as any).organizationId === args.organizationId) {
        results.push({ label: template.name as string, value: count });
      }
    }

    return results
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  },
});

// --- Form Documents (CRM Documents page) ---
export const getFormDocumentsKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const docs = await ctx.db
      .query("formDocuments")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const signedCount = docs.filter(
      (d) => d.status === "signed" || d.status === "completed",
    ).length;

    return {
      total: docs.length,
      newThisMonth: docs.filter((d) => d.createdAt >= monthStart.getTime()).length,
      pendingSignature: docs.filter((d) => d.status === "pending_signature").length,
      signed: signedCount,
      signRate: docs.length > 0 ? Math.round((signedCount / docs.length) * 100) : 0,
    };
  },
});

export const getFormDocumentsByStatus = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const docs = await ctx.db
      .query("formDocuments")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const STATUS_META: Record<string, { label: string; color: string; order: number }> = {
      draft: { label: "Szkic", color: "bg-slate-400", order: 0 },
      pending_signature: { label: "Do podpisu", color: "bg-amber-500", order: 1 },
      signed: { label: "Podpisane", color: "bg-emerald-500", order: 2 },
      completed: { label: "Zakończone", color: "bg-sky-500", order: 3 },
      expired: { label: "Wygasłe", color: "bg-rose-500", order: 4 },
      voided: { label: "Unieważnione", color: "bg-neutral-500", order: 5 },
    };

    const counts = new Map<string, number>();
    for (const d of docs) {
      counts.set(d.status, (counts.get(d.status) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([status, count]) => {
        const meta = STATUS_META[status] ?? { label: status, color: "bg-muted", order: 99 };
        return { label: meta.label, count, color: meta.color, order: meta.order };
      })
      .sort((a, b) => a.order - b.order)
      .map(({ label, count, color }) => ({ label, count, color }));
  },
});

export const getWeeklyFormDocumentsTrend = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const dayNames = ["ni", "po", "wt", "śr", "cz", "pt", "so"];
    const now = new Date();
    const days: { day: string; value: number; _start: number; _end: number }[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const start = d.getTime();
      days.push({ day: dayNames[d.getDay()], value: 0, _start: start, _end: start + 86400000 });
    }

    const docs = await ctx.db
      .query("formDocuments")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const recent = docs.filter((d) => d.createdAt >= days[0]._start);
    for (const day of days) {
      day.value = recent.filter((d) => d.createdAt >= day._start && d.createdAt < day._end).length;
    }

    return days.map(({ day, value }) => ({ day, value }));
  },
});

export const getTopDocumentCategories = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const CATEGORY_LABELS: Record<string, string> = {
      consent: "Zgoda",
      medical_record: "Karta medyczna",
      prescription: "Recepta",
      referral: "Skierowanie",
      contract: "Umowa",
      invoice: "Faktura",
      protocol: "Protokół",
      intake: "Ankieta",
      custom: "Inne",
    };

    const docs = await ctx.db
      .query("formDocuments")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const templateCounts = new Map<Id<"formTemplates">, number>();
    for (const d of docs) {
      templateCounts.set(d.templateId, (templateCounts.get(d.templateId) ?? 0) + 1);
    }

    const categoryCounts = new Map<string, number>();
    for (const [templateId, count] of templateCounts) {
      const template = await ctx.db.get(templateId);
      if (!template) continue;
      const cat = template.category;
      categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + count);
    }

    return Array.from(categoryCounts.entries())
      .map(([category, count]) => ({
        label: CATEGORY_LABELS[category] ?? category,
        value: count,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  },
});
