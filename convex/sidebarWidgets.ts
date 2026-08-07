// convex/sidebarWidgets.ts
import { query } from "./_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";

// --- Insights (Dashboard) ---
// Stub — real source is useSupabaseInsightsKpis (src/hooks/use-supabase-sidebar-widgets.ts).
export const getInsightsKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return {
      revenue: 0,
      revenueTrend: 0,
      pipelineValue: 0,
      openDeals: 0,
      totalContacts: 0,
      totalCompanies: 0,
      winRate: 0,
    };
  },
});

// --- Deals ---
// Stub — real source is useSupabaseDealsKpis (src/hooks/use-supabase-sidebar-widgets.ts).
export const getDealsKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return { openCount: 0, pipelineValue: 0, winRate: 0 };
  },
});

// --- Weekly CRM trend (contacts + deals created per day, last 7 days) ---
// Stub — real source is useSupabaseWeeklyCrmTrend (src/hooks/use-supabase-sidebar-widgets.ts).
export const getWeeklyCrmTrend = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<Array<{ day: string; contacts: number; deals: number }>> => {
    await verifyOrgAccess(ctx, args.organizationId);
    return [];
  },
});

// --- Contacts ---
// Stub — real source is useSupabaseContactsKpis (src/hooks/use-supabase-sidebar-widgets.ts).
export const getContactsKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return { total: 0, newThisWeek: 0 };
  },
});

// --- Companies ---
// Stub — real source is useSupabaseCompaniesKpis (src/hooks/use-supabase-sidebar-widgets.ts).
export const getCompaniesKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return { total: 0, newThisMonth: 0, totalRevenue: 0 };
  },
});

// --- Activities ---
// Removed: getActivitiesKpis — migrated to Supabase hook (see use-supabase-scheduled-activities.ts).

// --- Inbox ---
// Stub — real source is useSupabaseInboxKpis (src/hooks/use-supabase-sidebar-widgets.ts).
export const getInboxKpis = query({
  args: { organizationId: v.id("organizations"), userId: v.id("users") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    void args.userId;
    return { unread: 0, todayReceived: 0 };
  },
});

// --- Calls ---
// Stub — real source is useSupabaseCallsKpis (src/hooks/use-supabase-sidebar-widgets.ts).
export const getCallsKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return { todayCount: 0, answerRate: 0, avgDurationSec: 0 };
  },
});

// --- Products ---
// Stub — real source is useSupabaseProductsKpis (src/hooks/use-supabase-sidebar-widgets.ts).
export const getProductsKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return { total: 0, inDeals: 0, topSeller: "", topSellerCount: 0 };
  },
});

// --- Calendar (CRM) ---
// Stub to keep old frontend bundles working while a rolling deploy finishes.
// The real widget logic now lives in useSupabaseCalendarKpis. Safe to delete
// once the frontend everywhere is on the Supabase hook.
export const getCalendarKpis = query({
  args: { organizationId: v.id("organizations"), userId: v.id("users") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    void args.userId;
    return { today: 0, overdue: 0, thisWeek: 0, requiresCompletion: 0 };
  },
});

// --- Upcoming Events (Smart Agenda) ---
// Stub for the same rolling-deploy reason — real source is
// useSupabaseUpcomingEvents. Returns [] so the old frontend just renders
// an empty agenda instead of hard-erroring.
export const getUpcomingEvents = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    onlyMine: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Array<{
    id: string;
    title: string;
    startTime: number;
    type: string;
    appointmentLink: string | null;
    ownerId: string;
    ownerName: string;
    ownerImage: string | null;
  }>> => {
    await verifyOrgAccess(ctx, args.organizationId);
    void args.userId;
    void args.onlyMine;
    void args.limit;
    return [];
  },
});

// --- Activities KPIs (stub) ---
export const getActivitiesKpis = query({
  args: { organizationId: v.id("organizations"), userId: v.id("users") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    void args.userId;
    return { overdue: 0, today: 0, completionRate: 0 };
  },
});

// --- Weekly Activities Trend (stub) ---
export const getWeeklyActivitiesTrend = query({
  args: { organizationId: v.id("organizations"), userId: v.id("users") },
  handler: async (ctx, args): Promise<Array<{ day: string; created: number; completed: number }>> => {
    await verifyOrgAccess(ctx, args.organizationId);
    void args.userId;
    return [];
  },
});

// --- Leads by Stage (Mini Funnel) ---
// Stub — real source is useSupabaseLeadsByStage (src/hooks/use-supabase-sidebar-widgets.ts).
export const getLeadsByStage = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<Array<{ label: string; count: number; color: string }>> => {
    await verifyOrgAccess(ctx, args.organizationId);
    return [];
  },
});

