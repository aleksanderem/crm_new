import { createLazyFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useSupabaseOrganizationMembers } from "@/hooks/use-supabase-organizations";
import { useOrganization } from "@/components/org-context";
import { useWideContent } from "@/hooks/use-wide-content";
import { useDraggableDialog } from "@/hooks/use-draggable-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Plus, Search, Users, X } from "@/lib/ez-icons";
import { EmptyState } from "@/components/layout/empty-state";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PrintSchedule } from "@/components/gabinet/calendar/print-schedule";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CalendarDayView } from "@/components/gabinet/calendar/calendar-day-view";
import {
  CalendarDayByEmployeeView,
  type DayByEmployeeColumn,
} from "@/components/gabinet/calendar/calendar-day-by-employee-view";
import { CalendarWeekView } from "@/components/gabinet/calendar/calendar-week-view";
import { CalendarMonthView } from "@/components/gabinet/calendar/calendar-month-view";
import { AppointmentDialog } from "@/components/gabinet/calendar/appointment-dialog";
import { AppointmentCard } from "@/components/gabinet/calendar/appointment-card";
import { SellPackagePanel } from "@/components/gabinet/sell-package-panel";
import { useSidebarDispatch } from "@/components/layout/sidebar-context";
import { toast } from "sonner";
import type { Id } from "@cvx/_generated/dataModel";
import {
  useSupabaseGabinetAppointmentsByDateRange,
  useSupabaseGabinetFirstAppointmentIdsByPatient,
  useSupabaseGabinetAppointmentPackagePositions,
  useSupabaseGabinetAppointmentRecurringPositions,
  useSupabaseGabinetAppointmentPaymentTotals,
} from "@/hooks/use-supabase-gabinet-appointments";
import { useSupabaseGabinetEmployeesList } from "@/hooks/use-supabase-gabinet-employees";
import { useSupabaseGabinetLocationsList } from "@/hooks/use-supabase-gabinet-locations";
import { useSupabaseGabinetPatientsList } from "@/hooks/use-supabase-gabinet-patients";
import { useSupabaseGabinetTreatmentsList, useSupabaseGabinetAllTreatmentVariants } from "@/hooks/use-supabase-gabinet-treatments";
import { useSupabaseGabinetEmployeeSchedulesList } from "@/hooks/use-supabase-gabinet-employee-schedules";
import { useSupabaseGabinetWorkingHoursList } from "@/hooks/use-supabase-gabinet-working-hours";
import { useSupabaseGabinetLeavesList } from "@/hooks/use-supabase-gabinet-leaves";
import { useSupabaseScheduledActivitiesByDateRange } from "@/hooks/use-supabase-scheduled-activities";
import { useSupabaseGabinetPatientCreditBalances } from "@/hooks/use-supabase-payments";
import { useTagDefinitions } from "@/hooks/use-tag-definitions";
import { useCategoryDefinitions } from "@/hooks/use-category-definitions";
import { TagsManagerSlideout } from "@/components/categories-tags/tags-manager-slideout";
import { CategoriesManagerSlideout } from "@/components/categories-tags/categories-manager-slideout";
import { EventDialog } from "@/components/gabinet/calendar/event-dialog";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { formatAppointmentError } from "@/lib/format-action-error";
import { PermissionGate } from "@/hooks/use-permission";
import { Skeleton } from "@/components/ui/skeleton";

function CalendarSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-9 w-48" />
      </div>
      <Skeleton className="h-[600px] w-full" />
    </div>
  );
}

export const Route = createLazyFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/calendar/",
)({
  component: () => (
    <PermissionGate feature="gabinet_appointments" action="view" loadingFallback={<CalendarSkeleton />}>
      <GabinetCalendarPage />
    </PermissionGate>
  ),
});

type ViewMode = "day" | "week" | "month";
type SlotMinutes = 5 | 10 | 15 | 30 | 60;
const SLOT_OPTIONS: SlotMinutes[] = [60, 30, 15, 10, 5];
const SLOT_STORAGE_KEY = "gabinet.calendar.slotMinutes";

