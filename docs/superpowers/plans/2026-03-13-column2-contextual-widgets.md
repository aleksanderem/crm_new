# Column 2 Contextual Widgets — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add contextual KPI widgets, nudges, unique visualizations, smart agenda, recent items, and day agenda takeover to the Column 2 sidebar panel across all 19 CRM + Gabinet tabs.

**Architecture:** Extend the existing `PageContext` interface with a `widgets` renderer per tab. Each tab gets a composed widget stack (KPI Row → Unique Widget → Nudge → Quick Actions → Recent Items → Smart Agenda) powered by per-tab Convex queries. Reusable widget primitives live in `src/components/sidebar-widgets/`. Backend queries are split per-tab for Convex reactive performance.

**Tech Stack:** Convex (queries/mutations), React 19, TanStack Router, shadcn/ui, Tailwind CSS v4, i18next, Recharts (bar charts)

**Spec:** `docs/superpowers/specs/2026-03-13-column2-contextual-widgets-design.md`

**Critical schema notes for implementers:**
- `gabinetAppointments`: uses `date: v.string()` (YYYY-MM-DD) + `startTime: v.string()` (HH:MM), NOT numeric timestamps. Filter by comparing the `date` string field. `employeeId` is `v.id("users")` (linked to users table, not gabinetEmployees).
- `gabinetLeaves`: uses `startDate: v.string()` + `endDate: v.string()` (YYYY-MM-DD), NOT numeric timestamps. Compare with today's date as YYYY-MM-DD string.
- `activities` table: this is an activity LOG (entityType, entityId, action, description, performedBy). It has NO `dueDate`, `assignedTo`, or `completedAt`.
- `scheduledActivities` table: this is for calendar events/tasks. Uses `dueDate: v.number()` (unix ts), `ownerId` (NOT `assignedTo`), `isCompleted: v.boolean()`, `completedAt`, `activityType`, `title`.
- i18n files live at `public/locales/pl/translation.json` and `public/locales/en/translation.json`.
- Task 1 (schema push) MUST complete before Tasks 5+ can use new indexes (`by_template` on emails).
- `NudgeData` interface is exported from `convex/nudges.ts` (Task 6). Task 10 depends on it.

---

## Chunk 1: Foundation

### Task 1: Schema Prerequisites

**Files:**
- Modify: `convex/schema.ts`
- Test: `convex/tests/schemaPrereqs.test.ts`

- [ ] **Step 1: Add `recentlyViewed` table to schema**

In `convex/schema.ts`, add after the last table definition (before the closing of `defineSchema`):

```typescript
recentlyViewed: defineTable({
  organizationId: v.id("organizations"),
  userId: v.id("users"),
  entityType: v.string(),
  entityId: v.string(),
  entityLabel: v.string(),
  viewedAt: v.number(),
})
  .index("by_user_type", ["organizationId", "userId", "entityType", "viewedAt"])
  .index("by_entity", ["entityId"]),
```

- [ ] **Step 2: Add `templateId` field to `emails` table**

In the `emails` table definition, add after `sentBy`:

```typescript
templateId: v.optional(v.id("emailTemplates")),
```

Add index after existing indexes:

```typescript
.index("by_template", ["organizationId", "templateId"])
```

- [ ] **Step 3: Add `duration` field to `calls` table**

In the `calls` table definition, add after `note`:

```typescript
duration: v.optional(v.number()),
```

- [ ] **Step 4: Verify schema compiles**

Run: `cd /Users/alfred/.openclaw/workspace/projects/crm_new && npx convex dev --once --typecheck disable`
Expected: Schema pushes without errors. If running against dev deployment, verify with `npx convex convex-test` instead.

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: add schema prereqs for sidebar widgets (recentlyViewed, emails.templateId, calls.duration)"
```

---

### Task 2: Extend SidebarSlotContext with dayAgendaDate and Route Cleanup

**Files:**
- Modify: `src/components/layout/sidebar-slot-context.tsx`

- [ ] **Step 1: Add `dayAgendaDate` state and route-change cleanup**

Replace the entire file with:

```typescript
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";

interface SidebarSlotContextValue {
  content: ReactNode | null;
  setContent: (node: ReactNode | null) => void;
  wideContent: boolean;
  setWideContent: (wide: boolean) => void;
  dayAgendaDate: string | null;
  setDayAgendaDate: (d: string | null) => void;
}

const SidebarSlotContext = createContext<SidebarSlotContextValue>({
  content: null,
  setContent: () => {},
  wideContent: false,
  setWideContent: () => {},
  dayAgendaDate: null,
  setDayAgendaDate: () => {},
});

export function SidebarSlotProvider({ children }: { children: ReactNode }) {
  const [content, setContentState] = useState<ReactNode | null>(null);
  const [wideContent, setWideContentState] = useState(false);
  const [dayAgendaDate, setDayAgendaDateState] = useState<string | null>(null);
  const location = useLocation();

  const setContent = useCallback((node: ReactNode | null) => {
    setContentState(node);
  }, []);

  const setWideContent = useCallback((wide: boolean) => {
    setWideContentState(wide);
  }, []);

  const setDayAgendaDate = useCallback((d: string | null) => {
    setDayAgendaDateState(d);
  }, []);

  // Clear slot content and day agenda on route change
  useEffect(() => {
    setContentState(null);
    setDayAgendaDateState(null);
  }, [location.pathname]);

  return (
    <SidebarSlotContext.Provider
      value={{ content, setContent, wideContent, setWideContent, dayAgendaDate, setDayAgendaDate }}
    >
      {children}
    </SidebarSlotContext.Provider>
  );
}

export const useSidebarSlot = () => useContext(SidebarSlotContext);
```

- [ ] **Step 2: Verify existing sidebar slot behavior still works**

Run: `cd /Users/alfred/.openclaw/workspace/projects/crm_new && npx tsc --noEmit`
Expected: No type errors. The existing `useSidebarSlot()` consumers only destructure `content`/`setContent`/`wideContent`/`setWideContent`, so new fields are additive.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/sidebar-slot-context.tsx
git commit -m "feat: extend SidebarSlotContext with dayAgendaDate and route-change cleanup"
```

---

### Task 3: Reusable Widget Primitives — KpiRow and NudgeCard

**Files:**
- Create: `src/components/sidebar-widgets/kpi-row.tsx`
- Create: `src/components/sidebar-widgets/nudge-card.tsx`
- Create: `src/components/sidebar-widgets/index.ts`

- [ ] **Step 1: Create KpiRow component**

```typescript
// src/components/sidebar-widgets/kpi-row.tsx
import { cn } from "@/utils/misc";

export interface KpiItem {
  label: string;
  value: string | number;
  trend?: { value: number; positive: boolean };
  color?: string; // tailwind text color class, e.g. "text-emerald-500"
}

interface KpiRowProps {
  items: KpiItem[];
  size?: "default" | "hero";
}

export function KpiRow({ items, size = "default" }: KpiRowProps) {
  return (
    <div
      className={cn(
        "grid gap-1.5",
        items.length === 2 && "grid-cols-2",
        items.length >= 3 && "grid-cols-3"
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="bg-muted/50 flex flex-col items-center rounded-md px-1.5 py-2 text-center"
        >
          <span
            className={cn(
              "font-bold tabular-nums",
              size === "hero" ? "text-lg" : "text-sm",
              item.color ?? "text-foreground"
            )}
          >
            {typeof item.value === "number" ? item.value.toLocaleString("pl-PL") : item.value}
          </span>
          <span className="text-muted-foreground text-[10px] leading-tight">{item.label}</span>
          {item.trend && (
            <span
              className={cn(
                "text-[9px] font-medium",
                item.trend.positive ? "text-emerald-500" : "text-red-500"
              )}
            >
              {item.trend.positive ? "↑" : "↓"}
              {Math.abs(item.trend.value)}%
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create NudgeCard component**

```typescript
// src/components/sidebar-widgets/nudge-card.tsx
import { cn } from "@/utils/misc";

