// convex/nudges.ts
import { query } from "./_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";

export interface NudgeData {
  message: string;
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
        message: `${closingThisWeek.length} deali do zamkniecia w tym tygodniu`,
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
        message: `${overdue.length} zaleglych aktywnosci`,
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

    const staleLeads = [];
    for (const lead of leads) {
      // activities table is an activity LOG — filter by entityId matching lead
      const leadActivities = activities.filter((a) => a.entityId === String(lead._id));
      const lastActivity = leadActivities.sort((a, b) => b.createdAt - a.createdAt)[0];
      if (!lastActivity || lastActivity.createdAt < sevenDaysAgo) {
        staleLeads.push(lead);
      }
    }

    if (staleLeads.length > 0) {
      return [{
        message: `${staleLeads.length} dealow bez aktywnosci >7 dni`,
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
        message: `${unlinked.length} kontaktow bez przypisanej firmy`,
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
        message: `${unanswered.length} maili bez odpowiedzi >48h`,
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
        message: `${overdue.length} aktywnosci po terminie — najstarsza ${daysOld} dni temu`,
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

    const pending = docs.filter((d) => d.status === "pending_signature");
    if (pending.length > 0) {
      return [{
        message: `${pending.length} dokumentow oczekuje na podpis klienta`,
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
        message: `${yesterdayOverdue.length} zaleglych aktywnosci z wczoraj`,
        severity: "yellow",
      }];
    }
    return [];
  },
});
