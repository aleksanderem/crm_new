// convex/nudges.ts — CRM nudges, Supabase-primary reads
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { createSupabaseDb } from "./_helpers/supabaseDb";

export interface NudgeData {
  message: string;
  messageValues?: Record<string, string | number>;
  severity: "red" | "yellow" | "green";
  icon?: string;
  /** Optional destination URL (pathname + optional query string) that opens
   *  the list of items the nudge refers to. */
  link?: string;
}

async function verify(ctx: any, organizationId: string) {
  await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
    organizationId,
  });
}

// --- Insights nudges ---
export const getInsightsNudges = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verify(ctx, args.organizationId);
    const db = createSupabaseDb();
    const orgId = String(args.organizationId);
    const nudges: NudgeData[] = [];
    const now = Date.now();
    const weekEnd = now + 7 * 24 * 60 * 60 * 1000;

    const [leads, scheduled] = await Promise.all([
      db.query("leads").eq("organizationId", orgId).eq("status", "open").collect(),
      db.query("scheduledActivities").eq("organizationId", orgId).collect(),
    ]);

    const closingThisWeek = (leads as any[]).filter(
      (l) => l.expectedCloseDate && l.expectedCloseDate <= weekEnd,
    );
    if (closingThisWeek.length > 0) {
      nudges.push({
        message: "sidebar.nudges.insights.closingThisWeek",
        messageValues: { count: closingThisWeek.length },
        severity: "red",
        link: "/dashboard/leads?nudge=closing-this-week",
      });
    }

    const overdue = (scheduled as any[]).filter(
      (a) => a.dueDate && a.dueDate < now && !a.isCompleted,
    );
    if (overdue.length > 0) {
      nudges.push({
        message: "sidebar.nudges.insights.overdueActivities",
        messageValues: { count: overdue.length },
        severity: "yellow",
        link: "/dashboard/activities?nudge=overdue",
      });
    }

    return nudges.slice(0, 2);
  },
});

// --- Deals nudges ---
export const getDealsNudges = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verify(ctx, args.organizationId);
    const db = createSupabaseDb();
    const orgId = String(args.organizationId);
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const [leads, activities] = await Promise.all([
      db.query("leads").eq("organizationId", orgId).eq("status", "open").collect(),
      db.query("activities").eq("organizationId", orgId).collect(),
    ]);

    const lastActivityByLead = new Map<string, number>();
    for (const activity of activities as any[]) {
      if (!activity.entityId) continue;
      const previous = lastActivityByLead.get(String(activity.entityId));
      const createdAt = (activity.createdAt as number) ?? 0;
      if (previous === undefined || createdAt > previous) {
        lastActivityByLead.set(String(activity.entityId), createdAt);
      }
    }

    const staleLeads = (leads as any[]).filter((lead) => {
      const lastActivityAt = lastActivityByLead.get(String(lead._id ?? lead.id));
      return lastActivityAt === undefined || lastActivityAt < sevenDaysAgo;
    });

    if (staleLeads.length > 0) {
      return [
        {
          message: "sidebar.nudges.deals.stale",
          messageValues: { count: staleLeads.length },
          severity: "yellow",
          link: "/dashboard/leads?nudge=stale",
        },
      ];
    }
    return [];
  },
});

// --- Contacts nudges ---
export const getContactsNudges = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verify(ctx, args.organizationId);
    const db = createSupabaseDb();
    const orgId = String(args.organizationId);

    const [contacts, relationships] = await Promise.all([
      db.query("contacts").eq("organizationId", orgId).collect(),
      db.query("objectRelationships").eq("organizationId", orgId).collect(),
    ]);

    const contactsWithCompany = new Set(
      (relationships as any[])
        .filter((r) => r.sourceType === "contact" && r.targetType === "company")
        .map((r) => String(r.sourceId)),
    );

    const unlinked = (contacts as any[]).filter(
      (c) => !contactsWithCompany.has(String(c._id ?? c.id)),
    );
    if (unlinked.length > 0) {
      return [
        {
          message: "sidebar.nudges.contacts.unlinkedCompany",
          messageValues: { count: unlinked.length },
          severity: "yellow",
          link: "/dashboard/contacts?nudge=unlinked-company",
        },
      ];
    }
    return [];
  },
});