type NudgeSeverity = "red" | "yellow" | "green";

interface NudgeCardProps {
  message: string;
  severity: NudgeSeverity;
  icon?: string;
}

const severityStyles: Record<NudgeSeverity, string> = {
  red: "bg-red-500/10 border-red-500/30 text-red-500",
  yellow: "bg-amber-500/10 border-amber-500/30 text-amber-500",
  green: "bg-emerald-500/10 border-emerald-500/30 text-emerald-500",
};

export function NudgeCard({ message, severity, icon }: NudgeCardProps) {
  return (
    <div className={cn("rounded-md border px-2.5 py-1.5 text-xs", severityStyles[severity])}>
      {icon && <span className="mr-1">{icon}</span>}
      {message}
    </div>
  );
}
```

- [ ] **Step 3: Create barrel export**

```typescript
// src/components/sidebar-widgets/index.ts
export { KpiRow, type KpiItem } from "./kpi-row";
export { NudgeCard } from "./nudge-card";
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar-widgets/
git commit -m "feat: add KpiRow and NudgeCard sidebar widget primitives"
```

---

### Task 4: Widget Rendering in app-sidebar.tsx

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx`

This task extends the `PageContext` interface and adds widget rendering between the title and quick actions in Column 2.

- [ ] **Step 1: Extend PageContext interface**

In `app-sidebar.tsx`, modify the `PageContext` interface (around line 85):

```typescript
interface PageContext {
  titleKey: string;
  actions: ContextAction[];
  widgets?: React.ComponentType<{ organizationId: string }>;
}
```

The `widgets` field is a React component that receives `organizationId` and renders the full widget stack for that tab (KPIs + unique widget + nudges). Each tab will provide its own composed component.

- [ ] **Step 2: Render widget component in Column 2**

In the Column 2 rendering section (the `else` branch after `sidebarSlotContent` check), add the day agenda priority check and widget rendering. Find the section that renders `pageContext && (` for the title (around line 738). Before the title rendering, add the day agenda check. After the title, add widget rendering:

```tsx
{/* Day Agenda Takeover — highest priority after sidebarSlotContent */}
{dayAgendaDate ? (
  <div className="flex-1 overflow-y-auto px-3 pb-4">
    {/* DayTimeline component will be added in Phase 3 */}
    <div className="text-muted-foreground text-sm px-1">
      Agenda: {dayAgendaDate}
    </div>
  </div>
) : (
  <>
    {/* Context title when on entity page */}
    {pageContext && (
      <div className="px-4 pb-1 text-lg font-semibold">
        {t(pageContext.titleKey)}
      </div>
    )}

    {/* Widget stack */}
    {pageContext?.widgets && organizationId && (
      <div className="flex flex-col gap-2 px-3 pb-2">
        <pageContext.widgets organizationId={organizationId} />
      </div>
    )}

    {/* Contextual actions section — existing code unchanged */}
    {pageContext && (
      <div className="mt-3 flex flex-col px-4">
        {/* ... existing action grid ... */}
      </div>
    )}
  </>
)}
```

Note: `dayAgendaDate` comes from `useSidebarSlot()` which is already destructured in the component. `organizationId` comes from `useOrganization()` — verify this hook is already imported and called in AppSidebar; if not, add it.

- [ ] **Step 3: Destructure dayAgendaDate from useSidebarSlot**

In the AppSidebar component, find where `useSidebarSlot` is called and add `dayAgendaDate`:

```typescript
const { content: sidebarSlotContent, wideContent, dayAgendaDate } = useSidebarSlot();
```

- [ ] **Step 4: Get organizationId for widget props**

Check if `useOrganization()` is already called in AppSidebar. If not, add:

```typescript
import { useOrganization } from "@/components/org-context";
// Inside component:
const { organization } = useOrganization();
const organizationId = organization?._id;
```

- [ ] **Step 5: Verify types compile and app renders**

