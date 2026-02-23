import { query } from "./_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";

// --- Helpers ---

const timeRangeValidator = v.union(
  v.literal("today"),
  v.literal("last7days"),
  v.literal("last30days"),
  v.literal("thisMonth"),
  v.literal("last3months"),
  v.literal("thisYear"),
  v.literal("all")
);

function rangeStart(range: string): number {
  const now = Date.now();
  switch (range) {
    case "today": {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    case "last7days":
      return now - 7 * 24 * 60 * 60 * 1000;
    case "last30days":
      return now - 30 * 24 * 60 * 60 * 1000;
    case "thisMonth": {
      const d = new Date();
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    case "last3months":
      return now - 90 * 24 * 60 * 60 * 1000;
    case "thisYear": {
      const d = new Date();
      d.setMonth(0, 1);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    default:
      return 0;
  }
}

function bucketByDay(timestamps: number[]): { label: string; value: number }[] {
  const map = new Map<string, number>();
  for (const ts of timestamps) {
    const d = new Date(ts);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, val]) => {
      const parts = k.split("-");
      return { label: `${parseInt(parts[1])}/${parseInt(parts[2])}`, value: val };
    });
}

function bucketByMonth(
  entries: { ts: number; amount: number }[]
): { label: string; value: number }[] {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const map = new Map<string, number>();
  for (const { ts, amount } of entries) {
    const d = new Date(ts);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    map.set(key, (map.get(key) ?? 0) + amount);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, val]) => {
      const [y, m] = k.split("-");
      return { label: `${months[parseInt(m) - 1]} '${y.slice(2)}`, value: val };
    });
}

function bucketByField(
  items: { field: string }[]
): { label: string; value: number }[] {
  const map = new Map<string, number>();
  for (const { field } of items) {
    const key = field || "Unknown";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));
}

// --- KPI Stats ---

export const getStats = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const [contacts, companies, allLeads] = await Promise.all([
      ctx.db
        .query("contacts")
        .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
        .collect(),
      ctx.db
        .query("companies")
        .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
        .collect(),
      ctx.db
        .query("leads")
        .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
        .collect(),
    ]);

    const openLeads = allLeads.filter((l) => l.status === "open");
    const wonLeads = allLeads.filter((l) => l.status === "won");
    const lostLeads = allLeads.filter((l) => l.status === "lost");

    const pipelineValue = openLeads.reduce((sum, l) => sum + (l.value ?? 0), 0);
    const wonValue = wonLeads.reduce((sum, l) => sum + (l.value ?? 0), 0);
    const closedCount = wonLeads.length + lostLeads.length;
    const winRate = closedCount > 0 ? wonLeads.length / closedCount : 0;

    return {
      totalContacts: contacts.length,
      totalCompanies: companies.length,
      totalLeads: allLeads.length,
      openLeads: openLeads.length,
      wonLeads: wonLeads.length,
      lostLeads: lostLeads.length,
      pipelineValue,
      wonValue,
      winRate,
    };
  },
});

// --- Pipeline Stage Breakdown ---

export const getLeadsByStage = query({
  args: {
    organizationId: v.id("organizations"),
    pipelineId: v.id("pipelines"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const stages = await ctx.db
      .query("pipelineStages")
      .withIndex("by_pipeline", (q) => q.eq("pipelineId", args.pipelineId))
      .collect();

    return await Promise.all(
      stages.map(async (stage) => {
        const leads = await ctx.db
          .query("leads")
          .withIndex("by_pipelineStage", (q) =>
            q.eq("pipelineStageId", stage._id)
          )
          .collect();

        const totalValue = leads.reduce((sum, l) => sum + (l.value ?? 0), 0);

        return {
          stageId: stage._id,
          stageName: stage.name,
          stageColor: stage.color,
          order: stage.order,
          count: leads.length,
          totalValue,
        };
      })
    );
  },
});

// --- Won Deals by Day ---

export const getWonDealsByDay = query({
  args: {
    organizationId: v.id("organizations"),
    timeRange: timeRangeValidator,
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const start = rangeStart(args.timeRange);
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_orgAndStatus", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "won")
      )
      .collect();
    const filtered = leads.filter((l) => (l.wonAt ?? l.updatedAt) >= start);
    return bucketByDay(filtered.map((l) => l.wonAt ?? l.updatedAt));
  },
});

// --- Revenue by Month ---

export const getRevenueByMonth = query({
  args: {
    organizationId: v.id("organizations"),
    timeRange: timeRangeValidator,
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const start = rangeStart(args.timeRange);
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_orgAndStatus", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "won")
      )
      .collect();
    const filtered = leads.filter((l) => (l.wonAt ?? l.updatedAt) >= start);
    return bucketByMonth(
      filtered.map((l) => ({
        ts: l.wonAt ?? l.updatedAt,
        amount: l.value ?? 0,
      }))
    );
  },
});