// --- Inbox nudges ---
export const getInboxNudges = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verify(ctx, args.organizationId);
    const db = createSupabaseDb();
    const twoDaysAgo = Date.now() - 48 * 60 * 60 * 1000;

    const emails = (await db
      .query("emails")
      .eq("organizationId", String(args.organizationId))
      .collect()) as any[];

    const unanswered = emails.filter(
      (e) => e.direction === "inbound" && !e.isRead && (e.sentAt ?? 0) < twoDaysAgo,
    );

    if (unanswered.length > 0) {
      return [
        {
          message: "sidebar.nudges.inbox.unanswered",
          messageValues: { count: unanswered.length },
          severity: "red",
          link: "/dashboard/inbox?nudge=unanswered",
        },
      ];
    }
    return [];
  },
});

// --- Activities nudges (user-specific) ---
export const getActivitiesNudges = action({
  args: { organizationId: v.id("organizations"), userId: v.string() },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verify(ctx, args.organizationId);
    const db = createSupabaseDb();
    const now = Date.now();

    const scheduled = (await db
      .query("scheduledActivities")
      .eq("organizationId", String(args.organizationId))
      .eq("ownerId", args.userId)
      .collect()) as any[];

    const overdue = scheduled.filter(
      (a) => a.dueDate && a.dueDate < now && !a.isCompleted,
    );

    if (overdue.length > 0) {
      const oldest = [...overdue].sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0))[0];
      const daysOld = Math.floor((now - (oldest.dueDate ?? now)) / (24 * 60 * 60 * 1000));
      return [
        {
          message: "sidebar.nudges.activities.overdueOldest",
          messageValues: { count: overdue.length, days: daysOld },
          severity: "red",
          link: "/dashboard/activities?nudge=overdue",
        },
      ];
    }
    return [];
  },
});

// --- Documents nudges ---
export const getDocumentsNudges = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verify(ctx, args.organizationId);
    const db = createSupabaseDb();

    const docs = (await db
      .query("documents")
      .eq("organizationId", String(args.organizationId))
      .collect()) as any[];

    const pending = docs.filter((d) => d.status === "sent");
    if (pending.length > 0) {
      return [
        {
          message: "sidebar.nudges.documents.pendingApproval",
          messageValues: { count: pending.length },
          severity: "yellow",
          link: "/dashboard/documents?nudge=pending-approval",
        },
      ];
    }
    return [];
  },
});

// --- Calendar nudges ---
export const getCalendarNudges = action({
  args: { organizationId: v.id("organizations"), userId: v.string() },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verify(ctx, args.organizationId);
    const db = createSupabaseDb();
    const now = Date.now();
    const yesterdayStart = new Date();
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);

    const scheduled = (await db
      .query("scheduledActivities")
      .eq("organizationId", String(args.organizationId))
      .eq("ownerId", args.userId)
      .collect()) as any[];

    const yesterdayOverdue = scheduled.filter(
      (a) =>
        a.dueDate &&
        a.dueDate >= yesterdayStart.getTime() &&
        a.dueDate < now &&
        !a.isCompleted,
    );

    if (yesterdayOverdue.length > 0) {
      return [
        {
          message: "sidebar.nudges.calendar.yesterdayOverdue",
          messageValues: { count: yesterdayOverdue.length },
          severity: "yellow",
          link: "/dashboard/calendar?nudge=yesterday-overdue",
        },
      ];
    }
    return [];
  },
});