function readStoredSlotMinutes(): SlotMinutes {
  if (typeof window === "undefined") return 60;
  const raw = window.localStorage.getItem(SLOT_STORAGE_KEY);
  const n = raw ? Number(raw) : NaN;
  return (SLOT_OPTIONS as number[]).includes(n) ? (n as SlotMinutes) : 60;
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function GabinetCalendarPage() {
  const { t, i18n } = useTranslation();
  const { organizationId } = useOrganization();
  const search = useSearch({ from: "/_app/_auth/dashboard/_layout/gabinet/calendar/" });
  const routeNavigate = useNavigate();
  const nudgeFilter = search.nudge;
  const actionParam = search.action;

  // Indicate this page has wide content (hides Column 2 on 1024-1400px screens)
  useWideContent(true);

  const [calendarTab, setCalendarTab] = useState<"calendar" | "waitlist">("calendar");
  const [viewMode, setViewMode] = useState<ViewMode>(
    nudgeFilter === "unconfirmed-today" ? "day" : "week",
  );
  const [slotMinutes, setSlotMinutesState] = useState<SlotMinutes>(readStoredSlotMinutes);
  const setSlotMinutes = useCallback((next: SlotMinutes) => {
    setSlotMinutesState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SLOT_STORAGE_KEY, String(next));
    }
  }, []);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");
  const [treatmentFilter, setTreatmentFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>(
    nudgeFilter === "unconfirmed-today" ? "scheduled" : "all",
  );
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [clientSearch, setClientSearch] = useState("");

  // Filter dialog
  const [filterOpen, setFilterOpen] = useState(false);
  const filterDrag = useDraggableDialog(filterOpen);

  // Mobile-only collapsible employee picker (issue #1235). On phones the pill
  // row stole an entire row of vertical space; the popover keeps the same
  // single-select behaviour but collapses to one trigger button.
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false);

  // Tags manager slideout
  const [tagsSlideoutOpen, setTagsSlideoutOpen] = useState(false);

  // Event-types manager slideout (categoryDefinitions filtered by
  // entityType="gabinetEvent" — issue #1555)
  const [eventTypesSlideoutOpen, setEventTypesSlideoutOpen] = useState(false);

  // Dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [sellPackageOpen, setSellPackageOpen] = useState(false);
  const [createDefaultDate, setCreateDefaultDate] = useState<
    string | undefined
  >();
  const [createDefaultTime, setCreateDefaultTime] = useState<
    string | undefined
  >();
  const [createDefaultEndTime, setCreateDefaultEndTime] = useState<
    string | undefined
  >();
  const [createDefaultUserId, setCreateDefaultUserId] = useState<
    string | undefined
  >();

  // Drag state
  const [activeAppointment, setActiveAppointment] = useState<{
    _id: string;
    startTime: string;
    endTime: string;
    patientName: string;
    treatmentName: string;
    variantName?: string;
    status: string;
    color?: string;
    tags?: Array<{ name: string; color: string }>;
    indicators?: Array<{
      kind:
        | "firstVisit"
        | "payment"
        | "count"
        | "paid"
        | "partial"
        | "unpaid"
        | "credit";
      label: string;
      title?: string;
    }>;
  } | null>(null);

  // Mutations
  const updateAppointment = useAction(api.gabinet.appointments.update);
  const queryClient = useQueryClient();

  // DnD sensors — split mouse vs touch so taps still open the preview on iOS
  // (issue #1766 follow-up). The previous PointerSensor with `distance: 5`
  // combined with `touch-none` on the card meant any finger micro-movement
  // during a tap crossed the threshold and activated drag instead of click,
  // so users could never tap to open the preview popover and "see what's in
  // the window". Mouse keeps the snappy 5px-distance activation; touch uses a
  // 200ms press-and-hold with 5px tolerance, so quick taps fall through to
  // the card button's onClick (preview opens) and only a deliberate hold
  // starts a drag.
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    }),
  );

  // Compute date range based on view mode
  const { startDate, endDate } = useMemo(() => {
    if (viewMode === "day") {
      const ds = formatDateStr(currentDate);
      return { startDate: ds, endDate: ds };
    }
    if (viewMode === "week") {
      const monday = getMonday(currentDate);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      return {
        startDate: formatDateStr(monday),
        endDate: formatDateStr(sunday),
      };
    }
    // month
    const first = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1,
    );
    const last = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0,
    );
    return { startDate: formatDateStr(first), endDate: formatDateStr(last) };
  }, [viewMode, currentDate]);

  // Fetch appointments from Supabase
  const { data: rawAppointments } = useSupabaseGabinetAppointmentsByDateRange(
    organizationId,
    startDate,
    endDate,
    {
      employeeId:
        employeeFilter !== "all" ? employeeFilter : undefined,
    },
  );

  // Fetch Google-synced blocked time slots from scheduledActivities
  const blockedTimeRange = useMemo(() => {
    const s = new Date(startDate + "T00:00:00");
    const e = new Date(endDate + "T23:59:59");
    return { startTs: s.getTime(), endTs: e.getTime() };
  }, [startDate, endDate]);

  const { data: blockedTimeActivities } = useSupabaseScheduledActivitiesByDateRange(
    organizationId,
    blockedTimeRange.startTs,
    blockedTimeRange.endTs,
    { moduleFilter: "gabinet" },
  );

  // Fetch employees for filter from Supabase
  const { data: employees } = useSupabaseGabinetEmployeesList(
    organizationId,
    { activeOnly: true },
  );

  // Fetch locations for filter from Supabase
  const { data: locationsRaw } = useSupabaseGabinetLocationsList(organizationId);
  const locations = useMemo(
    () => (locationsRaw ?? []).filter((l) => l.isActive),
    [locationsRaw],
  );

  // Fetch members for name resolution
  const { data: members } = useSupabaseOrganizationMembers(organizationId);

  // Fetch patients from Supabase (flat list, replaces paginated Convex query)
  const { data: patients } = useSupabaseGabinetPatientsList(
    organizationId,
    { limit: 200 },
  );
  // Fetch treatments from Supabase (flat list, replaces paginated Convex query)
  const { data: treatments } = useSupabaseGabinetTreatmentsList(
    organizationId,
    { limit: 200 },
  );
  const { data: allVariants } = useSupabaseGabinetAllTreatmentVariants(organizationId);

  // Fetch employee schedules from Supabase
  const { data: employeeSchedulesRaw } = useSupabaseGabinetEmployeeSchedulesList(
    organizationId,
  );

  // Fetch clinic working hours from Supabase
  const { data: clinicWorkingHours } = useSupabaseGabinetWorkingHoursList(organizationId);

  const patientMap = useMemo(() => {
    const map = new Map<string, string>();
    if (patients) {
      for (const p of patients) {
        map.set(p._id, `${p.firstName} ${p.lastName}`);
      }
    }
    return map;
  }, [patients]);

  const treatmentMap = useMemo(() => {
    const map = new Map<string, { name: string; color?: string; price: number }>();
    if (treatments) {
      for (const tr of treatments) {
        map.set(tr._id, {
          name: tr.name,
          color: tr.color,
          price: typeof tr.price === "number" ? tr.price : 0,
        });
      }
    }
    return map;
  }, [treatments]);

  const variantMap = useMemo(() => {
    const map = new Map<string, string>();
    if (allVariants) {
      for (const v of allVariants) {
        map.set(v._id, v.name);
      }
    }
    return map;
  }, [allVariants]);

  // Fetch tag definitions to render colored pills on appointment cards
  const { tags: tagDefinitions } = useTagDefinitions(organizationId);

  // Event-type categories (gabinetEvent) — drives the picker in EventDialog and
  // the lookup that colors event tiles on the calendar (issue #1555).
  const { categories: eventTypeCategories } = useCategoryDefinitions(
    organizationId,
    "gabinetEvent",
  );
  const eventTypeColorMap = useMemo(() => {
    const map = new Map<string, { name: string; color?: string }>();
    for (const cat of (eventTypeCategories ?? []) as Array<{
      _id?: string;
      name?: string;
      color?: string;
    }>) {
      if (cat?._id) {
        map.set(String(cat._id), {
          name: String(cat.name ?? ""),
          color: cat.color ? String(cat.color) : undefined,
        });
      }
    }
    return map;
  }, [eventTypeCategories]);
  const tagMap = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    for (const tag of tagDefinitions ?? []) {
      if (tag?._id) {
        map.set(String(tag._id), {
          name: String(tag.name ?? ""),
          color: String(tag.color ?? "#9ca3af"),
        });
      }
    }
    return map;
  }, [tagDefinitions]);

  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    members?.forEach((m) => {
      if (m.user) {
        map.set(m.userId, m.user.name || m.user.email || "");
      }
    });
    return map;
  }, [members]);

  // userId -> per-employee color (hex). Drives the calendar's per-employee
  // shading so every appointment for the same employee reads as a variation
  // of one hue (issue #1019). Employees without an assigned color are simply
  // omitted; the appointment then falls back to its treatment color or the
  // status-only palette.
  const employeeColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const emp of employees ?? []) {
      if (emp.color) map.set(emp.userId, emp.color);
    }
    return map;
  }, [employees]);

  // Build schedule map for the filtered employee (or all employees)
  const employeeSchedules = useMemo(() => {
    const map = new Map<
      string,
      {
        startTime: string;
        endTime: string;
        breakStart?: string;
        breakEnd?: string;
      }
    >();

    // If filtering by specific employee, use their schedule
    if (employeeFilter !== "all" && employeeSchedulesRaw) {
      const empSchedules = employeeSchedulesRaw.filter(
        (s) => s.userId === employeeFilter,
      );
      for (const s of empSchedules) {
        if (s.isWorking) {
          map.set(`${s.dayOfWeek}`, {
            startTime: s.startTime,
            endTime: s.endTime,
            breakStart: s.breakStart,
            breakEnd: s.breakEnd,
          });
        }
      }
    } else if (clinicWorkingHours) {
      // Otherwise use clinic default working hours
      for (const wh of clinicWorkingHours) {
        if (wh.isOpen) {
          map.set(`${wh.dayOfWeek}`, {
            startTime: wh.startTime,
            endTime: wh.endTime,
            breakStart: wh.breakStart,
            breakEnd: wh.breakEnd,
          });
        }
      }
    }

    return map;
  }, [employeeFilter, employeeSchedulesRaw, clinicWorkingHours]);

  // Get working hours for day view (today's schedule).
  // dayOfWeek is stored as Sun=0..Sat=6 (matches Date.getDay()) — see
  // convex/gabinet/_availability_supabase.ts and the timetable settings page.
  // Issue #1205.
  const dayWorkingHours = useMemo(() => {
    if (viewMode !== "day") return null;
    const dow = new Date(currentDate).getDay();
    return employeeSchedules.get(`${dow}`) ?? null;
  }, [viewMode, currentDate, employeeSchedules]);

  // Approved leaves for the filtered employee — used to overlay leave blocks
  // on the calendar grid so admins can spot conflicts without opening the
  // appointment dialog. Skipped when "all" employees is selected because the
  // grid then shows everyone's appointments and a single overlay would be
  // ambiguous. Issue #693.
  const employeeLeaveFilter = employeeFilter !== "all" ? employeeFilter : undefined;
  const { data: employeeLeavesRaw } = useSupabaseGabinetLeavesList(
    organizationId,
    {
      userId: employeeLeaveFilter,
      status: "approved",
      enabled: !!employeeLeaveFilter,
    },
  );

  // The "day by employee" view (day view + Wszyscy pracownicy) shows a column
  // per employee, so we need leaves for every employee on the visible day.
  // Issue #1013.
  const isDayByEmployeeView = viewMode === "day" && employeeFilter === "all";
  const { data: allLeavesRaw } = useSupabaseGabinetLeavesList(organizationId, {
    status: "approved",
    enabled: isDayByEmployeeView,
  });

  // Build date -> leave info map for the visible range. A multi-day leave is
  // expanded so each covered date carries the same per-day time window.
  const leavesByDate = useMemo(() => {
    const map = new Map<string, { startTime?: string; endTime?: string }>();
    if (!employeeLeaveFilter || !employeeLeavesRaw) return map;
    for (const leave of employeeLeavesRaw) {
      if (leave.endDate < startDate || leave.startDate > endDate) continue;
      const from = leave.startDate < startDate ? startDate : leave.startDate;
      const to = leave.endDate > endDate ? endDate : leave.endDate;
      const d = new Date(from + "T00:00:00");
      const e = new Date(to + "T00:00:00");
      while (d.getTime() <= e.getTime()) {
        const ds = formatDateStr(d);
        // First write wins so an existing partial-day leave isn't overwritten by
        // a later full-day one.
        if (!map.has(ds)) {
          map.set(ds, { startTime: leave.startTime, endTime: leave.endTime });
        }
        d.setDate(d.getDate() + 1);
      }
    }
    return map;
  }, [employeeLeaveFilter, employeeLeavesRaw, startDate, endDate]);

  const leaveDates = useMemo(
    () => new Set(leavesByDate.keys()),
    [leavesByDate],
  );

  // For the day-by-employee view: map userId -> leave window covering the
  // selected day (or null if none). Computed only when this view is active.
  const dayLeaveByEmployee = useMemo(() => {
    const map = new Map<string, { startTime?: string; endTime?: string }>();
    if (!isDayByEmployeeView || !allLeavesRaw) return map;
    const target = formatDateStr(currentDate);
    for (const leave of allLeavesRaw) {
      if (leave.endDate < target || leave.startDate > target) continue;
      // First write wins to preserve a partial-day window over a full-day one.
      if (!map.has(leave.userId)) {
        map.set(leave.userId, {
          startTime: leave.startTime,
          endTime: leave.endTime,
        });
      }
    }
    return map;
  }, [isDayByEmployeeView, allLeavesRaw, currentDate]);

  // Dates with at least one non-cancelled appointment requiring (but not yet
  // confirmed) prepayment — surfaces the "$" indicator on the month view so
  // users can spot unpaid bookings at a glance.
  const paymentDueDates = useMemo(() => {
    const set = new Set<string>();
    if (!rawAppointments) return set;
    for (const a of rawAppointments) {
      if (a.status === "cancelled") continue;
      if (a.prepaymentRequired && a.prepaymentStatus !== "paid") {
        set.add(a.date);
      }
    }
    return set;
  }, [rawAppointments]);

  // Distinct patient + package usage + recurring group + appointment IDs
  // from the rendered range — used to compute the "first visit", "visit X/Y",
  // and paid/partial/unpaid indicators on appointment cards.
  const indicatorLookupIds = useMemo(() => {
    const patientIds = new Set<string>();
    const packageUsageIds = new Set<string>();
    const recurringGroupIds = new Set<string>();
    const appointmentIds = new Set<string>();
    for (const a of rawAppointments ?? []) {
      if (a.patientId) patientIds.add(a.patientId);
      if (a.packageUsageId) packageUsageIds.add(a.packageUsageId);
      if (a.recurringGroupId) recurringGroupIds.add(a.recurringGroupId);
      // Only payable appointments contribute to the paid/unpaid indicator
      // lookup. Cancelled appointments can't be paid by definition.
      if (a.status !== "cancelled" && a.treatmentId) appointmentIds.add(a._id);
    }
    return {
      patientIds: Array.from(patientIds),
      packageUsageIds: Array.from(packageUsageIds),
      recurringGroupIds: Array.from(recurringGroupIds),
      appointmentIds: Array.from(appointmentIds),
    };
  }, [rawAppointments]);

  const { data: firstAppointmentIds } =
    useSupabaseGabinetFirstAppointmentIdsByPatient(
      organizationId,
      indicatorLookupIds.patientIds,
    );

  const { data: packagePositions } =
    useSupabaseGabinetAppointmentPackagePositions(
      organizationId,
      indicatorLookupIds.packageUsageIds,
    );

  const { data: recurringPositions } =
    useSupabaseGabinetAppointmentRecurringPositions(
      organizationId,
      indicatorLookupIds.recurringGroupIds,
    );

  // Aggregated completed-payment totals per appointment — drives the
  // paid/partial/unpaid tile indicator (issue #1040).
  const { data: appointmentPaymentTotals } =
    useSupabaseGabinetAppointmentPaymentTotals(
      organizationId,
      indicatorLookupIds.appointmentIds,
    );

  // Patient credit balances (only patients with balance > 0). Used to render
  // the "Saldo +X" tile + month-day indicator on each patient's next unpaid
  // visit (issue #1286). Carry-forward credit comes from #1059.
  const { data: patientCreditBalances } =
    useSupabaseGabinetPatientCreditBalances(
      organizationId,
      indicatorLookupIds.patientIds,
    );

  // For each patient with credit > 0, mark every non-cancelled, not-fully-paid
  // visit in the visible range with the "Saldo +X" badge. Originally only the
  // earliest visit was flagged (#1286), but staff reported (#1857) that the
  // indicator must remain on every upcoming visit until the credit is actually
  // consumed — otherwise a patient with overpayment from one service had no
  // visible reminder on subsequent visits booked for other services.
  const creditByAppointmentId = useMemo(() => {
    const result = new Map<string, number>();
    if (!rawAppointments || !patientCreditBalances || patientCreditBalances.size === 0) {
      return result;
    }
    for (const a of rawAppointments) {
      if (a.status === "cancelled" || a.status === "no_show") continue;
      const balance = patientCreditBalances.get(a.patientId);
      if (!balance || balance <= 0) continue;
      const treatment = treatmentMap.get(a.treatmentId as string);
      const price = treatment?.price ?? 0;
      if (price <= 0) continue;
      const paid = appointmentPaymentTotals?.get(a._id) ?? 0;
      if (paid >= price) continue; // already settled
      result.set(a._id, balance);
    }
    return result;
  }, [rawAppointments, patientCreditBalances, treatmentMap, appointmentPaymentTotals]);

  // Dates carrying at least one credit-flagged appointment — feeds the month
  // view's day-level "Saldo" dot (issues #1286, #1857).
  const creditDates = useMemo(() => {
    const set = new Set<string>();
    if (!rawAppointments || creditByAppointmentId.size === 0) return set;
    for (const a of rawAppointments) {
      if (creditByAppointmentId.has(a._id)) set.add(a.date);
    }
    return set;
  }, [rawAppointments, creditByAppointmentId]);

  // Transform and filter appointments for view components
  const viewAppointments = useMemo(() => {
    type Indicator = {
      kind:
        | "firstVisit"
        | "payment"
        | "count"
        | "paid"
        | "partial"
        | "unpaid"
        | "credit";
      label: string;
      title?: string;
    };
    const items: Array<{
      _id: string;
      date: string;
      startTime: string;
      endTime: string;
      patientName: string;
      treatmentName: string;
      variantName?: string;
      status: string;
      color?: string;
      employeeId?: string;
      tags?: Array<{ name: string; color: string }>;
      indicators?: Indicator[];
      employeeCount?: number;
      employeeNames?: string[];
    }> = [];

    if (rawAppointments) {
      const searchLower = clientSearch.toLowerCase().trim();
      for (const a of rawAppointments) {
        if (treatmentFilter !== "all" && a.treatmentId !== treatmentFilter) continue;
        if (statusFilter !== "all" && a.status !== statusFilter) continue;
        if (locationFilter !== "all" && a.locationId !== locationFilter) continue;
        if (searchLower) {
          const name = patientMap.get(a.patientId) ?? "";
          if (!name.toLowerCase().includes(searchLower)) continue;
        }
        const treatment = treatmentMap.get(a.treatmentId as string);
        const tags = a.tagIds
          ?.map((id) => tagMap.get(String(id)))
          .filter((t): t is { name: string; color: string } => !!t);

        const indicators: Indicator[] = [];

        // First-visit badge — only for non-cancelled appointments, and only if
        // this is the patient's earliest known appointment.
        if (
          a.status !== "cancelled" &&
          a.status !== "no_show" &&
          firstAppointmentIds?.has(a._id)
        ) {
          indicators.push({
            kind: "firstVisit",
            label: "1",
            title: t(
              "gabinet.calendar.indicators.firstVisit",
              "Pierwsza wizyta",
            ),
          });
        }

        // Payment-due badge — prepayment required but not yet paid.
        if (a.prepaymentRequired && a.prepaymentStatus !== "paid") {
          indicators.push({
            kind: "payment",
            label: "$",
            title: t(
              "gabinet.calendar.indicators.paymentDue",
              "Do zapłacenia",
            ),
          });
        }

        // Visit-number badge — package position takes precedence over the
        // recurring index. Falls back to the recurring rule's count when the
        // appointment is part of a recurring series.
        const pkgPos = a.packageUsageId
          ? packagePositions?.get(a._id)
          : undefined;
        if (pkgPos) {
          indicators.push({
            kind: "count",
            label: `${pkgPos.position}/${pkgPos.total}`,
            title: t(
              "gabinet.calendar.indicators.packageVisit",
              "Wizyta pakietowa",
            ),
          });
        } else if (a.isRecurring && a.recurringRule) {
          const rule = a.recurringRule as { count?: number };
          if (typeof rule.count === "number" && rule.count > 0) {
            // Prefer the dynamically-computed chronological position so the
            // "X/Y" indicator reflects the current order after a recurring
            // occurrence is rescheduled (issue #1032). Fall back to the
            // stored `recurringIndex` when the group has no live position
            // (e.g. cancelled, no recurringGroupId, or hook not loaded).
            const dynamicPos = a.recurringGroupId
              ? recurringPositions?.get(a._id)
              : undefined;
            const pos = dynamicPos ?? (a.recurringIndex ?? 0) + 1;
            indicators.push({
              kind: "count",
              label: `${pos}/${rule.count}`,
              title: t(
                "gabinet.calendar.indicators.recurringVisit",
                "Wizyta cykliczna",
              ),
            });
          }
        }

        // Patient credit indicator — flags every unpaid visit while the
        // patient has carry-forward credit available (issue #1857, originally
        // only the next visit per #1286; ledger from #1059). Shown alongside
        // the unpaid/partial badge so staff know credit is sitting ready to
        // be applied at settle time, on whichever visit they settle next.
        const creditBalance = creditByAppointmentId.get(a._id);
        if (creditBalance && creditBalance > 0) {
          // Round to whole units for the compact pill so the badge stays
          // legible at the small tile size. Tooltip shows the precise amount.
          indicators.push({
            kind: "credit",
            label: `+${Math.round(creditBalance)}`,
            title: t("gabinet.calendar.indicators.credit", {
              defaultValue: "Saldo {{amount}} do wykorzystania",
              amount: creditBalance.toFixed(2),
            }),
          });
        }

        // Paid / partial / unpaid indicator — surfaces the visit's payment
        // settlement state directly on the tile so staff can spot unpaid
        // completed visits without opening each one (issue #1040). Mirrors
        // the badge logic in appointment-preview-content.tsx: only counts
        // completed payments (pending ones are auto-created at booking and
        // mustn't be treated as receipts). Skipped for cancelled visits and
        // visits whose treatment has no price.
        const treatmentPrice = treatment?.price ?? 0;
        if (a.status !== "cancelled" && treatmentPrice > 0) {
          const paid = appointmentPaymentTotals?.get(a._id) ?? 0;
          if (paid >= treatmentPrice) {
            indicators.push({
              kind: "paid",
              label: "✓",
              title: t(
                "gabinet.calendar.indicators.paid",
                "Wizyta opłacona",
              ),
            });
          } else if (paid > 0) {
            indicators.push({
              kind: "partial",
              label: "½",
              title: t(
                "gabinet.calendar.indicators.partial",
                "Częściowo opłacona",
              ),
            });
          } else {
            indicators.push({
              kind: "unpaid",
              label: "!",
              title: t(
                "gabinet.calendar.indicators.unpaid",
                "Wizyta nieopłacona",
              ),
            });
          }
        }

        const variantName = a.variantId ? variantMap.get(a.variantId) : undefined;
        items.push({
          _id: a._id,
          date: a.date,
          startTime: a.startTime,
          endTime: a.endTime,
          patientName: patientMap.get(a.patientId) ?? "",
          treatmentName: treatment?.name ?? "",
          variantName,
          status: a.status,
          // Per-appointment override wins, then the employee's assigned color
          // (issue #1019), then treatment color as a final fallback.
          color:
            a.color ??
            employeeColorMap.get(a.employeeId) ??
            treatment?.color,
          employeeId: a.employeeId,
          tags: tags && tags.length > 0 ? tags : undefined,
          indicators: indicators.length > 0 ? indicators : undefined,
        });
      }
    }

    // Merge non-appointment scheduledActivities that block calendar time:
    //   - Google-synced blocks (sourceType="google", no gabinetAppointment row)
    //   - Manual gabinet events (moduleRef.entityType="gabinetEvent",
    //     issue #1555 — meetings, training etc.)
    if (blockedTimeActivities) {
      const appointmentActivityIds = new Set(
        rawAppointments?.map((a) => a.scheduledActivityId).filter(Boolean) ?? [],
      );
      for (const act of blockedTimeActivities) {
        // Skip activities that already have a gabinet appointment (avoid duplicates)
        if (appointmentActivityIds.has(act._id)) continue;

        const isGoogleBlock = act.sourceType === "google";
        const isManualEvent =
          act.moduleRef?.entityType === "gabinetEvent";
        if (!isGoogleBlock && !isManualEvent) continue;

        const dt = new Date(act.dueDate);
        const endDt = act.endDate ? new Date(act.endDate) : dt;
        const date = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
        const startTime = `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
        const endTime = `${String(endDt.getHours()).padStart(2, "0")}:${String(endDt.getMinutes()).padStart(2, "0")}`;

        const eventType = act.categoryId
          ? eventTypeColorMap.get(String(act.categoryId))
          : undefined;
        const subtitle = isManualEvent
          ? eventType?.name ?? t("gabinet.events.label", "Zdarzenie")
          : t("gabinet.calendar.googleEvent");

        items.push({
          _id: act._id,
          date,
          startTime,
          endTime,
          patientName: act.title ?? t("gabinet.calendar.blockedTime"),
          treatmentName: subtitle,
          status: "blocked",
          color: eventType?.color ?? "#9ca3af",
          employeeId: act.resourceId,
        });
      }
    }

    return items;
  }, [rawAppointments, blockedTimeActivities, patientMap, treatmentMap, variantMap, tagMap, employeeColorMap, eventTypeColorMap, firstAppointmentIds, packagePositions, recurringPositions, appointmentPaymentTotals, creditByAppointmentId, treatmentFilter, statusFilter, locationFilter, clientSearch, t]);

  // Collapse blocked-time events that target multiple employees into a single
  // tile for views that don't break the day into per-employee columns
  // (week, day-all-employees, month). The EventDialog writes one
  // scheduledActivity per selected employee — correct for the day-by-employee
  // view, but in the other views the same event appears as N stacked
  // duplicates. We group by date+time+title+subtitle+color and keep the first
  // _id as the canonical row so drag/resize handlers still resolve to a real
  // activity. The badge + tooltip show "N pracowników" with the full name list
  // (issue #1694).
  const aggregatedAppointments = useMemo(() => {
    const out: typeof viewAppointments = [];
    const groups = new Map<string, number>(); // key -> index in `out`
    for (const a of viewAppointments) {
      if (a.status !== "blocked") {
        out.push(a);
        continue;
      }
      const key = `${a.date}|${a.startTime}|${a.endTime}|${a.patientName}|${a.treatmentName}|${a.color ?? ""}`;
      const existingIdx = groups.get(key);
      const employeeName = a.employeeId ? userMap.get(a.employeeId) : undefined;
      if (existingIdx === undefined) {
        out.push({
          ...a,
          employeeCount: 1,
          employeeNames: employeeName ? [employeeName] : [],
        });
        groups.set(key, out.length - 1);
      } else {
        const existing = out[existingIdx];
        existing.employeeCount = (existing.employeeCount ?? 1) + 1;
        if (employeeName) {
          existing.employeeNames = [
            ...(existing.employeeNames ?? []),
            employeeName,
          ];
        }
      }
    }
    return out;
  }, [viewAppointments, userMap]);

  // Build print-friendly appointment data for the current day
  const printDate = formatDateStr(currentDate);
  const printAppointments = useMemo(() => {
    if (!rawAppointments) return [];
    const dayAppts = rawAppointments.filter((a) => a.date === printDate);
    return dayAppts.map((a) => {
      const treatment = treatmentMap.get(a.treatmentId as string);
      return {
        startTime: a.startTime,
        endTime: a.endTime,
        patientName: patientMap.get(a.patientId) ?? "",
        treatmentName: treatment?.name ?? "",
        employeeName: userMap.get(a.employeeId) ?? "",
        status: a.status,
      };
    });
  }, [rawAppointments, printDate, patientMap, treatmentMap, userMap]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  // Listen for print dispatch from footer
  useSidebarDispatch("printSchedule", handlePrint);

  // Navigation
  const navigateDate = useCallback(
    (dir: number) => {
      setCurrentDate((prev) => {
        const d = new Date(prev);
        if (viewMode === "day") d.setDate(d.getDate() + dir);
        else if (viewMode === "week") d.setDate(d.getDate() + dir * 7);
        else d.setMonth(d.getMonth() + dir);
        return d;
      });
    },
    [viewMode],
  );

  const goToday = () => setCurrentDate(new Date());

  // Opens the create-appointment dialog with the current date pre-filled.
  // Shared by the mobile and desktop "+" buttons so both spawn the same dialog.
  const openCreateDialog = useCallback(() => {
    setCreateDefaultDate(formatDateStr(currentDate));
    setCreateDefaultTime(undefined);
    setCreateDefaultEndTime(undefined);
    setCreateDefaultUserId(undefined);
    setCreateDialogOpen(true);
  }, [currentDate]);

  // Opens the create-event dialog (non-patient calendar block — e.g.
  // meeting/training that blocks time in the calendar, issue #1555).
  const openCreateEventDialog = useCallback(() => {
    setCreateDefaultDate(formatDateStr(currentDate));
    setCreateDefaultTime(undefined);
    setCreateDefaultEndTime(undefined);
    setCreateDefaultUserId(undefined);
    setEventDialogOpen(true);
  }, [currentDate]);

  // Sidebar dispatch handlers
  useSidebarDispatch("goToToday", goToday);
  useSidebarDispatch("openFilter", () => setFilterOpen(true));
  useSidebarDispatch("manageTags", () => setTagsSlideoutOpen(true));
  // Route the sidebar/footer "Add appointment" entries to the same dialog
  // used by the toolbar's "Nowa wizyta" button so all entry points behave
  // identically on the calendar page (issue #1502).
  useSidebarDispatch("openCreateAppointment", openCreateDialog);
  useSidebarDispatch("openCreateEvent", openCreateEventDialog);

  // ?action=sell-package opens the sell package side panel after navigation
  // from the gabinet quick-actions dropdown (issue #1236).
  // ?action=create-appointment opens the AppointmentDialog so off-calendar
  // entry points (dashboard pageContext, footer, quick-actions dropdown)
  // converge on the same flow as the toolbar button (issue #1506).
  // Clear the param after consuming so a refresh doesn't reopen it.
  useEffect(() => {
    if (actionParam === "sell-package") {
      setSellPackageOpen(true);
    } else if (actionParam === "create-appointment") {
      openCreateDialog();
    } else {
      return;
    }
    routeNavigate({
      to: "/dashboard/gabinet/calendar",
      search: { nudge: nudgeFilter, action: undefined },
      replace: true,
    });
  }, [actionParam, nudgeFilter, routeNavigate, openCreateDialog]);

  // Click-to-create handler
  const handleSlotClick = useCallback(
    (dateOrTime: string, time?: string) => {
      // Day view passes just time, week view passes date + time
      if (time) {
        setCreateDefaultDate(dateOrTime);
        setCreateDefaultTime(time);
      } else {
        setCreateDefaultDate(formatDateStr(currentDate));
        setCreateDefaultTime(dateOrTime);
      }
      setCreateDefaultEndTime(undefined);
      setCreateDefaultUserId(undefined);
      setCreateDialogOpen(true);
    },
    [currentDate],
  );

  // Drag-to-create handler (sets both start and end time)
  const handleSlotDragSelect = useCallback(
    (date: string, startTime: string, endTime: string) => {
      setCreateDefaultDate(date);
      setCreateDefaultTime(startTime);
      setCreateDefaultEndTime(endTime);
      setCreateDefaultUserId(undefined);
      setCreateDialogOpen(true);
    },
    [],
  );

  // Click-to-create for the day-by-employee view — pre-selects the employee
  // whose column was clicked so the user doesn't have to choose again.
  const handleEmployeeSlotClick = useCallback(
    (date: string, time: string, employeeId: string) => {
      setCreateDefaultDate(date);
      setCreateDefaultTime(time);
      setCreateDefaultEndTime(undefined);
      setCreateDefaultUserId(employeeId);
      setCreateDialogOpen(true);
    },
    [],
  );

  const handleEmployeeSlotDragSelect = useCallback(
    (date: string, startTime: string, endTime: string, employeeId: string) => {
      setCreateDefaultDate(date);
      setCreateDefaultTime(startTime);
      setCreateDefaultEndTime(endTime);
      setCreateDefaultUserId(employeeId);
      setCreateDialogOpen(true);
    },
    [],
  );

  const handleDayClick = useCallback((date: string) => {
    setCurrentDate(new Date(date + "T00:00:00"));
    setViewMode("day");
  }, []);

  // Resize handler (called when user drags an appointment's bottom edge)
  const handleAppointmentResize = useCallback(
    async (id: string, newEndTime: string) => {
      try {
        await updateAppointment({
          organizationId,
          appointmentId: id as Id<"gabinetAppointments">,
          endTime: newEndTime,
        });
        toast.success(
          t("gabinet.appointments.resized", "Appointment resized"),
        );
        void queryClient.invalidateQueries({
          queryKey: supabaseKeys.gabinetAppointments.all,
        });
      } catch (e) {
        toast.error(
          formatAppointmentError(e, t, {
            key: "gabinet.appointments.resizeFailed",
            defaultValue: "Nie udało się zmienić długości wizyty.",
          }),
        );
      }
    },
    [organizationId, updateAppointment, queryClient, t],
  );

  // DnD handlers
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { active } = event;
      const appt = viewAppointments.find((a) => a._id === active.id);
      if (appt) {
        setActiveAppointment(appt);
      }
    },
    [viewAppointments],
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveAppointment(null);

      if (!over) return;

      const appointmentId = active.id as string;
      const dropData = over.data.current;

      if (dropData?.type === "time-slot") {
        const newDate = dropData.date as string;
        const newStartTime = dropData.time as string;

        // Find the original appointment to calculate duration
        const originalAppt = viewAppointments.find(
          (a) => a._id === appointmentId,
        );
        if (!originalAppt) return;

        // Google-synced blocked-time entries are not real gabinetAppointments;
        // attempting to update them would 404 server-side. Reject silently.
        if (originalAppt.status === "blocked") {
          toast.error(
            t(
              "gabinet.appointments.errors.blockedNotDraggable",
              "Wydarzeń z Google nie można przesuwać w kalendarzu.",
            ),
          );
          return;
        }

        // Calculate new end time based on original duration
        const [startH, startM] = originalAppt.startTime.split(":").map(Number);
        const [endH, endM] = originalAppt.endTime.split(":").map(Number);
        const durationMinutes = endH * 60 + endM - (startH * 60 + startM);

        const [newStartH, newStartM] = newStartTime.split(":").map(Number);
        const newEndMinutes = newStartH * 60 + newStartM + durationMinutes;
        const newEndH = Math.floor(newEndMinutes / 60);
        const newEndM = newEndMinutes % 60;
        const newEndTime = `${String(newEndH).padStart(2, "0")}:${String(newEndM).padStart(2, "0")}`;

        // The day-by-employee view tags each slot with the column owner so
        // dropping into a different employee's column reassigns the visit.
        const targetEmployeeId =
          typeof dropData.employeeId === "string" && dropData.employeeId
            ? (dropData.employeeId as string)
            : undefined;
        const reassign =
          targetEmployeeId !== undefined &&
          targetEmployeeId !== originalAppt.employeeId;

        try {
          await updateAppointment({
            organizationId,
            appointmentId: appointmentId as Id<"gabinetAppointments">,
            date: newDate,
            startTime: newStartTime,
            endTime: newEndTime,
            ...(reassign ? { employeeId: targetEmployeeId } : {}),
          });
          toast.success(
            t("gabinet.appointments.rescheduled", "Appointment rescheduled"),
          );
          // Invalidate Supabase appointments cache after Convex mutation
          void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetAppointments.all });
        } catch (e) {
          toast.error(
            formatAppointmentError(e, t, {
              key: "gabinet.appointments.rescheduleFailed",
              defaultValue: "Nie udało się przenieść wizyty.",
            }),
          );
        }
      }
    },
    [organizationId, updateAppointment, viewAppointments, queryClient, t],
  );

  // Title
  const title = useMemo(() => {
    const locale = i18n.language;
    if (viewMode === "day") {
      return currentDate.toLocaleDateString(locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    }
    if (viewMode === "week") {
      const monday = getMonday(currentDate);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      return `${monday.toLocaleDateString(locale, { month: "short", day: "numeric" })} – ${sunday.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })}`;
    }
    return currentDate.toLocaleDateString(locale, {
      month: "long",
      year: "numeric",
    });
  }, [currentDate, viewMode, i18n.language]);

  // Active filter count (excluding employee which is the primary filter)
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (treatmentFilter !== "all") count++;
    if (statusFilter !== "all") count++;
    if (locationFilter !== "all") count++;
    if (clientSearch.trim()) count++;
    return count;
  }, [treatmentFilter, statusFilter, locationFilter, clientSearch]);

  const clearAllFilters = useCallback(() => {
    setEmployeeFilter("all");
    setTreatmentFilter("all");
    setStatusFilter("all");
    setLocationFilter("all");
    setClientSearch("");
  }, []);

  const statusOptions = [
    "scheduled",
    "confirmed",
    "in_progress",
    "completed",
    "cancelled",
    "no_show",
  ] as const;

  function getEmployeeName(emp: {
    firstName?: string;
    lastName?: string;
    userId: string;
    specialization?: string;
    role: string;
  }) {
    if (emp.firstName || emp.lastName) {
      return `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim();
    }
    return userMap.get(emp.userId) || emp.specialization || emp.role;
  }

  function getEmployeeInitials(name: string): string {
    return name
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  // Columns for the day-by-employee view. Each column carries the employee's
  // working schedule for the visible day and any approved leave overlapping it
  // so the grid can paint closed-hours and leave overlays per column.
  const dayByEmployeeColumns: DayByEmployeeColumn[] = useMemo(() => {
    if (!isDayByEmployeeView) return [];
    // dayOfWeek is stored as Sun=0..Sat=6 (matches Date.getDay()). Issue #1205.
    const dow = new Date(currentDate).getDay();
    // Hide employees flagged as not visible in the calendar (issue #1859).
    // Older rows without the column default to true at the DB level, so
    // anything strictly === false is the only thing to exclude.
    const list = (employees ?? []).filter((e) => e.showInCalendar !== false);
    return list.map((emp) => {
      const name = getEmployeeName(emp);
      const initials = getEmployeeInitials(name);
      const sched = (employeeSchedulesRaw ?? []).find(
        (s) => s.userId === emp.userId && s.dayOfWeek === dow && s.isWorking,
      );
      return {
        userId: emp.userId,
        name,
        initials,
        schedule: sched
          ? {
              startTime: sched.startTime,
              endTime: sched.endTime,
              breakStart: sched.breakStart,
              breakEnd: sched.breakEnd,
            }
          : null,
        leave: dayLeaveByEmployee.get(emp.userId) ?? null,
      };
    });
    // userMap is captured by getEmployeeName via closure; depend on it so
    // names refresh once members load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isDayByEmployeeView,
    currentDate,
    employees,
    employeeSchedulesRaw,
    dayLeaveByEmployee,
    userMap,
  ]);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Top-level tab switcher: Kalendarz | Lista rezerwowa */}
        <div className="flex shrink-0 border-b bg-background px-4">
          {(["calendar", "waitlist"] as const).map((tab) => (
            <button
              key={tab}
              className={cn(
                "border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                calendarTab === tab
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setCalendarTab(tab)}
            >
              {tab === "calendar"
                ? t("gabinet.calendar.tab.calendar", "Kalendarz")
                : t("gabinet.calendar.tab.waitlist", "Lista rezerwowa")}
            </button>
          ))}
        </div>

        {calendarTab === "waitlist" ? (
          <div className="flex-1 overflow-auto p-6">
            <EmptyState
              icon={ClipboardList}
              title={t("gabinet.waitlist.empty.title", "Lista rezerwowa jest pusta.")}
              description={t(
                "gabinet.waitlist.empty.description",
                "Tutaj będą widoczni klienci oczekujący na wcześniejszy lub dogodny termin.",
              )}
              action={
                <Button
                  size="sm"
                  disabled
                  title={t("gabinet.waitlist.comingSoon", "Funkcja w przygotowaniu")}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" variant="stroke" />
                  {t("gabinet.waitlist.addToWaitlist", "Dodaj do listy rezerwowej")}
                </Button>
              }
            />
          </div>
        ) : (
          <>
        {nudgeFilter === "unconfirmed-today" && (
          <div className="flex shrink-0 items-center justify-between border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            <span>
              {t("gabinet.calendar.nudgeFilter.unconfirmedToday", {
                defaultValue:
                  "Pokazywane są dzisiejsze wizyty jeszcze niepotwierdzone (status: zaplanowana).",
              })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => {
                setStatusFilter("all");
                routeNavigate({
                  to: "/dashboard/gabinet/calendar",
                  search: { nudge: undefined },
                });
              }}
            >
              <X className="h-3.5 w-3.5" variant="stroke" />
              {t("common.clearFilters")}
            </Button>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex shrink-0 flex-col gap-2 border-b bg-background px-4 py-3">
          {/* Row 1: nav arrows + date title + view switcher + actions.
              On mobile the "+" button is hoisted up to share this row with the
              nav arrows (justify-between) — it otherwise wraps onto its own
              row in the actions group below and steals vertical space. */}
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center justify-between gap-2 md:justify-start">
              <div className="flex min-w-0 items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => navigateDate(-1)}
                  aria-label={t("gabinet.calendar.previousPeriod")}
                >
                  <ChevronLeft className="h-3.5 w-3.5" variant="stroke" />
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={goToday}>
                  {t("gabinet.calendar.today", "Dzis")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => navigateDate(1)}
                  aria-label={t("gabinet.calendar.nextPeriod")}
                >
                  <ChevronRight className="h-3.5 w-3.5" variant="stroke" />
                </Button>
                <h2 className="ml-2 truncate text-xs font-semibold">{title}</h2>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    className="h-7 shrink-0 text-xs md:hidden"
                    aria-label={t("gabinet.calendar.add", "Dodaj")}
                  >
                    <Plus className="h-3.5 w-3.5" variant="stroke" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={openCreateDialog}>
                    {t(
                      "gabinet.appointments.createAppointment",
                      "Nowa wizyta",
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={openCreateEventDialog}>
                    {t("gabinet.events.create", "Nowe zdarzenie")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* View switcher */}
              <div className="flex rounded-md border">
                {(["day", "week", "month"] as const).map((mode) => (
                  <Button
                    key={mode}
                    variant={viewMode === mode ? "default" : "ghost"}
                    size="sm"
                    className="h-7 rounded-none first:rounded-l-md last:rounded-r-md text-xs px-3"
                    onClick={() => setViewMode(mode)}
                  >
                    {t(
                      `gabinet.calendar.view.${mode}`,
                      mode.charAt(0).toUpperCase() + mode.slice(1),
                    )}
                  </Button>
                ))}
              </div>

              {/* Slot size switcher (only meaningful for day/week) */}
              {viewMode !== "month" && (
                <>
                  <div
                    className="hidden rounded-md border sm:flex"
                    aria-label={t("gabinet.calendar.slotSize", "Rozdzielczość")}
                  >
                    {SLOT_OPTIONS.map((opt) => (
                      <Button
                        key={opt}
                        variant={slotMinutes === opt ? "default" : "ghost"}
                        size="sm"
                        className="h-7 rounded-none first:rounded-l-md last:rounded-r-md text-xs px-2"
                        onClick={() => setSlotMinutes(opt)}
                        title={t("gabinet.calendar.slotSize", "Rozdzielczość")}
                      >
                        {opt} min
                      </Button>
                    ))}
                  </div>
                  <Select
                    value={String(slotMinutes)}
                    onValueChange={(v) => setSlotMinutes(Number(v) as SlotMinutes)}
                  >
                    <SelectTrigger
                      className="h-7 w-[88px] text-xs sm:hidden"
                      aria-label={t("gabinet.calendar.slotSize", "Rozdzielczość")}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SLOT_OPTIONS.map((opt) => (
                        <SelectItem key={opt} value={String(opt)} className="text-xs">
                          {opt} min
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}

              {/* Create button — hidden on mobile where it lives next to the
                  date nav (above) to avoid wrapping onto its own row.
                  Split into a DropdownMenu (issue #1555) so the user can pick
                  between a regular appointment and a non-patient event
                  (meeting / training etc.). */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    className="hidden h-7 text-xs md:inline-flex"
                    data-testid="calendar-create-appointment-button"
                  >
                    <Plus className="h-3.5 w-3.5 sm:mr-1" variant="stroke" />
                    <span className="hidden sm:inline">
                      {t("gabinet.calendar.add", "Dodaj")}
                    </span>
                    <ChevronDown
                      className="ml-1 hidden h-3.5 w-3.5 sm:inline"
                      variant="stroke"
                    />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={openCreateDialog}>
                    {t(
                      "gabinet.appointments.createAppointment",
                      "Nowa wizyta",
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={openCreateEventDialog}>
                    {t("gabinet.events.create", "Nowe zdarzenie")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Row 2: employee picker — single-select filter. On mobile we collapse
              the pill row into a dropdown (issue #1235) because the row of
              chips stole a full row of vertical space on phones. */}
          {(employees ?? []).length > 0 && (() => {
            const selectedEmployee =
              employeeFilter === "all"
                ? null
                : (employees ?? []).find((e) => e.userId === employeeFilter);
            const selectedName = selectedEmployee
              ? getEmployeeName(selectedEmployee)
              : t("gabinet.calendar.allEmployees", "Wszyscy pracownicy");
            const selectedInitials = selectedEmployee
              ? getEmployeeInitials(selectedName)
              : null;
            return (
              <>
                {/* Mobile: collapsible dropdown */}
                <div className="sm:hidden">
                  <Popover open={employeePickerOpen} onOpenChange={setEmployeePickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 w-full justify-between text-xs"
                        data-testid="calendar-employee-picker-trigger"
                        aria-label={t("gabinet.calendar.employee", "Pracownik")}
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-1.5">
                          {selectedEmployee ? (
                            <Avatar className="h-5 w-5">
                              <AvatarFallback className="bg-muted text-[10px] font-medium text-muted-foreground">
                                {selectedInitials || "?"}
                              </AvatarFallback>
                            </Avatar>
                          ) : (
                            <Users className="h-3.5 w-3.5 shrink-0" variant="stroke" />
                          )}
                          <span className="truncate">{selectedName}</span>
                        </span>
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" variant="stroke" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[var(--radix-popover-trigger-width)] p-1"
                      align="start"
                    >
                      <div className="max-h-[60vh] overflow-y-auto">
                        <button
                          type="button"
                          onClick={() => {
                            setEmployeeFilter("all");
                            setEmployeePickerOpen(false);
                          }}
                          data-testid="calendar-employee-option-all"
                          className={cn(
                            "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-left hover:bg-muted",
                            employeeFilter === "all" && "bg-muted/70",
                          )}
                        >
                          <Users className="h-3.5 w-3.5 shrink-0" variant="stroke" />
                          <span className="flex-1 truncate">
                            {t("gabinet.calendar.allEmployees", "Wszyscy pracownicy")}
                          </span>
                          {employeeFilter === "all" && (
                            <Check className="h-3.5 w-3.5 shrink-0" variant="stroke" />
                          )}
                        </button>
                        {(employees ?? []).map((emp) => {
                          const name = getEmployeeName(emp);
                          const initials = getEmployeeInitials(name);
                          const selected = employeeFilter === emp.userId;
                          return (
                            <button
                              key={emp._id}
                              type="button"
                              onClick={() => {
                                setEmployeeFilter(emp.userId);
                                setEmployeePickerOpen(false);
                              }}
                              data-testid={`calendar-employee-option-${emp.userId}`}
                              className={cn(
                                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-left hover:bg-muted",
                                selected && "bg-muted/70",
                              )}
                            >
                              <Avatar className="h-5 w-5">
                                <AvatarFallback className="bg-muted text-[10px] font-medium text-muted-foreground">
                                  {initials || "?"}
                                </AvatarFallback>
                              </Avatar>
                              <span className="flex-1 truncate">{name}</span>
                              {selected && (
                                <Check className="h-3.5 w-3.5 shrink-0" variant="stroke" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Desktop: pill row */}
                <div
                  className="-mx-4 hidden flex-nowrap items-center gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex sm:flex-wrap sm:overflow-visible sm:px-0"
                  data-testid="calendar-employee-filter-bar"
                >
                  <button
                    type="button"
                    onClick={() => setEmployeeFilter("all")}
                    aria-pressed={employeeFilter === "all"}
                    data-testid="calendar-employee-pill-all"
                    className={cn(
                      "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
                      employeeFilter === "all"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:bg-muted",
                    )}
                  >
                    <Users className="h-3.5 w-3.5" variant="stroke" />
                    {t("gabinet.calendar.allEmployees", "Wszyscy pracownicy")}
                  </button>
                  {(employees ?? []).map((emp) => {
                    const name = getEmployeeName(emp);
                    const initials = getEmployeeInitials(name);
                    const selected = employeeFilter === emp.userId;
                    return (
                      <button
                        key={emp._id}
                        type="button"
                        onClick={() => setEmployeeFilter(emp.userId)}
                        aria-pressed={selected}
                        title={name}
                        data-testid={`calendar-employee-pill-${emp.userId}`}
                        className={cn(
                          "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border pl-1 pr-2.5 text-xs transition-colors",
                          selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-foreground hover:bg-muted",
                        )}
                      >
                        <Avatar className="h-5 w-5">
                          <AvatarFallback
                            className={cn(
                              "text-[10px] font-medium",
                              selected
                                ? "bg-primary-foreground/20 text-primary-foreground"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {initials || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="max-w-[10rem] truncate">{name}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            );
          })()}

          {/* Filter dialog */}
          <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
            <DialogContent
              ref={filterDrag.contentRef}
              onPointerDown={filterDrag.onPointerDown}
              className={cn(
                "sm:max-w-md",
                filterDrag.isDragging && "cursor-grabbing select-none",
              )}
            >
              <DialogTitle>{t("gabinet.calendar.filters", "Filtry")}</DialogTitle>
              <DialogDescription className="sr-only">
                {t("gabinet.calendar.filters", "Filtry")}
              </DialogDescription>
              <div className="space-y-4 pt-2">
                {/* Client search */}
                <div className="space-y-1.5">
                  <Label>{t("gabinet.calendar.client", "Klient")}</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" variant="stroke" />
                    <Input
                      placeholder={t("gabinet.calendar.searchClient", "Szukaj klienta...")}
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      className="pl-9"
                    />
                    {clientSearch && (
                      <button
                        onClick={() => setClientSearch("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" variant="stroke" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Employee filter */}
                <div className="space-y-1.5">
                  <Label>{t("gabinet.calendar.employee", "Pracownik")}</Label>
                  <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t("gabinet.calendar.allEmployees", "Wszyscy pracownicy")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        {t("gabinet.calendar.allEmployees", "Wszyscy pracownicy")}
                      </SelectItem>
                      {(employees ?? []).map((emp) => (
                        <SelectItem key={emp._id} value={emp.userId}>
                          {getEmployeeName(emp)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Treatment filter */}
                <div className="space-y-1.5">
                  <Label>{t("gabinet.calendar.treatment", "Zabieg")}</Label>
                  <Select value={treatmentFilter} onValueChange={setTreatmentFilter}>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t("gabinet.calendar.allTreatments", "Wszystkie zabiegi")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        {t("gabinet.calendar.allTreatments", "Wszystkie zabiegi")}
                      </SelectItem>
                      {(treatments ?? []).map((tr) => (
                        <SelectItem key={tr._id} value={tr._id}>
                          {tr.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Location filter */}
                {locations.length > 0 && (
                  <div className="space-y-1.5">
                    <Label>{t("gabinet.locations.title", "Lokalizacja")}</Label>
                    <Select value={locationFilter} onValueChange={setLocationFilter}>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={t("gabinet.calendar.allLocations", "Wszystkie lokalizacje")}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          {t("gabinet.calendar.allLocations", "Wszystkie lokalizacje")}
                        </SelectItem>
                        {locations.map((loc) => (
                          <SelectItem key={loc._id} value={loc._id}>
                            <span className="flex items-center gap-2">
                              {loc.color && (
                                <span
                                  className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: loc.color }}
                                />
                              )}
                              {loc.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Status filter */}
                <div className="space-y-1.5">
                  <Label>{t("gabinet.calendar.status", "Status")}</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t("gabinet.calendar.allStatuses", "Wszystkie statusy")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        {t("gabinet.calendar.allStatuses", "Wszystkie statusy")}
                      </SelectItem>
                      {statusOptions.map((s) => (
                        <SelectItem key={s} value={s}>
                          {t(`gabinet.appointments.statuses.${s}`, s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Clear all */}
                {activeFilterCount > 0 && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={clearAllFilters}
                  >
                    <X className="mr-1.5 size-4" variant="stroke" />
                    {t("gabinet.calendar.clearFilters", "Wyczyść filtry")}
                  </Button>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Calendar content */}
        <div className="flex-1 overflow-hidden">
          {viewMode === "day" && isDayByEmployeeView && (
            <CalendarDayByEmployeeView
              date={formatDateStr(currentDate)}
              appointments={viewAppointments}
              employees={dayByEmployeeColumns}
              onSlotClick={handleEmployeeSlotClick}
              onSlotDragSelect={handleEmployeeSlotDragSelect}
              onAppointmentResize={handleAppointmentResize}
              slotMinutes={slotMinutes}
            />
          )}
          {viewMode === "day" && !isDayByEmployeeView && (
            <CalendarDayView
              date={formatDateStr(currentDate)}
              appointments={aggregatedAppointments}
              onSlotClick={(time) =>
                handleSlotClick(formatDateStr(currentDate), time)
              }
              onSlotDragSelect={handleSlotDragSelect}
              onAppointmentResize={handleAppointmentResize}
              workingHours={dayWorkingHours}
              leave={leavesByDate.get(formatDateStr(currentDate)) ?? null}
              slotMinutes={slotMinutes}
            />
          )}
          {viewMode === "week" && (
            <CalendarWeekView
              weekStart={formatDateStr(getMonday(currentDate))}
              appointments={aggregatedAppointments}
              onSlotClick={handleSlotClick}
              onSlotDragSelect={handleSlotDragSelect}
              onAppointmentResize={handleAppointmentResize}
              onDayHeaderClick={handleDayClick}
              selectedDate={formatDateStr(currentDate)}
              employeeSchedules={employeeSchedules}
              leavesByDate={leavesByDate}
              slotMinutes={slotMinutes}
            />
          )}
          {viewMode === "month" && (
            <CalendarMonthView
              year={currentDate.getFullYear()}
              month={currentDate.getMonth()}
              appointments={aggregatedAppointments}
              onDayClick={handleDayClick}
              selectedDate={formatDateStr(currentDate)}
              leaveDates={leaveDates}
              paymentDueDates={paymentDueDates}
              creditDates={creditDates}
            />
          )}
        </div>
          </>
        )}

        {/* Create appointment dialog */}
        <AppointmentDialog
          organizationId={organizationId}
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          defaultDate={createDefaultDate}
          defaultTime={createDefaultTime}
          defaultEndTime={createDefaultEndTime}
          defaultUserId={createDefaultUserId}
          onSwitchToEvent={() => {
            // Pivot to the EventDialog while preserving the date/time/employee
            // the user already picked by clicking a calendar slot. The shared
            // createDefault* state means the EventDialog will re-seed with the
            // same values when it opens (issue #1598).
            setCreateDialogOpen(false);
            setEventDialogOpen(true);
          }}
        />

        {/* Create event dialog (non-patient calendar block — issue #1555) */}
        <EventDialog
          organizationId={organizationId}
          open={eventDialogOpen}
          onOpenChange={setEventDialogOpen}
          defaultDate={createDefaultDate}
          defaultTime={createDefaultTime}
          defaultEndTime={createDefaultEndTime}
          defaultUserId={createDefaultUserId}
          onManageEventTypes={() => setEventTypesSlideoutOpen(true)}
        />

        {/* Sell package side panel */}
        <SellPackagePanel
          organizationId={organizationId}
          open={sellPackageOpen}
          onOpenChange={setSellPackageOpen}
        />
      </div>

      {/* Print-only schedule table */}
      <PrintSchedule date={printDate} appointments={printAppointments} />

      <TagsManagerSlideout
        isOpen={tagsSlideoutOpen}
        onOpenChange={setTagsSlideoutOpen}
        organizationId={organizationId}
        tags={tagDefinitions}
      />

      <CategoriesManagerSlideout
        isOpen={eventTypesSlideoutOpen}
        onOpenChange={setEventTypesSlideoutOpen}
        organizationId={organizationId}
        entityType="gabinetEvent"
        categories={eventTypeCategories as any}
      />

      {/* Drag overlay - shows appointment being dragged */}
      <DragOverlay>
        {activeAppointment ? (
          <div className="w-48 opacity-90 shadow-lg">
            <AppointmentCard
              startTime={activeAppointment.startTime}
              endTime={activeAppointment.endTime}
              patientName={activeAppointment.patientName}
              treatmentName={activeAppointment.treatmentName}
              variantName={activeAppointment.variantName}
              status={activeAppointment.status}
              color={activeAppointment.color}
              tags={activeAppointment.tags}
              indicators={activeAppointment.indicators}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