Run: `npx tsc --noEmit`
Expected: PASS. The `widgets` field is optional, so all existing pageContexts continue to work without it.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/app-sidebar.tsx
git commit -m "feat: add widget rendering slot to Column 2 with dayAgenda priority"
```

---

## Chunk 2: CRM Backend Queries + Per-Tab Widgets

### Task 5: CRM Sidebar Widget Queries

**Files:**
- Create: `convex/sidebarWidgets.ts` (NEW file)
- Test: `convex/tests/sidebarWidgets.test.ts`

These are lightweight queries optimized for the 260px sidebar. Each returns just enough data for the widget.

- [ ] **Step 1: Create CRM sidebar widget queries file**

```typescript
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
    const answered = todayCalls.filter((c) => c.outcome === "answered" || c.outcome === "callback");
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
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    // Count unique products in active deals
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

    // Count template usage from emails this month
    const emails = await ctx.db
      .query("emails")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const thisMonthEmails = emails.filter(
      (e) => e.templateId != null && e.createdAt >= monthStart.getTime()
    );

    // Find most used template
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
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add convex/sidebarWidgets.ts
git commit -m "feat: add CRM sidebar widget KPI queries"
```

---

### Task 6: CRM Nudge Queries

**Files:**
- Create: `convex/nudges.ts`

- [ ] **Step 1: Create per-tab CRM nudge queries**

```typescript
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

    // Get last activity per lead
    const staleLeads = [];
    for (const lead of leads) {
      const activities = await ctx.db
        .query("activities")
        .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
        .collect();
      const leadActivities = activities.filter((a) => a.leadId === lead._id);
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

    const unlinked = contacts.filter((c) => !c.companyId);
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
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add convex/nudges.ts
git commit -m "feat: add per-tab CRM nudge queries"
```

---

### Task 7: CRM Per-Tab Widget Components

**Files:**
- Create: `src/components/sidebar-widgets/crm/insights-widgets.tsx`
- Create: `src/components/sidebar-widgets/crm/deals-widgets.tsx`
- Create: `src/components/sidebar-widgets/crm/contacts-widgets.tsx`
- Create: `src/components/sidebar-widgets/crm/companies-widgets.tsx`
- Create: `src/components/sidebar-widgets/crm/activities-widgets.tsx`
- Create: `src/components/sidebar-widgets/crm/calendar-widgets.tsx`
- Create: `src/components/sidebar-widgets/crm/inbox-widgets.tsx`
- Create: `src/components/sidebar-widgets/crm/email-templates-widgets.tsx`
- Create: `src/components/sidebar-widgets/crm/products-widgets.tsx`
- Create: `src/components/sidebar-widgets/crm/documents-widgets.tsx`
- Create: `src/components/sidebar-widgets/crm/calls-widgets.tsx`

Each file follows the same pattern: a single default export component that calls its Convex queries and renders KpiRow + NudgeCard. I'll show the pattern for the first two; the rest follow identically.

- [ ] **Step 1: Create Insights widgets**

```tsx
// src/components/sidebar-widgets/crm/insights-widgets.tsx
import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { KpiRow } from "../kpi-row";
import { NudgeCard } from "../nudge-card";
import { useTranslation } from "react-i18next";

export function InsightsWidgets({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation();
  const kpis = useQuery(api.sidebarWidgets.getInsightsKpis, { organizationId: organizationId as any });
  const nudges = useQuery(api.nudges.getInsightsNudges, { organizationId: organizationId as any });

  if (!kpis) return null;

  return (
    <>
      <KpiRow
        size="hero"
        items={[
          {
            label: t("sidebar.revenue"),
            value: `${Math.round(kpis.revenue / 1000)}K`,
            color: "text-emerald-500",
            trend: kpis.revenueTrend !== 0
              ? { value: Math.abs(kpis.revenueTrend), positive: kpis.revenueTrend > 0 }
              : undefined,
          },
          {
            label: t("sidebar.pipeline"),
            value: `${Math.round(kpis.pipelineValue / 1000)}K`,
            color: "text-primary",
          },
        ]}
      />
      <KpiRow
        items={[
          { label: t("sidebar.contacts"), value: kpis.totalContacts },
          { label: t("sidebar.companies"), value: kpis.totalCompanies },
          { label: t("sidebar.winRate"), value: `${kpis.winRate}%` },
        ]}
      />
      {nudges?.map((n, i) => (
        <NudgeCard key={i} message={n.message} severity={n.severity} icon={n.icon} />
      ))}
    </>
  );
}
```

- [ ] **Step 2: Create Deals widgets**

```tsx
// src/components/sidebar-widgets/crm/deals-widgets.tsx
import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { KpiRow } from "../kpi-row";
import { NudgeCard } from "../nudge-card";
import { useTranslation } from "react-i18next";

export function DealsWidgets({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation();
  const kpis = useQuery(api.sidebarWidgets.getDealsKpis, { organizationId: organizationId as any });
  const nudges = useQuery(api.nudges.getDealsNudges, { organizationId: organizationId as any });

  if (!kpis) return null;

  return (
    <>
      <KpiRow
        items={[
          { label: t("sidebar.open"), value: kpis.openCount, color: "text-primary" },
          { label: t("sidebar.pipeline"), value: `${Math.round(kpis.pipelineValue / 1000)}K` },
          { label: t("sidebar.winRate"), value: `${kpis.winRate}%`, color: "text-emerald-500" },
        ]}
      />
      {nudges?.map((n, i) => (
        <NudgeCard key={i} message={n.message} severity={n.severity} />
      ))}
    </>
  );
}
```

- [ ] **Step 3: Create remaining 9 CRM widget components**

Follow the same pattern for each tab:
- `contacts-widgets.tsx` — calls `getContactsKpis` + `getContactsNudges`, shows Total/New/Unlinked
- `companies-widgets.tsx` — calls `getCompaniesKpis`, shows Total/New/Revenue
- `activities-widgets.tsx` — calls `getActivitiesKpis` + `getActivitiesNudges`, shows Overdue/Today/Completion. Needs userId from `useOrganization()` or auth context.
- `calendar-widgets.tsx` — calls `getCalendarKpis` + `getCalendarNudges`, shows Today/Overdue/Week
- `inbox-widgets.tsx` — calls `getInboxKpis` + `getInboxNudges`, shows Unread/Today
- `email-templates-widgets.tsx` — calls `getEmailTemplatesKpis`, shows Total/Usage/Top
- `products-widgets.tsx` — calls `getProductsKpis`, shows Total/InDeals/TopSeller
- `documents-widgets.tsx` — calls `getDocumentsKpis` + `getDocumentsNudges`, shows Total/New/Pending
- `calls-widgets.tsx` — calls `getCallsKpis`, shows Today/AnswerRate/AvgDuration

Each component: import `useQuery`, `api`, `KpiRow`, `NudgeCard`, `useTranslation`. Return `<><KpiRow .../>{nudges?.map(...)}</>`.

For components needing `userId`, get it from auth context:
```tsx
import { useCurrentUser } from "@/hooks/use-current-user"; // or equivalent auth hook
const user = useCurrentUser();
// pass user._id to query args
```

Check the existing auth pattern — look at `src/hooks/` for the user hook. If `useOrganization()` returns a `membership` with `userId`, use that.

- [ ] **Step 4: Verify all components compile**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar-widgets/crm/
git commit -m "feat: add CRM per-tab widget components (Phase 1 KPIs + nudges)"
```

---

### Task 8: Wire CRM Widgets into PageContexts

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx`

- [ ] **Step 1: Import all CRM widget components**

At the top of `app-sidebar.tsx`, add lazy imports:

```typescript
import { InsightsWidgets } from "@/components/sidebar-widgets/crm/insights-widgets";
import { DealsWidgets } from "@/components/sidebar-widgets/crm/deals-widgets";
import { ContactsWidgets } from "@/components/sidebar-widgets/crm/contacts-widgets";
import { CompaniesWidgets } from "@/components/sidebar-widgets/crm/companies-widgets";
import { ActivitiesWidgets } from "@/components/sidebar-widgets/crm/activities-widgets";
import { CalendarWidgets } from "@/components/sidebar-widgets/crm/calendar-widgets";
import { InboxWidgets } from "@/components/sidebar-widgets/crm/inbox-widgets";
import { EmailTemplatesWidgets } from "@/components/sidebar-widgets/crm/email-templates-widgets";
import { ProductsWidgets } from "@/components/sidebar-widgets/crm/products-widgets";
import { DocumentsWidgets } from "@/components/sidebar-widgets/crm/documents-widgets";
import { CallsWidgets } from "@/components/sidebar-widgets/crm/calls-widgets";
```

- [ ] **Step 2: Add `widgets` field to each CRM pageContext**

```typescript
const pageContexts: Record<string, PageContext> = {
  dashboard: {
    titleKey: "nav.insights",
    widgets: InsightsWidgets,
    actions: [/* existing actions unchanged */],
  },
  leads: {
    titleKey: "nav.deals",
    widgets: DealsWidgets,
    actions: [/* existing actions unchanged */],
  },
  contacts: {
    titleKey: "nav.contacts",
    widgets: ContactsWidgets,
    actions: [/* existing actions unchanged */],
  },
  // ... same pattern for all CRM tabs
};
```

Also add the new `emailTemplates` entry (it didn't have a pageContext before):

```typescript
emailTemplates: {
  titleKey: "nav.emailTemplates",
  widgets: EmailTemplatesWidgets,
  actions: [
    { label: "actions.newTemplate", icon: Plus, quickCreate: "emailTemplate" },
  ],
},
```

And add `"emailTemplates"` to the `entityRouteKeys` array.

- [ ] **Step 3: Verify types compile and test in browser**

Run: `npx tsc --noEmit`
Expected: PASS

Open browser at `http://localhost:5173/dashboard`. Column 2 should show KPI cards under the page title. Navigate to Deals, Contacts, etc. — each should show its tab-specific KPIs and nudges.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/app-sidebar.tsx
git commit -m "feat: wire CRM widget components into pageContexts"
```

---

## Chunk 3: Gabinet Backend Queries + Per-Tab Widgets

### Task 9: Gabinet Sidebar Widget Queries

**Files:**
- Create: `convex/gabinet/sidebarWidgets.ts` (NEW file)

- [ ] **Step 1: Create Gabinet sidebar widget queries**

Follow the same pattern as CRM. Key queries:

```typescript
// convex/gabinet/sidebarWidgets.ts
import { query } from "../_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "../_helpers/auth";

// --- Dashboard ---
export const getDashboardKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const todayStr = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"

    const appointments = await ctx.db
      .query("gabinetAppointments")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const todayAppts = appointments.filter((a) => a.date === todayStr);
    const confirmed = todayAppts.filter((a) => a.status === "confirmed" || a.status === "completed");

    const patients = await ctx.db
      .query("gabinetPatients")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const employees = await ctx.db
      .query("gabinetEmployees")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const activeEmployees = employees.filter((e) => e.status === "active");

    return {
      todayAppointments: todayAppts.length,
      confirmedToday: confirmed.length,
      totalPatients: patients.length,
      activeEmployees: activeEmployees.length,
    };
  },
});