// --- Companies nudges ---
export const getCompaniesNudges = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verify(ctx, args.organizationId);
    const db = createSupabaseDb();
    const orgId = String(args.organizationId);
    const nudges: NudgeData[] = [];

    const [companies, relationships] = await Promise.all([
      db.query("companies").eq("organizationId", orgId).collect(),
      db.query("objectRelationships").eq("organizationId", orgId).collect(),
    ]);

    const companiesWithContacts = new Set(
      (relationships as any[])
        .filter((r) => r.sourceType === "company" && r.targetType === "contact")
        .map((r) => String(r.sourceId)),
    );
    const companiesLinkedFromContacts = new Set(
      (relationships as any[])
        .filter((r) => r.sourceType === "contact" && r.targetType === "company")
        .map((r) => String(r.targetId)),
    );

    const noContacts = (companies as any[]).filter(
      (c) =>
        !companiesWithContacts.has(String(c._id ?? c.id)) &&
        !companiesLinkedFromContacts.has(String(c._id ?? c.id)),
    );
    if (noContacts.length > 0) {
      nudges.push({
        message: "sidebar.nudges.companies.noContacts",
        messageValues: { count: noContacts.length },
        severity: "yellow",
        link: "/dashboard/companies?nudge=no-contacts",
      });
    }

    const noIndustry = (companies as any[]).filter((c) => !c.industry);
    if (noIndustry.length > 3) {
      nudges.push({
        message: "sidebar.nudges.companies.noIndustry",
        messageValues: { count: noIndustry.length },
        severity: "yellow",
        link: "/dashboard/companies?nudge=no-industry",
      });
    }

    return nudges.slice(0, 2);
  },
});

// --- Calls nudges ---
export const getCallsNudges = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verify(ctx, args.organizationId);
    const db = createSupabaseDb();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const calls = (await db
      .query("calls")
      .eq("organizationId", String(args.organizationId))
      .collect()) as any[];

    const todayCalls = calls.filter((c) => (c.callDate ?? 0) >= todayStart.getTime());
    const noOutcome = todayCalls.filter((c) => !c.outcome);

    if (noOutcome.length > 0) {
      return [
        {
          message: "sidebar.nudges.calls.noOutcome",
          messageValues: { count: noOutcome.length },
          severity: "yellow",
          link: "/dashboard/calls?nudge=no-outcome",
        },
      ];
    }
    return [];
  },
});

// --- Products nudges ---
export const getProductsNudges = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verify(ctx, args.organizationId);
    const db = createSupabaseDb();
    const orgId = String(args.organizationId);

    const [products, dealProducts] = await Promise.all([
      db.query("products").eq("organizationId", orgId).collect(),
      // dealProducts doesn't have org column reliably; fetch all
      db.query("dealProducts").collect(),
    ]);

    const usedProductIds = new Set(
      (dealProducts as any[]).map((dp) => String(dp.productId)),
    );
    const unused = (products as any[]).filter((p) => !usedProductIds.has(String(p._id ?? p.id)));

    if (unused.length > 0) {
      return [
        {
          message: "sidebar.nudges.products.unused",
          messageValues: { count: unused.length },
          severity: "yellow",
          link: "/dashboard/products?nudge=unused",
        },
      ];
    }
    return [];
  },
});