// --- Contacts by Day ---

export const getContactsByDay = query({
  args: {
    organizationId: v.id("organizations"),
    timeRange: timeRangeValidator,
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const start = rangeStart(args.timeRange);
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    return bucketByDay(
      contacts.filter((c) => c.createdAt >= start).map((c) => c.createdAt)
    );
  },
});

// --- Contacts by Source ---

export const getContactsBySource = query({
  args: {
    organizationId: v.id("organizations"),
    timeRange: timeRangeValidator,
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const start = rangeStart(args.timeRange);
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    return bucketByField(
      contacts
        .filter((c) => c.createdAt >= start)
        .map((c) => ({ field: c.source ?? "" }))
    );
  },
});

// --- Companies by Day ---

export const getCompaniesByDay = query({
  args: {
    organizationId: v.id("organizations"),
    timeRange: timeRangeValidator,
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const start = rangeStart(args.timeRange);
    const companies = await ctx.db
      .query("companies")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    return bucketByDay(
      companies.filter((c) => c.createdAt >= start).map((c) => c.createdAt)
    );
  },
});

// --- Companies by Industry ---

export const getCompaniesByIndustry = query({
  args: {
    organizationId: v.id("organizations"),
    timeRange: timeRangeValidator,
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const start = rangeStart(args.timeRange);
    const companies = await ctx.db
      .query("companies")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    return bucketByField(
      companies
        .filter((c) => c.createdAt >= start)
        .map((c) => ({ field: c.industry ?? "" }))
    );
  },
});

// --- Calls by Day ---

export const getCallsByDay = query({
  args: {
    organizationId: v.id("organizations"),
    timeRange: timeRangeValidator,
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const start = rangeStart(args.timeRange);
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    return bucketByDay(
      calls.filter((c) => c.callDate >= start).map((c) => c.callDate)
    );
  },
});

// --- Call Outcome Overview ---

export const getCallOutcomeOverview = query({
  args: {
    organizationId: v.id("organizations"),
    timeRange: timeRangeValidator,
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const start = rangeStart(args.timeRange);
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    return bucketByField(
      calls
        .filter((c) => c.callDate >= start)
        .map((c) => ({ field: c.outcome }))
    );
  },
});

// --- Top Performers ---

export const getTopPerformers = query({
  args: {
    organizationId: v.id("organizations"),
    timeRange: timeRangeValidator,
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const start = rangeStart(args.timeRange);
    const wonLeads = await ctx.db
      .query("leads")
      .withIndex("by_orgAndStatus", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "won")
      )
      .collect();
    const filtered = wonLeads.filter(
      (l) => (l.wonAt ?? l.updatedAt) >= start && l.assignedTo != null
    );

    const byAssignee: Record<
      string,
      { assignedTo: (typeof filtered)[0]["assignedTo"]; deals: number; value: number }
    > = {};
    for (const l of filtered) {
      const key = String(l.assignedTo);
      if (!byAssignee[key]) {
        byAssignee[key] = { assignedTo: l.assignedTo, deals: 0, value: 0 };
      }
      byAssignee[key].deals++;
      byAssignee[key].value += l.value ?? 0;
    }

    const results = await Promise.all(
      Object.values(byAssignee).map(async (entry) => {
        const user = entry.assignedTo
          ? await ctx.db.get(entry.assignedTo)
          : null;
        return {
          name: user?.name ?? "Unknown",
          deals: entry.deals,
          value: entry.value,
        };
      })
    );

    return results.sort((a, b) => b.value - a.value);
  },
});

// --- Upcoming Activities ---

export const getUpcomingActivities = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();
    const weekFromNow = now + 7 * 24 * 60 * 60 * 1000;

    const activities = await ctx.db
      .query("scheduledActivities")
      .withIndex("by_orgAndCompleted", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("isCompleted", false)
      )
      .collect();

    const upcoming = activities
      .filter((a) => a.dueDate <= weekFromNow)
      .sort((a, b) => a.dueDate - b.dueDate)
      .slice(0, 10);

    return Promise.all(
      upcoming.map(async (a) => {
        const owner = await ctx.db.get(a.ownerId);
        return {
          _id: a._id,
          title: a.title,
          activityType: a.activityType,
          dueDate: a.dueDate,
          isCompleted: a.isCompleted,
          ownerName: owner?.name ?? "Unknown",
        };
      })
    );
  },
});