// --- Calendar ---
export const getCalendarKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const todayStr = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"

    const appointments = await ctx.db
      .query("gabinetAppointments")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const todayAppts = appointments.filter((a) => a.date === todayStr);

    return {
      todayCount: todayAppts.length,
      confirmed: todayAppts.filter((a) => a.status === "confirmed").length,
      unconfirmed: todayAppts.filter((a) => a.status === "scheduled").length,
    };
  },
});

// --- Patients ---
export const getPatientsKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const patients = await ctx.db
      .query("gabinetPatients")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    return {
      total: patients.length,
      newThisMonth: patients.filter((p) => p.createdAt >= monthStart.getTime()).length,
    };
  },
});

// --- Treatments ---
export const getTreatmentsKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const now = new Date();
    const monthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`; // "YYYY-MM-01"

    const treatments = await ctx.db
      .query("gabinetTreatments")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const appointments = await ctx.db
      .query("gabinetAppointments")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const completedThisMonth = appointments.filter(
      (a) => a.status === "completed" && a.date >= monthStartStr
    );

    const avgPrice = treatments.length > 0
      ? Math.round(treatments.reduce((s, t) => s + (t.price ?? 0), 0) / treatments.length)
      : 0;

    return {
      totalTreatments: treatments.length,
      completedThisMonth: completedThisMonth.length,
      avgPrice,
    };
  },
});

// --- Packages ---
export const getPackagesKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const packages = await ctx.db
      .query("gabinetTreatmentPackages")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    // Count active patient packages
    const packageUsages = await ctx.db
      .query("gabinetPackageUsage")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const active = packageUsages.filter((u) => u.status === "active");

    return {
      totalPackages: packages.length,
      activeSubscriptions: active.length,
    };
  },
});

// --- Employees ---
export const getEmployeesKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const employees = await ctx.db
      .query("gabinetEmployees")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const active = employees.filter((e) => e.status === "active");

    const leaves = await ctx.db
      .query("gabinetLeaves")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const todayStr = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"
    const onLeave = leaves.filter((l) => l.status === "approved" && l.startDate <= todayStr && l.endDate >= todayStr);
    const pendingRequests = leaves.filter((l) => l.status === "pending");

    return {
      activeCount: active.length,
      onLeave: onLeave.length,
      pendingLeaveRequests: pendingRequests.length,
    };
  },
});

// --- Gabinet Documents ---
export const getDocumentsKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const templates = await ctx.db
      .query("gabinetDocumentTemplates")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const docs = await ctx.db
      .query("gabinetDocuments")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const pendingSig = docs.filter((d) => d.status === "pending_signature");

    return {
      templateCount: templates.length,
      generatedThisMonth: docs.filter((d) => d.createdAt >= monthStart.getTime()).length,
      pendingSignature: pendingSig.length,
    };
  },
});

// --- Reports ---
export const getReportsKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const now = new Date();
    const monthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStartStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}-01`;

    const appointments = await ctx.db
      .query("gabinetAppointments")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const thisMonth = appointments.filter((a) => a.date >= monthStartStr);
    const lastMonthAppts = appointments.filter(
      (a) => a.date >= lastMonthStartStr && a.date < monthStartStr
    );

    const completed = thisMonth.filter((a) => a.status === "completed");
    const noShows = thisMonth.filter((a) => a.status === "no_show");
    const attendance = thisMonth.length > 0
      ? Math.round((completed.length / (completed.length + noShows.length)) * 100)
      : 0;

    const visitTrend = lastMonthAppts.length > 0
      ? Math.round(((thisMonth.length - lastMonthAppts.length) / lastMonthAppts.length) * 100)
      : 0;

    return {
      visitsThisMonth: thisMonth.length,
      visitTrend,
      attendance,
    };
  },
});
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add convex/gabinet/sidebarWidgets.ts
git commit -m "feat: add Gabinet sidebar widget KPI queries"
```

---

### Task 10: Gabinet Nudge Queries

**Files:**
- Create: `convex/gabinet/nudges.ts`

- [ ] **Step 1: Create per-tab Gabinet nudge queries**

```typescript
// convex/gabinet/nudges.ts
import { query } from "../_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "../_helpers/auth";
import type { NudgeData } from "../nudges";

export const getAppointmentNudges = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verifyOrgAccess(ctx, args.organizationId);
    const todayStr = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"

    const appointments = await ctx.db
      .query("gabinetAppointments")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const unconfirmed = appointments.filter(
      (a) => a.status === "scheduled" && a.date === todayStr
    );

    if (unconfirmed.length > 0) {
      return [{
        message: `${unconfirmed.length} wizyt bez potwierdzenia SMS`,
        severity: "yellow",
        icon: "📱",
      }];
    }
    return [];
  },
});

export const getLeaveNudges = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verifyOrgAccess(ctx, args.organizationId);
    const leaves = await ctx.db
      .query("gabinetLeaves")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const pending = leaves.filter((l) => l.status === "pending");
    if (pending.length > 0) {
      return [{
        message: `${pending.length} wnioskow urlopowych do akceptacji`,
        severity: "red",
        icon: "📋",
      }];
    }
    return [];
  },
});

export const getPackageNudges = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verifyOrgAccess(ctx, args.organizationId);
    // Package exhaustion check would need usage tracking data
    // For now, return empty — will be filled when package usage tracking is in place
    return [];
  },
});

export const getDocumentNudges = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<NudgeData[]> => {
    await verifyOrgAccess(ctx, args.organizationId);
    const docs = await ctx.db
      .query("gabinetDocuments")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const pendingSig = docs.filter((d) => d.status === "pending_signature");
    if (pendingSig.length > 0) {
      return [{
        message: `${pendingSig.length} dokumentow oczekuje na podpis pacjenta`,
        severity: "yellow",
        icon: "✍️",
      }];
    }
    return [];
  },
});
```

- [ ] **Step 2: Verify and commit**

```bash
npx tsc --noEmit
git add convex/gabinet/nudges.ts
git commit -m "feat: add per-tab Gabinet nudge queries"
```

---

### Task 11: Gabinet Per-Tab Widget Components + Wiring

**Files:**
- Create: `src/components/sidebar-widgets/gabinet/dashboard-widgets.tsx`
- Create: `src/components/sidebar-widgets/gabinet/calendar-widgets.tsx`
- Create: `src/components/sidebar-widgets/gabinet/patients-widgets.tsx`
- Create: `src/components/sidebar-widgets/gabinet/treatments-widgets.tsx`
- Create: `src/components/sidebar-widgets/gabinet/packages-widgets.tsx`
- Create: `src/components/sidebar-widgets/gabinet/employees-widgets.tsx`
- Create: `src/components/sidebar-widgets/gabinet/documents-widgets.tsx`
- Create: `src/components/sidebar-widgets/gabinet/reports-widgets.tsx`
- Modify: `src/components/layout/app-sidebar.tsx`

- [ ] **Step 1: Create all 8 Gabinet widget components**

Follow the same pattern as CRM: each component calls its Convex query from `api.gabinet.sidebarWidgets.*` and `api.gabinet.nudges.*`, renders `<KpiRow>` + `<NudgeCard>`.

Example for dashboard:

```tsx
// src/components/sidebar-widgets/gabinet/dashboard-widgets.tsx
import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { KpiRow } from "../kpi-row";
import { NudgeCard } from "../nudge-card";
import { useTranslation } from "react-i18next";