// --- Get all CRM nudges ---
export const getAll = action({
  args: { organizationId: v.id("organizations"), userId: v.optional(v.string()) },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verify(ctx, args.organizationId);
    const db = createSupabaseDb();
    const orgId = String(args.organizationId);
    const nudges: NudgeData[] = [];

    const now = Date.now();
    const weekEnd = now + 7 * 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const twoDaysAgo = now - 48 * 60 * 60 * 1000;
    const yesterdayStart = new Date();
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Batch all reads in parallel
    const [
      openLeads,
      scheduled,
      activities,
      contacts,
      relationships,
      emails,
      documentsList,
      companies,
      calls,
      products,
      dealProducts,
    ] = await Promise.all([
      db.query("leads").eq("organizationId", orgId).eq("status", "open").collect(),
      db.query("scheduledActivities").eq("organizationId", orgId).collect(),
      db.query("activities").eq("organizationId", orgId).collect(),
      db.query("contacts").eq("organizationId", orgId).collect(),
      db.query("objectRelationships").eq("organizationId", orgId).collect(),
      db.query("emails").eq("organizationId", orgId).collect(),
      db.query("documents").eq("organizationId", orgId).collect(),
      db.query("companies").eq("organizationId", orgId).collect(),
      db.query("calls").eq("organizationId", orgId).collect(),
      db.query("products").eq("organizationId", orgId).collect(),
      db.query("dealProducts").collect(),
    ]);

    // Insights nudges
    const closingThisWeek = (openLeads as any[]).filter(
      (l) => l.expectedCloseDate && l.expectedCloseDate <= weekEnd,
    );
    if (closingThisWeek.length > 0) {
      nudges.push({
        message: "sidebar.nudges.insights.closingThisWeek",
        messageValues: { count: closingThisWeek.length },
        severity: "red",
        link: "/dashboard/leads?nudge=closing-this-week",
      });
    }
    const overdueActivities = (scheduled as any[]).filter(
      (a) => a.dueDate && a.dueDate < now && !a.isCompleted,
    );
    if (overdueActivities.length > 0) {
      nudges.push({
        message: "sidebar.nudges.insights.overdueActivities",
        messageValues: { count: overdueActivities.length },
        severity: "yellow",
        link: "/dashboard/activities?nudge=overdue",
      });
    }

    // Deals stale
    const lastActivityByLead = new Map<string, number>();
    for (const activity of activities as any[]) {
      if (!activity.entityId) continue;
      const previous = lastActivityByLead.get(String(activity.entityId));
      const createdAt = (activity.createdAt as number) ?? 0;
      if (previous === undefined || createdAt > previous) {
        lastActivityByLead.set(String(activity.entityId), createdAt);
      }
    }
    const staleLeads = (openLeads as any[]).filter((lead) => {
      const lastActivityAt = lastActivityByLead.get(String(lead._id ?? lead.id));
      return lastActivityAt === undefined || lastActivityAt < sevenDaysAgo;
    });
    if (staleLeads.length > 0) {
      nudges.push({
        message: "sidebar.nudges.deals.stale",
        messageValues: { count: staleLeads.length },
        severity: "yellow",
        link: "/dashboard/leads?nudge=stale",
      });
    }

    // Contacts missing company
    const contactsWithCompany = new Set(
      (relationships as any[])
        .filter((r) => r.sourceType === "contact" && r.targetType === "company")
        .map((r) => String(r.sourceId)),
    );
    const unlinkedContacts = (contacts as any[]).filter(
      (c) => !contactsWithCompany.has(String(c._id ?? c.id)),
    );
    if (unlinkedContacts.length > 0) {
      nudges.push({
        message: "sidebar.nudges.contacts.unlinkedCompany",
        messageValues: { count: unlinkedContacts.length },
        severity: "yellow",
        link: "/dashboard/contacts?nudge=unlinked-company",
      });
    }

    // Inbox unanswered
    const unanswered = (emails as any[]).filter(
      (e) => e.direction === "inbound" && !e.isRead && (e.sentAt ?? 0) < twoDaysAgo,
    );
    if (unanswered.length > 0) {
      nudges.push({
        message: "sidebar.nudges.inbox.unanswered",
        messageValues: { count: unanswered.length },
        severity: "red",
        link: "/dashboard/inbox?nudge=unanswered",
      });
    }

    // Documents pending
    const pendingDocs = (documentsList as any[]).filter((d) => d.status === "sent");
    if (pendingDocs.length > 0) {
      nudges.push({
        message: "sidebar.nudges.documents.pendingApproval",
        messageValues: { count: pendingDocs.length },
        severity: "yellow",
        link: "/dashboard/documents?nudge=pending-approval",
      });
    }

    // Companies
    const companiesWithContacts = new Set(
      (relationships as any[])
        .filter((r) => r.sourceType === "company" && r.targetType === "contact")
        .map((r) => String(r.sourceId)),
    );
    const companiesLinkedFromContacts = new Set(
      (relationships as any[])
        .filter((r) => r.sourceType === "contact" && r.targetType === "company")
        .map((r) => String(r.targetId)),
    );
    const noContacts = (companies as any[]).filter(
      (c) =>
        !companiesWithContacts.has(String(c._id ?? c.id)) &&
        !companiesLinkedFromContacts.has(String(c._id ?? c.id)),
    );
    if (noContacts.length > 0) {
      nudges.push({
        message: "sidebar.nudges.companies.noContacts",
        messageValues: { count: noContacts.length },
        severity: "yellow",
        link: "/dashboard/companies?nudge=no-contacts",
      });
    }
    const noIndustry = (companies as any[]).filter((c) => !c.industry);
    if (noIndustry.length > 3) {
      nudges.push({
        message: "sidebar.nudges.companies.noIndustry",
        messageValues: { count: noIndustry.length },
        severity: "yellow",
        link: "/dashboard/companies?nudge=no-industry",
      });
    }

    // Calls no outcome
    const todayCalls = (calls as any[]).filter((c) => (c.callDate ?? 0) >= todayStart.getTime());
    const noOutcome = todayCalls.filter((c) => !c.outcome);
    if (noOutcome.length > 0) {
      nudges.push({
        message: "sidebar.nudges.calls.noOutcome",
        messageValues: { count: noOutcome.length },
        severity: "yellow",
        link: "/dashboard/calls?nudge=no-outcome",
      });
    }

    // Products unused
    const usedProductIds = new Set(
      (dealProducts as any[]).map((dp) => String(dp.productId)),
    );
    const unusedProducts = (products as any[]).filter(
      (p) => !usedProductIds.has(String(p._id ?? p.id)),
    );
    if (unusedProducts.length > 0) {
      nudges.push({
        message: "sidebar.nudges.products.unused",
        messageValues: { count: unusedProducts.length },
        severity: "yellow",
        link: "/dashboard/products?nudge=unused",
      });
    }

    // User-specific nudges
    if (args.userId) {
      const userScheduled = (scheduled as any[]).filter(
        (a) => String(a.ownerId) === args.userId,
      );
      const overdue = userScheduled.filter(
        (a) => a.dueDate && a.dueDate < now && !a.isCompleted,
      );
      if (overdue.length > 0) {
        const oldest = [...overdue].sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0))[0];
        const daysOld = Math.floor((now - (oldest.dueDate ?? now)) / (24 * 60 * 60 * 1000));
        nudges.push({
          message: "sidebar.nudges.activities.overdueOldest",
          messageValues: { count: overdue.length, days: daysOld },
          severity: "red",
          link: "/dashboard/activities?nudge=overdue",
        });
      }
      const yesterdayOverdue = userScheduled.filter(
        (a) =>
          a.dueDate &&
          a.dueDate >= yesterdayStart.getTime() &&
          a.dueDate < now &&
          !a.isCompleted,
      );
      if (yesterdayOverdue.length > 0) {
        nudges.push({
          message: "sidebar.nudges.calendar.yesterdayOverdue",
          messageValues: { count: yesterdayOverdue.length },
          severity: "yellow",
          link: "/dashboard/calendar?nudge=yesterday-overdue",
        });
      }
    }

    // Sort by severity (red > yellow > green) and limit to 10
    const severityOrder = { red: 0, yellow: 1, green: 2 };
    nudges.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
    return nudges.slice(0, 10);
  },
});