// --- Contacts by Source (Source Bar) ---
// Stub — real source is useSupabaseContactsBySource (src/hooks/use-supabase-sidebar-widgets.ts).
export const getContactsBySource = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<Array<{ label: string; count: number; pct: number; color: string }>> => {
    await verifyOrgAccess(ctx, args.organizationId);
    return [];
  },
});

// --- Top Products (Bar Ranking) ---
// Stub — real source is useSupabaseTopProducts (src/hooks/use-supabase-sidebar-widgets.ts).
export const getTopProducts = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<Array<{ label: string; value: number }>> => {
    await verifyOrgAccess(ctx, args.organizationId);
    return [];
  },
});

// --- Email Templates ---
// Stub — email-templates-widgets.tsx already uses Supabase hooks directly.
export const getEmailTemplatesKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return { totalTemplates: 0, usagesThisMonth: 0, topTemplateName: "" };
  },
});

// --- Top Companies (by won deal value) ---
// Stub — real source is useSupabaseTopCompanies (src/hooks/use-supabase-sidebar-widgets.ts).
export const getTopCompanies = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<Array<{ label: string; value: number }>> => {
    await verifyOrgAccess(ctx, args.organizationId);
    return [];
  },
});

// --- Weekly Contacts trend (new contacts per day, last 7 days) ---
// Stub — real source is useSupabaseWeeklyContactsTrend (src/hooks/use-supabase-sidebar-widgets.ts).
export const getWeeklyContactsTrend = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<Array<{ day: string; value: number }>> => {
    await verifyOrgAccess(ctx, args.organizationId);
    return [];
  },
});

// --- Weekly Companies trend (new companies per day, last 7 days) ---
// Stub — real source is useSupabaseWeeklyCompaniesTrend (src/hooks/use-supabase-sidebar-widgets.ts).
export const getWeeklyCompaniesTrend = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<Array<{ day: string; value: number }>> => {
    await verifyOrgAccess(ctx, args.organizationId);
    return [];
  },
});

// --- Weekly Deals trend (new + won per day, last 7 days) ---
// Stub — real source is useSupabaseWeeklyDealsTrend (src/hooks/use-supabase-sidebar-widgets.ts).
export const getWeeklyDealsTrend = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<Array<{ day: string; created: number; won: number }>> => {
    await verifyOrgAccess(ctx, args.organizationId);
    return [];
  },
});

// --- Weekly Activities trend (completed vs created per day, last 7 days) ---
// Removed: getWeeklyActivitiesTrend — migrated to Supabase hook (see use-supabase-scheduled-activities.ts).

// --- Weekly Calls trend (calls per day, last 7 days) ---
// Stub — real source is useSupabaseWeeklyCallsTrend (src/hooks/use-supabase-sidebar-widgets.ts).
export const getWeeklyCallsTrend = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<Array<{ day: string; value: number }>> => {
    await verifyOrgAccess(ctx, args.organizationId);
    return [];
  },
});

// --- Top Templates (by email usage) ---
// Stub — email-templates-widgets.tsx derives this from Supabase hooks directly.
export const getTopTemplates = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<Array<{ label: string; value: number }>> => {
    await verifyOrgAccess(ctx, args.organizationId);
    return [];
  },
});

// --- Form Documents (CRM Documents page) ---
// Stub — real source is useSupabaseFormDocumentsKpis (src/hooks/use-supabase-sidebar-widgets.ts).
export const getFormDocumentsKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return { total: 0, newThisMonth: 0, pendingSignature: 0, signed: 0, signRate: 0 };
  },
});

// Stub — real source is useSupabaseFormDocumentsByStatus (src/hooks/use-supabase-sidebar-widgets.ts).
export const getFormDocumentsByStatus = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<Array<{ label: string; count: number; color: string }>> => {
    await verifyOrgAccess(ctx, args.organizationId);
    return [];
  },
});

// Stub — real source is useSupabaseWeeklyFormDocumentsTrend (src/hooks/use-supabase-sidebar-widgets.ts).
export const getWeeklyFormDocumentsTrend = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<Array<{ day: string; value: number }>> => {
    await verifyOrgAccess(ctx, args.organizationId);
    return [];
  },
});

// Stub — real source is useSupabaseTopDocumentCategories (src/hooks/use-supabase-sidebar-widgets.ts).
export const getTopDocumentCategories = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<Array<{ label: string; value: number }>> => {
    await verifyOrgAccess(ctx, args.organizationId);
    return [];
  },
});