export function GabinetDashboardWidgets({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation();
  const kpis = useQuery(api.gabinet.sidebarWidgets.getDashboardKpis, { organizationId: organizationId as any });
  const apptNudges = useQuery(api.gabinet.nudges.getAppointmentNudges, { organizationId: organizationId as any });
  const leaveNudges = useQuery(api.gabinet.nudges.getLeaveNudges, { organizationId: organizationId as any });

  if (!kpis) return null;

  const nudges = [...(apptNudges ?? []), ...(leaveNudges ?? [])].slice(0, 2);

  return (
    <>
      <KpiRow
        size="hero"
        items={[
          { label: t("sidebar.gabinet.todayAppts"), value: kpis.todayAppointments, color: "text-primary" },
          { label: t("sidebar.gabinet.confirmed"), value: kpis.confirmedToday, color: "text-emerald-500" },
        ]}
      />
      <KpiRow
        items={[
          { label: t("sidebar.gabinet.patients"), value: kpis.totalPatients },
          { label: t("sidebar.gabinet.employees"), value: kpis.activeEmployees },
        ]}
      />
      {nudges.map((n, i) => (
        <NudgeCard key={i} message={n.message} severity={n.severity} icon={n.icon} />
      ))}
    </>
  );
}
```

Create similar components for the other 7 tabs.

- [ ] **Step 2: Wire Gabinet widgets into gabinetPageContexts in app-sidebar.tsx**

Add imports and `widgets` fields to each `gabinetPageContexts` entry, plus add new entries for `dashboard` and `reports` (which didn't have pageContexts before).

Also add `"dashboard"` and `"reports"` to the `gabinetRouteKeys` array.

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit
git add src/components/sidebar-widgets/gabinet/ src/components/layout/app-sidebar.tsx
git commit -m "feat: add Gabinet per-tab widget components and wire into pageContexts"
```

---

## Chunk 4: Phase 2 — Unique Widgets + Smart Agenda

### Task 12: Unique Widget Components

**Files:**
- Create: `src/components/sidebar-widgets/mini-funnel.tsx`
- Create: `src/components/sidebar-widgets/bar-ranking.tsx`
- Create: `src/components/sidebar-widgets/source-bar.tsx`
- Create: `src/components/sidebar-widgets/type-tags.tsx`
- Create: `src/components/sidebar-widgets/staff-load.tsx`
- Create: `src/components/sidebar-widgets/staff-schedule.tsx`
- Create: `src/components/sidebar-widgets/waiting-list.tsx`

These are pure presentational components that receive data via props. The per-tab widget components from Tasks 7/11 will be updated to include them.

- [ ] **Step 1: Create MiniFunnel (for Deals)**

```tsx
// src/components/sidebar-widgets/mini-funnel.tsx
import { cn } from "@/utils/misc";

interface FunnelStage {
  label: string;
  count: number;
  color: string; // tailwind bg class
}

interface MiniFunnelProps {
  stages: FunnelStage[];
}

export function MiniFunnel({ stages }: MiniFunnelProps) {
  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  return (
    <div className="flex flex-col gap-1">
      {stages.map((stage) => (
        <div key={stage.label} className="flex items-center gap-2">
          <span className="text-muted-foreground w-16 truncate text-[10px]">{stage.label}</span>
          <div className="flex-1 bg-muted/50 h-3 overflow-hidden rounded-full">
            <div
              className={cn("h-full rounded-full transition-all", stage.color)}
              style={{ width: `${(stage.count / maxCount) * 100}%` }}
            />
          </div>
          <span className="text-foreground w-5 text-right text-[10px] font-medium tabular-nums">
            {stage.count}
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create BarRanking (for Products, Templates, Treatments)**

```tsx
// src/components/sidebar-widgets/bar-ranking.tsx
interface RankingItem {
  label: string;
  value: number;
  color?: string;
}

interface BarRankingProps {
  items: RankingItem[];
  unit?: string;
}

export function BarRanking({ items, unit }: BarRankingProps) {
  const maxVal = Math.max(...items.map((i) => i.value), 1);

  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item, idx) => (
        <div key={item.label} className="flex items-center gap-2">
          <span className="text-muted-foreground w-[70px] truncate text-[10px]">{item.label}</span>
          <div className="bg-muted/50 flex-1 h-2.5 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full"
              style={{ width: `${(item.value / maxVal) * 100}%`, opacity: 1 - idx * 0.2 }}
            />
          </div>
          <span className="text-foreground w-8 text-right text-[10px] tabular-nums">
            {item.value}{unit ?? ""}
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create TypeTags (for Activity types, Document types, Loyalty tiers)**

```tsx
// src/components/sidebar-widgets/type-tags.tsx
import { cn } from "@/utils/misc";

interface TagItem {
  label: string;
  count: number;
  color: string; // tailwind combined bg+text class like "bg-primary/20 text-primary"
}

interface TypeTagsProps {
  tags: TagItem[];
}

export function TypeTags({ tags }: TypeTagsProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag.label}
          className={cn("rounded-md px-2 py-0.5 text-[10px] font-medium", tag.color)}
        >
          {tag.label} {tag.count}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create SourceBar (stacked horizontal bar with legend)**

```tsx
// src/components/sidebar-widgets/source-bar.tsx
import { cn } from "@/utils/misc";

interface SourceSegment {
  label: string;
  value: number;
  color: string; // tailwind bg class
}

interface SourceBarProps {
  segments: SourceSegment[];
}

export function SourceBar({ segments }: SourceBarProps) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="bg-muted/50 flex h-3 overflow-hidden rounded-full">
        {segments.map((seg) => (
          <div
            key={seg.label}
            className={cn("h-full", seg.color)}
            style={{ width: `${(seg.value / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {segments.map((seg) => (
          <span key={seg.label} className="text-muted-foreground flex items-center gap-1 text-[9px]">
            <span className={cn("inline-block h-1.5 w-1.5 rounded-full", seg.color)} />
            {seg.label} ({seg.value})
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create StaffLoad and StaffSchedule (Gabinet-specific)**

```tsx
// src/components/sidebar-widgets/staff-load.tsx
import { cn } from "@/utils/misc";

interface StaffLoadItem {
  name: string;
  loadPercent: number;
}

interface StaffLoadProps {
  staff: StaffLoadItem[];
}

export function StaffLoad({ staff }: StaffLoadProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {staff.map((s) => (
        <div key={s.name} className="flex items-center gap-2">
          <span className="text-foreground w-16 truncate text-[10px]">{s.name}</span>
          <div className="bg-muted/50 flex-1 h-2.5 overflow-hidden rounded-full">
            <div
              className={cn(
                "h-full rounded-full",
                s.loadPercent > 85 ? "bg-red-500" : s.loadPercent > 60 ? "bg-amber-500" : "bg-emerald-500"
              )}
              style={{ width: `${Math.min(s.loadPercent, 100)}%` }}
            />
          </div>
          <span className="text-muted-foreground w-7 text-right text-[10px] tabular-nums">
            {s.loadPercent}%
          </span>
        </div>
      ))}
    </div>
  );
}
```

```tsx
// src/components/sidebar-widgets/staff-schedule.tsx
import { cn } from "@/utils/misc";

interface StaffScheduleItem {
  name: string;
  hours: string; // e.g. "08:00–16:00"
  status: "working" | "afternoon" | "leave";
}

interface StaffScheduleProps {
  staff: StaffScheduleItem[];
}

const statusBadge: Record<string, string> = {
  working: "bg-emerald-500/20 text-emerald-500",
  afternoon: "bg-indigo-500/20 text-indigo-500",
  leave: "bg-red-500/20 text-red-500",
};

export function StaffSchedule({ staff }: StaffScheduleProps) {
  return (
    <div className="flex flex-col gap-1">
      {staff.map((s) => (
        <div key={s.name} className="flex items-center justify-between">
          <span className={cn("text-[10px]", s.status === "leave" ? "text-muted-foreground line-through" : "text-foreground")}>
            {s.name}
          </span>
          <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-medium", statusBadge[s.status])}>
            {s.status === "leave" ? "Urlop" : s.hours}
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Create WaitingList (for Inbox "Czekaja najdluzej")**

```tsx
// src/components/sidebar-widgets/waiting-list.tsx
import { cn } from "@/utils/misc";

interface WaitingItem {
  label: string;
  subtitle?: string;
  daysWaiting: number;
}

interface WaitingListProps {
  items: WaitingItem[];
}

export function WaitingList({ items }: WaitingListProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-foreground truncate text-[10px]">{item.label}</div>
            {item.subtitle && <div className="text-muted-foreground truncate text-[9px]">{item.subtitle}</div>}
          </div>
          <span
            className={cn(
              "ml-2 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium tabular-nums",
              item.daysWaiting >= 3 ? "bg-red-500/15 text-red-500" : "bg-amber-500/15 text-amber-500"
            )}
          >
            {item.daysWaiting}d
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Update barrel export**

Add all new components to `src/components/sidebar-widgets/index.ts`.

- [ ] **Step 8: Commit**

```bash
git add src/components/sidebar-widgets/
git commit -m "feat: add unique widget components (funnel, bars, tags, staff, waiting list)"
```

---

### Task 13: Smart Agenda Component

**Files:**
- Create: `src/components/sidebar-widgets/smart-agenda.tsx`
- Modify: `convex/sidebarWidgets.ts` (add getUpcomingEvents query)

- [ ] **Step 1: Add upcoming events query to sidebarWidgets.ts**

```typescript
// Add to convex/sidebarWidgets.ts
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
```

- [ ] **Step 2: Create SmartAgenda component**

```tsx
// src/components/sidebar-widgets/smart-agenda.tsx
import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useTranslation } from "react-i18next";
import { CalendarCheck, Phone, Mail, Users } from "@/lib/ez-icons";

const typeIcons: Record<string, React.ElementType> = {
  call: Phone,
  email: Mail,
  meeting: Users,
  default: CalendarCheck,
};

interface SmartAgendaProps {
  organizationId: string;
  userId: string;
}

export function SmartAgenda({ organizationId, userId }: SmartAgendaProps) {
  const { t } = useTranslation();
  const events = useQuery(api.sidebarWidgets.getUpcomingEvents, {
    organizationId: organizationId as any,
    userId: userId as any,
    limit: 3,
  });

  if (!events?.length) return null;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-[9px] font-medium uppercase tracking-wider">
        {t("sidebar.upcoming")}
      </span>
      {events.map((event) => {
        const Icon = typeIcons[event.type] ?? typeIcons.default;
        const time = new Date(event.startTime);
        const timeStr = time.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });

        return (
          <div key={event.id} className="flex items-center gap-2">
            <Icon className="text-muted-foreground h-3 w-3 shrink-0" />
            <span className="text-primary text-[10px] font-medium tabular-nums">{timeStr}</span>
            <span className="text-foreground min-w-0 truncate text-[10px]">{event.title}</span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Add SmartAgenda to relevant per-tab widgets**

Update the Insights, Deals, Activities, Calendar, Inbox, and Calls widget components to include `<SmartAgenda />` at the bottom of their render. Pass `organizationId` and `userId` as props.

- [ ] **Step 4: Commit**

```bash
git add convex/sidebarWidgets.ts src/components/sidebar-widgets/
git commit -m "feat: add SmartAgenda component with upcoming events"
```

---

### Task 14: Wire Unique Widgets into Per-Tab Components

- [ ] **Step 1: Update per-tab components to include unique widgets**

This involves updating each CRM and Gabinet widget component to include its unique visualization. For example:

- `deals-widgets.tsx` — add `MiniFunnel` with data from `getLeadsByStage`
- `contacts-widgets.tsx` — add `SourceBar` with data from `getContactsBySource`
- `inbox-widgets.tsx` — add `WaitingList` with data from a new query
- `products-widgets.tsx` — add `BarRanking` with top products data
- Gabinet Calendar — add `StaffLoad` with employee load data
- Gabinet Employees — add `StaffSchedule` with today's schedule

Each unique widget needs its own backend query (or reuse existing ones). Add queries as needed to `convex/sidebarWidgets.ts` and `convex/gabinet/sidebarWidgets.ts`.

- [ ] **Step 2: Verify all widgets render correctly in browser**

Navigate through each tab and verify widgets appear correctly in Column 2.

- [ ] **Step 3: Commit**

```bash
git add convex/ src/components/sidebar-widgets/
git commit -m "feat: wire unique widgets into per-tab components (Phase 2)"
```

---

## Chunk 5: Phase 3 — Recent Items + Day Agenda Takeover

### Task 15: RecentlyViewed Backend

**Files:**
- Create: `convex/recentlyViewed.ts`
- Test: `convex/tests/recentlyViewed.test.ts`

- [ ] **Step 1: Create recentlyViewed mutations and queries**

```typescript
// convex/recentlyViewed.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";

const MAX_PER_TYPE = 50;

export const track = mutation({
  args: {
    organizationId: v.id("organizations"),
    entityType: v.string(),
    entityId: v.string(),
    entityLabel: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);

    // Check if already exists
    const existing = await ctx.db
      .query("recentlyViewed")
      .withIndex("by_user_type", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", user._id).eq("entityType", args.entityType))
      .collect();

    const match = existing.find((r) => r.entityId === args.entityId);
    if (match) {
      await ctx.db.patch(match._id, { viewedAt: Date.now(), entityLabel: args.entityLabel });
    } else {
      await ctx.db.insert("recentlyViewed", {
        organizationId: args.organizationId,
        userId: user._id,
        entityType: args.entityType,
        entityId: args.entityId,
        entityLabel: args.entityLabel,
        viewedAt: Date.now(),
      });
    }

    // Eviction: remove oldest beyond limit
    const all = await ctx.db
      .query("recentlyViewed")
      .withIndex("by_user_type", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", user._id).eq("entityType", args.entityType))
      .collect();

    if (all.length > MAX_PER_TYPE) {
      const sorted = all.sort((a, b) => a.viewedAt - b.viewedAt);
      const toDelete = sorted.slice(0, all.length - MAX_PER_TYPE);
      for (const item of toDelete) {
        await ctx.db.delete(item._id);
      }
    }
  },
});

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    entityType: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const limit = args.limit ?? 3;

    const items = await ctx.db
      .query("recentlyViewed")
      .withIndex("by_user_type", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", user._id).eq("entityType", args.entityType))
      .order("desc")
      .take(limit);

    return items.map((i) => ({
      entityId: i.entityId,
      entityLabel: i.entityLabel,
      viewedAt: i.viewedAt,
    }));
  },
});
```

- [ ] **Step 2: Write test for recentlyViewed**

```typescript
// convex/tests/recentlyViewed.test.ts
import { expect, test, describe } from "vitest";
import { api } from "../_generated/api";
import { createTestCtx, seedTestUser } from "../_test_helpers";

describe("recentlyViewed", () => {
  test("tracks and lists recently viewed items", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    await t.withIdentity(identity).mutation(api.recentlyViewed.track, {
      organizationId,
      entityType: "contacts",
      entityId: "test-id-1",
      entityLabel: "Jan Kowalski",
    });

    const items = await t.withIdentity(identity).query(api.recentlyViewed.list, {
      organizationId,
      entityType: "contacts",
      limit: 3,
    });

    expect(items).toHaveLength(1);
    expect(items[0].entityLabel).toBe("Jan Kowalski");
  });

  test("upserts existing entry instead of duplicating", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    await t.withIdentity(identity).mutation(api.recentlyViewed.track, {
      organizationId, entityType: "contacts", entityId: "test-id-1", entityLabel: "Jan K.",
    });
    await t.withIdentity(identity).mutation(api.recentlyViewed.track, {
      organizationId, entityType: "contacts", entityId: "test-id-1", entityLabel: "Jan Kowalski",
    });

    const items = await t.withIdentity(identity).query(api.recentlyViewed.list, {
      organizationId, entityType: "contacts", limit: 10,
    });

    expect(items).toHaveLength(1);
    expect(items[0].entityLabel).toBe("Jan Kowalski");
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd /Users/alfred/.openclaw/workspace/projects/crm_new && npx vitest run --config convex/vitest.config.ts convex/tests/recentlyViewed.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add convex/recentlyViewed.ts convex/tests/recentlyViewed.test.ts
git commit -m "feat: add recentlyViewed backend with track mutation, list query, and eviction"
```

---

### Task 16: Recent Items Component + Integration

**Files:**
- Create: `src/components/sidebar-widgets/recent-items.tsx`
- Modify: per-tab widget components for the 5 tabs that show recent items

- [ ] **Step 1: Create RecentItems component**

```tsx
// src/components/sidebar-widgets/recent-items.tsx
import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useTranslation } from "react-i18next";
import { Clock } from "@/lib/ez-icons";

interface RecentItemsProps {
  organizationId: string;
  entityType: string;
  linkPrefix: string; // e.g. "/dashboard/contacts/"
}

export function RecentItems({ organizationId, entityType, linkPrefix }: RecentItemsProps) {
  const { t } = useTranslation();
  const items = useQuery(api.recentlyViewed.list, {
    organizationId: organizationId as any,
    entityType,
    limit: 3,
  });

  if (!items?.length) return null;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-[9px] font-medium uppercase tracking-wider">
        {t("sidebar.recentItems")}
      </span>
      {items.map((item) => (
        <a
          key={item.entityId}
          href={`${linkPrefix}${item.entityId}`}
          className="hover:bg-muted/50 flex items-center gap-2 rounded px-1 py-0.5 transition-colors"
        >
          <Clock className="text-muted-foreground h-3 w-3 shrink-0" />
          <span className="text-foreground min-w-0 truncate text-[10px]">{item.entityLabel}</span>
        </a>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add RecentItems to the 5 qualifying tab widgets**

Update these per-tab widgets to include `<RecentItems>`:
- `deals-widgets.tsx` — entityType="leads", linkPrefix="/dashboard/leads/"
- `contacts-widgets.tsx` — entityType="contacts", linkPrefix="/dashboard/contacts/"
- `companies-widgets.tsx` — entityType="companies", linkPrefix="/dashboard/companies/"
- `documents-widgets.tsx` — entityType="documents", linkPrefix="/dashboard/documents/"
- `patients-widgets.tsx` — entityType="gabinetPatients", linkPrefix="/dashboard/gabinet/patients/"

- [ ] **Step 3: Add tracking calls to detail pages**

In each entity detail page (e.g., `_layout.contacts.$contactId.tsx`), add a `useEffect` that calls `recentlyViewed.track()` on mount:

```tsx
import { useMutation } from "convex/react";
import { api } from "@cvx/_generated/api";

// Inside component:
const trackView = useMutation(api.recentlyViewed.track);
useEffect(() => {
  if (contact && organizationId) {
    trackView({
      organizationId,
      entityType: "contacts",
      entityId: contact._id,
      entityLabel: `${contact.firstName} ${contact.lastName}`,
    });
  }
}, [contact?._id]);
```

Do this for: contacts, companies, leads, documents, gabinetPatients detail pages.

- [ ] **Step 4: Commit**

```bash
git add src/components/sidebar-widgets/ src/routes/
git commit -m "feat: add RecentItems component with tracking integration (Phase 3)"
```

---

### Task 17: Day Agenda Takeover

**Files:**
- Create: `src/components/sidebar-widgets/day-timeline.tsx`
- Modify: `convex/gabinet/sidebarWidgets.ts` (add getDayAgenda query)
- Modify: `src/components/layout/app-sidebar.tsx` (replace placeholder with DayTimeline)
- Modify: Gabinet Calendar page (wire setDayAgendaDate)

- [ ] **Step 1: Add getDayAgenda query to Gabinet sidebarWidgets**

```typescript
// Add to convex/gabinet/sidebarWidgets.ts
export const getDayAgenda = query({
  args: { organizationId: v.id("organizations"), date: v.string() },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    // args.date is "YYYY-MM-DD" — matches gabinetAppointments.date directly

    const appointments = await ctx.db
      .query("gabinetAppointments")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const dayAppts = appointments
      .filter((a) => a.date === args.date)
      .sort((a, b) => a.startTime.localeCompare(b.startTime)); // startTime is "HH:MM" string

    // Enrich with patient and treatment data
    const enriched = await Promise.all(
      dayAppts.map(async (appt) => {
        const patient = appt.patientId
          ? await ctx.db.get(appt.patientId)
          : null;
        const treatment = appt.treatmentId
          ? await ctx.db.get(appt.treatmentId)
          : null;
        const employee = appt.employeeId
          ? await ctx.db.get(appt.employeeId)
          : null;

        return {
          id: appt._id,
          startTime: appt.startTime,
          endTime: appt.endTime,
          status: appt.status,
          patientName: patient ? `${patient.firstName} ${patient.lastName}` : "—",
          treatmentName: treatment?.name ?? "—",
          treatmentDuration: treatment?.duration ?? 0,
          employeeName: employee ? `${employee.firstName} ${employee.lastName}` : "—",
          confirmed: appt.status === "confirmed" || appt.status === "completed",
        };
      })
    );

    return {
      date: args.date,
      appointments: enriched,
      totalAppointments: enriched.length,
      confirmedCount: enriched.filter((a) => a.confirmed).length,
    };
  },
});
```

- [ ] **Step 2: Create DayTimeline component**

```tsx
// src/components/sidebar-widgets/day-timeline.tsx
import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useSidebarSlot } from "@/components/layout/sidebar-slot-context";
import { X } from "@/lib/ez-icons";
import { cn } from "@/utils/misc";
import { useTranslation } from "react-i18next";

interface DayTimelineProps {
  organizationId: string;
  date: string;
}

export function DayTimeline({ organizationId, date }: DayTimelineProps) {
  const { t } = useTranslation();
  const { setDayAgendaDate } = useSidebarSlot();
  const agenda = useQuery(api.gabinet.sidebarWidgets.getDayAgenda, {
    organizationId: organizationId as any,
    date,
  });

  if (!agenda) return null;

  const dateObj = new Date(date);
  const dayName = dateObj.toLocaleDateString("pl-PL", { weekday: "long" });
  const dateStr = dateObj.toLocaleDateString("pl-PL", { day: "numeric", month: "long" });

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-foreground text-sm font-semibold capitalize">{dayName}, {dateStr}</div>
          <div className="text-muted-foreground text-[10px]">
            {agenda.totalAppointments} wizyt · {agenda.totalAppointments - agenda.confirmedCount} niepotwierdz.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDayAgendaDate(null)}
          className="bg-muted hover:bg-muted/80 rounded p-1"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Timeline */}
      <div className="relative border-l-2 border-border pl-3">
        {agenda.appointments.map((appt) => {
          const time = new Date(appt.startTime);
          const timeStr = time.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
          const isCompleted = appt.status === "completed";
          const isCurrent = appt.status === "in_progress";

          return (
            <div key={appt.id} className="relative mb-2 pb-1">
              <div
                className={cn(
                  "absolute -left-[17px] top-0.5 h-2 w-2 rounded-full border-2 border-background",
                  isCompleted && "bg-emerald-500",
                  isCurrent && "bg-primary ring-2 ring-primary/30",
                  !isCompleted && !isCurrent && "bg-muted-foreground/30"
                )}
              />
              <div className="flex items-baseline justify-between">
                <span className="text-[10px]">
                  <span className={cn("font-medium", isCompleted ? "text-emerald-500" : isCurrent ? "text-primary" : "text-muted-foreground")}>
                    {isCompleted && "✓ "}{timeStr}
                  </span>{" "}
                  <span className={cn(isCurrent ? "text-foreground font-medium" : "text-muted-foreground")}>
                    {appt.patientName}
                  </span>
                </span>
                <span className={cn("text-[9px]", !appt.confirmed ? "text-amber-500" : "text-muted-foreground")}>
                  {appt.treatmentName} {appt.treatmentDuration}min
                </span>
              </div>
              <div className="text-muted-foreground text-[9px] ml-0.5">
                {appt.employeeName}
                {!appt.confirmed && <span className="text-amber-500"> · niepotwierdzona</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick action */}
      <button
        type="button"
        className="bg-primary/10 hover:bg-primary/20 text-primary w-full rounded-md border border-primary/30 px-3 py-1.5 text-center text-xs font-medium transition-colors"
      >
        + Umow wizyte na {dateStr}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Replace placeholder in app-sidebar.tsx**

Replace the placeholder day agenda `<div>` (from Task 4) with the actual `DayTimeline` component:

```tsx
import { DayTimeline } from "@/components/sidebar-widgets/day-timeline";

// In the dayAgendaDate check:
{dayAgendaDate ? (
  <div className="flex-1 overflow-y-auto px-3 pb-4">
    <DayTimeline organizationId={organizationId} date={dayAgendaDate} />
  </div>
) : (
  // ... standard widgets
)}
```

- [ ] **Step 4: Wire setDayAgendaDate in Gabinet Calendar page**

In the Gabinet Calendar page component (find via route `_layout.gabinet.calendar.tsx`), add a day click handler:

```tsx
import { useSidebarSlot } from "@/components/layout/sidebar-slot-context";

// Inside component:
const { setDayAgendaDate } = useSidebarSlot();

// In the calendar's onDayClick or similar handler:
const handleDayClick = (date: Date) => {
  setDayAgendaDate(date.toISOString().split("T")[0]);
};
```

Find the exact calendar component and its day click mechanism — it may be in `<WeeklyCalendar>` or a custom calendar view. The handler name will depend on the component API.

- [ ] **Step 5: Test day agenda flow**

1. Navigate to Gabinet Calendar
2. Click a day with appointments
3. Column 2 should show DayTimeline with appointments
4. Click X — should return to standard widgets
5. Navigate away to Patients — day agenda should auto-clear

- [ ] **Step 6: Commit**

```bash
git add convex/gabinet/sidebarWidgets.ts src/components/sidebar-widgets/day-timeline.tsx src/components/layout/app-sidebar.tsx src/routes/
git commit -m "feat: add Day Agenda Takeover with DayTimeline component (Phase 3)"
```

---

### Task 18: i18n Keys

**Files:**
- Modify: `public/locales/pl/translation.json`
- Modify: `public/locales/en/translation.json`

- [ ] **Step 1: Add all sidebar widget translation keys**

Add keys under a `sidebar` namespace:

```json
{
  "sidebar": {
    "revenue": "Przychód PLN",
    "pipeline": "Pipeline PLN",
    "contacts": "Kontakty",
    "companies": "Firmy",
    "winRate": "Win rate",
    "open": "Otwarte",
    "today": "Dziś",
    "overdue": "Zaległe",
    "thisWeek": "Ten tydzień",
    "unread": "Nieprzeczytane",
    "todayReceived": "Dziś odebrane",
    "templates": "Szablony",
    "usageMonthly": "Użycia/mies.",
    "topTemplate": "Najczęstszy",
    "products": "Produkty",
    "inDeals": "W dealach",
    "topSeller": "Top",
    "documents": "Dokumenty",
    "newThisMonth": "Nowe",
    "pendingSignature": "Do podpisu",
    "callsToday": "Dziś",
    "answerRate": "Odebrane",
    "avgDuration": "Śr. czas",
    "completionRate": "Wykonanie",
    "upcoming": "Nadchodzące",
    "recentItems": "Moje ostatnie",
    "gabinet": {
      "todayAppts": "Wizyty dziś",
      "confirmed": "Potwierdzone",
      "patients": "Pacjenci",
      "employees": "Aktywni",
      "treatments": "Zabiegi",
      "completedMonth": "Wykonane/mies.",
      "avgPrice": "Śr. cena",
      "packages": "Pakiety",
      "activePackages": "Aktywne",
      "onLeave": "Na urlopie",
      "leaveRequests": "Wnioski",
      "templateCount": "Szablony",
      "generated": "Wygenerowane",
      "visits": "Wizyty",
      "attendance": "Frekwencja"
    }
  }
}
```

Add equivalent English translations to `public/locales/en/translation.json` under the same `sidebar` namespace. Merge into the existing JSON — do not overwrite.

- [ ] **Step 2: Commit**

```bash
git add public/locales/
git commit -m "feat: add i18n keys for sidebar widgets (PL + EN)"
```

---

### Task 19: Final Integration Test

- [ ] **Step 1: Full browser walkthrough**

Navigate through ALL 19 tabs (11 CRM + 8 Gabinet) and verify:
1. KPI Row appears with correct data
2. Nudges appear when conditions are met
3. Quick Actions still work
4. Unique widgets render (Phase 2 tabs)
5. Smart Agenda shows upcoming events on relevant tabs
6. Recent Items shows on 5 qualifying tabs
7. Day Agenda Takeover works on Gabinet Calendar

- [ ] **Step 2: Verify responsive behavior**

At viewport <1024px, Column 2 should be hidden. At 1024-1400px, should follow existing wideContent logic. At >1400px, always visible.

- [ ] **Step 3: Verify no TypeScript errors**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Verify no existing tests break**

Run: `npx vitest run --config convex/vitest.config.ts`

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: Column 2 contextual widgets — complete implementation"
```
