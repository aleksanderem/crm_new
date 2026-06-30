import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import { useOrganization } from "@/components/org-context";
import { useSupabaseGabinetEmployeesList } from "@/hooks/use-supabase-gabinet-employees";
import { useSupabaseGabinetEmployeeSchedulesList } from "@/hooks/use-supabase-gabinet-employee-schedules";
import { useSupabaseGabinetWorkingHoursList } from "@/hooks/use-supabase-gabinet-working-hours";
import { useSupabaseGabinetLocationsList } from "@/hooks/use-supabase-gabinet-locations";
import { useSupabaseGabinetLeavesList } from "@/hooks/use-supabase-gabinet-leaves";
import { useSupabaseOrganizationMembers } from "@/hooks/use-supabase-organizations";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { SectionHeader } from "@untitled/app/section-headers/section-headers";
import { UntitledAlert } from "@/components/ui/untitled-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { EMPLOYEE_ROLES } from "@/lib/options";
import { Pencil } from "@/lib/ez-icons";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FlexibleScheduleEditor,
  findActivePeriod,
  groupSchedulesIntoPeriods,
  type SchedulePeriod,
} from "@/components/gabinet/flexible-schedule-editor";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MappedGabinetEmployee } from "@/lib/supabase/mappers/gabinet/employees";
import type { MappedGabinetEmployeeSchedule } from "@/lib/supabase/mappers/gabinet/employee-schedules";
import type { MappedGabinetWorkingHours } from "@/lib/supabase/mappers/gabinet/working-hours";
import type { MappedGabinetLeave } from "@/lib/supabase/mappers/gabinet/leaves";
import { PermissionGate } from "@/hooks/use-permission";
import { GabinetNoAccess } from "@/components/gabinet/no-access";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/settings/timetable"
)({
  component: () => <PermissionGate feature="gabinet_settings" action="view" fallback={<GabinetNoAccess />}><TimetablePage /></PermissionGate>,
});

const DAY_NAMES_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_NAMES_PL = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];
// Display order: Mon..Sun. Convex/Supabase stores dayOfWeek 0=Sun..6=Sat.
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKS_TO_SHOW = 4;

interface DisplayEntry {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isWorking: boolean;
  breakStart?: string;
  breakEnd?: string;
}

function buildClinicFallback(
  clinicHours: MappedGabinetWorkingHours[] | undefined,
): DisplayEntry[] {
  return Array.from({ length: 7 }, (_, i) => {
    const clinicDay = clinicHours?.find((h) => h.dayOfWeek === i);
    if (clinicDay) {
      return {
        dayOfWeek: i,
        startTime: clinicDay.startTime,
        endTime: clinicDay.endTime,
        isWorking: clinicDay.isOpen,
        breakStart: clinicDay.breakStart ?? undefined,
        breakEnd: clinicDay.breakEnd ?? undefined,
      };
    }
    return {
      dayOfWeek: i,
      startTime: "08:00",
      endTime: "17:00",
      isWorking: i >= 1 && i <= 5,
    };
  });
}

interface EmployeeScheduleMeta {
  periods: SchedulePeriod[];
  fallback: DisplayEntry[];
  datedPeriods: number;
  hasOverrides: boolean;
}

function getEmployeeScheduleMeta(
  employee: MappedGabinetEmployee,
  schedules: MappedGabinetEmployeeSchedule[] | undefined,
  clinicHours: MappedGabinetWorkingHours[] | undefined,
): EmployeeScheduleMeta {
  const own = (schedules ?? []).filter((s) => s.userId === employee.userId);
  const periods = groupSchedulesIntoPeriods(own);
  const fallback = buildClinicFallback(clinicHours);
  const datedPeriods = periods.filter((p) => p.effectiveFrom).length;
  return {
    periods,
    fallback,
    datedPeriods,
    hasOverrides: periods.length > 0,
  };
}

interface WeekSchedule {
  entries: DisplayEntry[];
  activePeriod?: SchedulePeriod;
}

function resolveWeekSchedule(
  meta: EmployeeScheduleMeta,
  referenceDate: string,
): WeekSchedule {
  if (meta.periods.length === 0) {
    return { entries: meta.fallback };
  }
  const activePeriod = findActivePeriod(meta.periods, referenceDate);
  const entries: DisplayEntry[] = activePeriod
    ? Array.from({ length: 7 }, (_, i) => {
        const found = activePeriod.entries.find((e) => e.dayOfWeek === i);
        if (found) {
          return {
            dayOfWeek: i,
            startTime: found.startTime,
            endTime: found.endTime,
            isWorking: found.isWorking,
            breakStart: found.breakStart,
            breakEnd: found.breakEnd,
          };
        }
        return meta.fallback[i];
      })
    : meta.fallback;
  return { entries, activePeriod };
}

function getMondayOfWeek(date: string): string {
  const base = new Date(`${date}T00:00:00`);
  const dow = base.getDay();
  const offsetToMonday = dow === 0 ? -6 : 1 - dow;
  const d = new Date(base);
  d.setDate(base.getDate() + offsetToMonday);
  return d.toISOString().split("T")[0];
}

function getWeekStarts(today: string, count: number): string[] {
  const monday = getMondayOfWeek(today);
  const result: string[] = [];
  const base = new Date(`${monday}T00:00:00`);
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i * 7);
    result.push(d.toISOString().split("T")[0]);
  }
  return result;
}

function getWeekDatesFromMonday(mondayIso: string): Map<number, string> {
  const base = new Date(`${mondayIso}T00:00:00`);
  const map = new Map<number, string>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const iso = d.toISOString().split("T")[0];
    map.set(d.getDay(), iso);
  }
  return map;
}

function formatShortDate(iso: string | undefined, lang: string): string {
  if (!iso) return "";
  const [, month, day] = iso.split("-");
  if (!month || !day) return "";
  return lang === "pl" ? `${day}.${month}` : `${month}/${day}`;
}

function formatWeekRange(mondayIso: string, lang: string): string {
  const base = new Date(`${mondayIso}T00:00:00`);
  const sunday = new Date(base);
  sunday.setDate(base.getDate() + 6);
  const sundayIso = sunday.toISOString().split("T")[0];
  return `${formatShortDate(mondayIso, lang)} – ${formatShortDate(sundayIso, lang)}`;
}

function findLeaveForDate(
  leaves: MappedGabinetLeave[] | undefined,
  userId: string,
  date: string,
): MappedGabinetLeave | undefined {
  if (!leaves) return undefined;
  return leaves.find(
    (l) =>
      l.userId === userId &&
      l.status === "approved" &&
      l.startDate <= date &&
      l.endDate >= date,
  );
}

function findUpcomingOrActiveLeave(
  leaves: MappedGabinetLeave[] | undefined,
  userId: string,
  today: string,
  horizonDate: string,
): MappedGabinetLeave | undefined {
  if (!leaves) return undefined;
  return leaves
    .filter(
      (l) =>
        l.userId === userId &&
        l.status === "approved" &&
        l.endDate >= today &&
        l.startDate <= horizonDate,
    )
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function parseTimeToMinutes(time: string): number | null {
  const [h, m] = time.split(":");
  const hours = Number(h);
  const minutes = Number(m);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function computeEntryMinutes(entry: DisplayEntry): number {
  if (!entry.isWorking) return 0;
  const start = parseTimeToMinutes(entry.startTime);
  const end = parseTimeToMinutes(entry.endTime);
  if (start === null || end === null || end <= start) return 0;
  let total = end - start;
  if (entry.breakStart && entry.breakEnd) {
    const bStart = parseTimeToMinutes(entry.breakStart);
    const bEnd = parseTimeToMinutes(entry.breakEnd);
    if (bStart !== null && bEnd !== null && bEnd > bStart) {
      total -= bEnd - bStart;
    }
  }
  return Math.max(0, total);
}

function computeWeeklyMinutes(
  entries: DisplayEntry[],
  weekDates: Map<number, string>,
  leaves: MappedGabinetLeave[] | undefined,
  userId: string,
): number {
  let total = 0;
  for (const entry of entries) {
    const date = weekDates.get(entry.dayOfWeek);
    if (date && findLeaveForDate(leaves, userId, date)) continue;
    total += computeEntryMinutes(entry);
  }
  return total;
}

function formatMinutesAsHours(minutes: number): string {
  if (minutes <= 0) return "0";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}`;
  const minutesPart = mins.toString().padStart(2, "0");
  return `${hours}:${minutesPart}`;
}

function TimetablePage() {
  const { t, i18n } = useTranslation();
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const bulkSetEmployeeSchedule = useAction(
    // @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
    api.gabinet.scheduling.bulkSetEmployeeSchedule,
  );
  const saveSchedulePeriod = useAction(
    // @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
    api.gabinet.scheduling.saveSchedulePeriod,
  );
  const removeSchedulePeriod = useAction(
    // @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
    api.gabinet.scheduling.removeSchedulePeriod,
  );

  const { data: employees } = useSupabaseGabinetEmployeesList(organizationId, {
    activeOnly: true,
  });
  const { data: schedules } = useSupabaseGabinetEmployeeSchedulesList(organizationId);
  const { data: clinicHours } = useSupabaseGabinetWorkingHoursList(organizationId);
  const { data: locations } = useSupabaseGabinetLocationsList(organizationId, {
    activeOnly: true,
  });
  const { data: leaves } = useSupabaseGabinetLeavesList(organizationId, {
    status: "approved",
  });
  const { data: members } = useSupabaseOrganizationMembers(organizationId);

  const dayNames = i18n.language === "pl" ? DAY_NAMES_PL : DAY_NAMES_EN;
  const today = new Date().toISOString().split("T")[0];
  const weekStarts = useMemo(
    () => getWeekStarts(today, WEEKS_TO_SHOW),
    [today],
  );
  const weeks = useMemo(
    () =>
      weekStarts.map((monday) => ({
        monday,
        dates: getWeekDatesFromMonday(monday),
      })),
    [weekStarts],
  );
  const leaveHorizon = useMemo(
    () => addDays(today, Math.max(30, WEEKS_TO_SHOW * 7)),
    [today],
  );

  const userMap = useMemo(() => {
    const map = new Map<string, { name: string | null; email: string | null }>();
    for (const m of members ?? []) {
      if (m.user) map.set(m.userId, { name: m.user.name, email: m.user.email });
    }
    return map;
  }, [members]);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(
    new Set(),
  );
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false);
  const [employeePickerSearch, setEmployeePickerSearch] = useState("");
  const [editingEmployee, setEditingEmployee] =
    useState<MappedGabinetEmployee | null>(null);

  const employeeLocationIds = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const s of schedules ?? []) {
      if (!s.locationId) continue;
      const set = map.get(s.userId) ?? new Set<string>();
      set.add(s.locationId);
      map.set(s.userId, set);
    }
    return map;
  }, [schedules]);

  const sortedEmployees = useMemo(() => {
    const list = [...(employees ?? [])];
    list.sort((a, b) => {
      const aName =
        a.firstName || a.lastName
          ? `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim()
          : userMap.get(a.userId)?.name ?? userMap.get(a.userId)?.email ?? "";
      const bName =
        b.firstName || b.lastName
          ? `${b.firstName ?? ""} ${b.lastName ?? ""}`.trim()
          : userMap.get(b.userId)?.name ?? userMap.get(b.userId)?.email ?? "";
      return aName.localeCompare(bName);
    });
    const needle = search.trim().toLowerCase();
    return list.filter((e) => {
      if (selectedEmployeeIds.size > 0 && !selectedEmployeeIds.has(e._id)) {
        return false;
      }
      if (roleFilter !== "all" && e.role !== roleFilter) return false;
      if (locationFilter !== "all") {
        const locs = employeeLocationIds.get(e.userId);
        if (!locs || !locs.has(locationFilter)) return false;
      }
      if (!needle) return true;
      const u = userMap.get(e.userId);
      const fullName = `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim();
      return (
        fullName.toLowerCase().includes(needle) ||
        u?.name?.toLowerCase().includes(needle) ||
        u?.email?.toLowerCase().includes(needle) ||
        (e.specialization?.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [
    employees,
    userMap,
    search,
    roleFilter,
    locationFilter,
    employeeLocationIds,
    selectedEmployeeIds,
  ]);

  const employeeName = (e: MappedGabinetEmployee) => {
    if (e.firstName || e.lastName) {
      return `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim();
    }
    const u = userMap.get(e.userId);
    return u?.name || u?.email || t("common.unknown");
  };

  const allEmployeesSorted = useMemo(() => {
    const list = [...(employees ?? [])];
    list.sort((a, b) => employeeName(a).localeCompare(employeeName(b)));
    return list;
  }, [employees, userMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickerFilteredEmployees = useMemo(() => {
    const needle = employeePickerSearch.trim().toLowerCase();
    if (!needle) return allEmployeesSorted;
    return allEmployeesSorted.filter((e) => {
      const u = userMap.get(e.userId);
      const fullName = employeeName(e);
      return (
        fullName.toLowerCase().includes(needle) ||
        u?.email?.toLowerCase().includes(needle) ||
        (e.specialization?.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [allEmployeesSorted, employeePickerSearch, userMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleEmployeeSelection = (employeeId: string) => {
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(employeeId)) {
        next.delete(employeeId);
      } else {
        next.add(employeeId);
      }
      return next;
    });
  };

  const employeePickerLabel =
    selectedEmployeeIds.size === 0
      ? t("gabinet.timetable.allEmployees", "Wszyscy pracownicy")
      : t("gabinet.timetable.employeesSelectedCount", {
          count: selectedEmployeeIds.size,
          defaultValue: "{{count}} pracowników",
        });

  const invalidateScheduleCache = () => {
    void queryClient.invalidateQueries({
      queryKey: supabaseKeys.gabinetEmployeeSchedules.list(organizationId),
    });
  };

  const editingEmployeeSchedules = useMemo(() => {
    if (!editingEmployee) return undefined;
    return (schedules ?? []).filter(
      (s) => s.userId === editingEmployee.userId,
    );
  }, [schedules, editingEmployee]);

  const editingEmployeePeriods = useMemo(
    () => groupSchedulesIntoPeriods(editingEmployeeSchedules),
    [editingEmployeeSchedules],
  );

  const clinicHoursForEditor = useMemo(
    () =>
      (clinicHours ?? []).map((h) => ({
        dayOfWeek: h.dayOfWeek,
        startTime: h.startTime,
        endTime: h.endTime,
        isOpen: h.isOpen,
        breakStart: h.breakStart ?? undefined,
        breakEnd: h.breakEnd ?? undefined,
      })),
    [clinicHours],
  );

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <SectionHeader.Root className="pt-4">
        <SectionHeader.Group>
          <SectionHeader.Heading className="flex-1">
            {t("gabinet.timetable.title")}
          </SectionHeader.Heading>
        </SectionHeader.Group>
        <UntitledAlert>{t("gabinet.timetable.description")}</UntitledAlert>
      </SectionHeader.Root>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder={t("gabinet.timetable.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={t("gabinet.timetable.filterByRole")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {t("gabinet.timetable.allRoles")}
            </SelectItem>
            {EMPLOYEE_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {t(`gabinet.employees.roles.${r}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={locationFilter} onValueChange={setLocationFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder={t("gabinet.timetable.filterByLocation")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {t("gabinet.timetable.allLocations")}
            </SelectItem>
            {(locations ?? []).map((loc) => (
              <SelectItem key={loc._id} value={loc._id}>
                {loc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Popover
          open={employeePickerOpen}
          onOpenChange={(o) => {
            setEmployeePickerOpen(o);
            if (!o) setEmployeePickerSearch("");
          }}
        >
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={employeePickerOpen}
              className="w-[220px] justify-between font-normal"
            >
              <span className="truncate">{employeePickerLabel}</span>
              <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="p-0"
            align="start"
            style={{
              width: "var(--radix-popover-trigger-width)",
              maxHeight: "var(--radix-popover-content-available-height)",
            }}
          >
            <Command shouldFilter={false}>
              <CommandInput
                placeholder={t("gabinet.timetable.searchPlaceholder")}
                value={employeePickerSearch}
                onValueChange={setEmployeePickerSearch}
                onClose={() => setEmployeePickerOpen(false)}
                closeLabel={t("common.close", "Zamknij")}
              />
              <CommandList className="flex-1 min-h-0">
                <CommandEmpty>
                  {t(
                    "gabinet.timetable.noEmployeesFound",
                    "Nie znaleziono pracowników",
                  )}
                </CommandEmpty>
                {selectedEmployeeIds.size > 0 && (
                  <div className="border-b p-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-full justify-start text-xs"
                      onClick={() => setSelectedEmployeeIds(new Set())}
                    >
                      {t(
                        "gabinet.timetable.clearEmployeeSelection",
                        "Wyczyść wybór",
                      )}
                    </Button>
                  </div>
                )}
                <CommandGroup>
                  {pickerFilteredEmployees.map((emp) => {
                    const checked = selectedEmployeeIds.has(emp._id);
                    return (
                      <CommandItem
                        key={emp._id}
                        value={emp._id}
                        onSelect={() => toggleEmployeeSelection(emp._id)}
                        className="flex items-center gap-2 px-3"
                      >
                        <Checkbox
                          checked={checked}
                          aria-hidden
                          tabIndex={-1}
                          className="pointer-events-none"
                        />
                        <span className="flex-1 truncate text-sm">
                          {employeeName(emp)}
                        </span>
                        <Check
                          className={cn(
                            "h-4 w-4 shrink-0",
                            checked ? "opacity-100" : "opacity-0",
                          )}
                        />
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex flex-col gap-6">
        {weeks.map((week, weekIdx) => {
          const isCurrentWeek = weekIdx === 0;
          const buildEmployeeWeekRow = (emp: MappedGabinetEmployee) => {
            const meta = getEmployeeScheduleMeta(emp, schedules, clinicHours);
            const upcomingLeave = findUpcomingOrActiveLeave(
              leaves,
              emp.userId,
              today,
              leaveHorizon,
            );
            const leaveBadgeLabel = upcomingLeave
              ? upcomingLeave.startDate <= today
                ? t("gabinet.timetable.onLeaveBadge", {
                    end: upcomingLeave.endDate,
                  })
                : t("gabinet.timetable.upcomingLeaveBadge", {
                    start: upcomingLeave.startDate,
                    end: upcomingLeave.endDate,
                  })
              : null;
            const { entries, activePeriod } = resolveWeekSchedule(
              meta,
              week.monday,
            );
            const activeDatedLabel = activePeriod?.effectiveFrom
              ? `${activePeriod.effectiveFrom}${
                  activePeriod.effectiveTo
                    ? ` — ${activePeriod.effectiveTo}`
                    : ` — ${t("gabinet.employees.schedule.ongoing")}`
                }`
              : null;
            const totalWeeklyMinutes = computeWeeklyMinutes(
              entries,
              week.dates,
              leaves,
              emp.userId,
            );
            return {
              meta,
              leaveBadgeLabel,
              entries,
              activeDatedLabel,
              totalWeeklyMinutes,
            };
          };
          return (
            <div key={week.monday} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">
                  {formatWeekRange(week.monday, i18n.language)}
                </h3>
                {isCurrentWeek && (
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                    {t("gabinet.timetable.currentWeek")}
                  </Badge>
                )}
              </div>
              {sortedEmployees.length === 0 ? (
                <div className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">
                  {t("gabinet.timetable.empty")}
                </div>
              ) : (
                <>
                  <div className="hidden md:block rounded-lg border overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50 text-xs font-medium text-muted-foreground">
                          <th className="px-3 py-2 text-left min-w-[180px]">
                            {t("gabinet.timetable.employee")}
                          </th>
                          {DISPLAY_ORDER.map((dayIdx, i) => (
                            <th
                              key={dayIdx}
                              className="px-1.5 py-2 text-center min-w-[72px]"
                            >
                              <span>{dayNames[i]}</span>
                            </th>
                          ))}
                          <th className="px-1.5 py-2 text-center min-w-[64px] whitespace-nowrap">
                            {t("gabinet.timetable.totalHours")}
                          </th>
                          <th className="px-1.5 py-2 w-[88px]"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedEmployees.map((emp) => {
                          const row = buildEmployeeWeekRow(emp);
                          return (
                            <tr
                              key={`${emp._id}-${week.monday}`}
                              className="border-b last:border-b-0"
                            >
                              <td className="px-3 py-2 align-top">
                                <div className="flex flex-col">
                                  <span className="font-medium">
                                    {employeeName(emp)}
                                  </span>
                                  <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                    {emp.specialization && (
                                      <span className="text-xs text-muted-foreground">
                                        {emp.specialization}
                                      </span>
                                    )}
                                    {!row.meta.hasOverrides && (
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] h-4 px-1"
                                      >
                                        {t("gabinet.timetable.usingDefaults")}
                                      </Badge>
                                    )}
                                    {row.meta.datedPeriods > 0 && (
                                      <Badge
                                        variant="secondary"
                                        className="text-[10px] h-4 px-1"
                                        title={t(
                                          "gabinet.timetable.datedPeriodsHint",
                                        )}
                                      >
                                        {t(
                                          "gabinet.timetable.datedPeriodsCount",
                                          { count: row.meta.datedPeriods },
                                        )}
                                      </Badge>
                                    )}
                                    {row.leaveBadgeLabel && (
                                      <Badge
                                        variant="destructive"
                                        className="text-[10px] h-4 px-1"
                                        title={t(
                                          "gabinet.timetable.leaveBadgeHint",
                                        )}
                                      >
                                        {row.leaveBadgeLabel}
                                      </Badge>
                                    )}
                                    {row.activeDatedLabel && (
                                      <Badge
                                        variant="secondary"
                                        className="text-[10px] h-4 px-1 whitespace-nowrap"
                                        title={t(
                                          "gabinet.timetable.activePeriodHint",
                                        )}
                                      >
                                        {row.activeDatedLabel}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </td>
                              {DISPLAY_ORDER.map((dayIdx) => {
                                const entry = row.entries.find(
                                  (e) => e.dayOfWeek === dayIdx,
                                );
                                const date = week.dates.get(dayIdx);
                                const leave = date
                                  ? findLeaveForDate(leaves, emp.userId, date)
                                  : undefined;
                                const dateLabel = formatShortDate(
                                  date,
                                  i18n.language,
                                );
                                return (
                                  <td
                                    key={dayIdx}
                                    className="px-1.5 py-2 text-center align-middle"
                                  >
                                    <div className="flex flex-col items-center leading-tight">
                                      {dateLabel && (
                                        <span className="text-[10px] text-muted-foreground">
                                          {dateLabel}
                                        </span>
                                      )}
                                      {leave ? (
                                        <div
                                          className="text-xs leading-tight"
                                          title={`${leave.startDate} — ${leave.endDate}${
                                            leave.reason
                                              ? `\n${leave.reason}`
                                              : ""
                                          }`}
                                        >
                                          <Badge
                                            variant="destructive"
                                            className="text-[10px] h-4 px-1"
                                          >
                                            {t("gabinet.timetable.onLeaveCell")}
                                          </Badge>
                                          {entry?.isWorking && (
                                            <div className="text-muted-foreground text-[10px] line-through mt-0.5">
                                              {entry.startTime}–{entry.endTime}
                                            </div>
                                          )}
                                        </div>
                                      ) : entry?.isWorking ? (
                                        <div className="text-xs leading-tight">
                                          <div className="font-medium">
                                            {entry.startTime}–{entry.endTime}
                                          </div>
                                          {entry.breakStart &&
                                            entry.breakEnd && (
                                              <div className="text-muted-foreground text-[10px]">
                                                {t("gabinet.schedules.break")}:{" "}
                                                {entry.breakStart}–
                                                {entry.breakEnd}
                                              </div>
                                            )}
                                        </div>
                                      ) : (
                                        <span className="text-xs text-muted-foreground">
                                          —
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                              <td className="px-1.5 py-2 text-center align-middle">
                                <span
                                  className="text-xs font-medium tabular-nums"
                                  title={t("gabinet.timetable.totalHoursHint")}
                                >
                                  {formatMinutesAsHours(row.totalWeeklyMinutes)}
                                </span>
                              </td>
                              <td className="px-1.5 py-2 text-right align-top">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditingEmployee(emp)}
                                  aria-label={t("common.edit")}
                                >
                                  <Pencil
                                    className="mr-1 h-4 w-4"
                                    variant="stroke"
                                  />
                                  {t("common.edit")}
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="md:hidden flex flex-col gap-3">
                    {sortedEmployees.map((emp) => {
                      const row = buildEmployeeWeekRow(emp);
                      return (
                        <div
                          key={`${emp._id}-${week.monday}-mobile`}
                          className="rounded-lg border p-3 flex flex-col gap-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="font-medium truncate">
                                {employeeName(emp)}
                              </span>
                              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                {emp.specialization && (
                                  <span className="text-xs text-muted-foreground">
                                    {emp.specialization}
                                  </span>
                                )}
                                {!row.meta.hasOverrides && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] h-4 px-1"
                                  >
                                    {t("gabinet.timetable.usingDefaults")}
                                  </Badge>
                                )}
                                {row.meta.datedPeriods > 0 && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] h-4 px-1"
                                  >
                                    {t("gabinet.timetable.datedPeriodsCount", {
                                      count: row.meta.datedPeriods,
                                    })}
                                  </Badge>
                                )}
                                {row.leaveBadgeLabel && (
                                  <Badge
                                    variant="destructive"
                                    className="text-[10px] h-4 px-1"
                                  >
                                    {row.leaveBadgeLabel}
                                  </Badge>
                                )}
                                {row.activeDatedLabel && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] h-4 px-1"
                                  >
                                    {row.activeDatedLabel}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingEmployee(emp)}
                              aria-label={t("common.edit")}
                              className="shrink-0"
                            >
                              <Pencil
                                className="mr-1 h-4 w-4"
                                variant="stroke"
                              />
                              {t("common.edit")}
                            </Button>
                          </div>

                          <div className="flex flex-col text-sm border-t border-b">
                            {DISPLAY_ORDER.map((dayIdx, i) => {
                              const entry = row.entries.find(
                                (e) => e.dayOfWeek === dayIdx,
                              );
                              const date = week.dates.get(dayIdx);
                              const leave = date
                                ? findLeaveForDate(leaves, emp.userId, date)
                                : undefined;
                              const dateLabel = formatShortDate(
                                date,
                                i18n.language,
                              );
                              return (
                                <div
                                  key={dayIdx}
                                  className="flex items-center justify-between gap-2 py-1.5 border-b last:border-b-0"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-xs font-medium text-muted-foreground w-7 shrink-0">
                                      {dayNames[i]}
                                    </span>
                                    {dateLabel && (
                                      <span className="text-xs text-muted-foreground shrink-0">
                                        {dateLabel}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-right min-w-0">
                                    {leave ? (
                                      <div className="flex items-center justify-end gap-1.5">
                                        <Badge
                                          variant="destructive"
                                          className="text-[10px] h-4 px-1"
                                        >
                                          {t("gabinet.timetable.onLeaveCell")}
                                        </Badge>
                                        {entry?.isWorking && (
                                          <span className="text-muted-foreground line-through">
                                            {entry.startTime}–{entry.endTime}
                                          </span>
                                        )}
                                      </div>
                                    ) : entry?.isWorking ? (
                                      <div>
                                        <span className="font-medium">
                                          {entry.startTime}–{entry.endTime}
                                        </span>
                                        {entry.breakStart &&
                                          entry.breakEnd && (
                                            <span className="ml-1.5 text-muted-foreground text-[10px]">
                                              {t("gabinet.schedules.break")}:{" "}
                                              {entry.breakStart}–
                                              {entry.breakEnd}
                                            </span>
                                          )}
                                      </div>
                                    ) : (
                                      <span className="text-muted-foreground">
                                        —
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">
                              {t("gabinet.timetable.totalHours")}
                            </span>
                            <span
                              className="font-medium tabular-nums"
                              title={t("gabinet.timetable.totalHoursHint")}
                            >
                              {formatMinutesAsHours(row.totalWeeklyMinutes)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {editingEmployee && (
        <Sheet
          open
          onOpenChange={(open) => !open && setEditingEmployee(null)}
        >
          <SheetContent
            side="right"
            className="flex flex-col sm:max-w-[760px] overflow-y-auto"
          >
            <SheetHeader>
              <SheetTitle>{t("gabinet.timetable.editTitle")}</SheetTitle>
              <SheetDescription>
                {employeeName(editingEmployee)}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto py-4">
              <FlexibleScheduleEditor
                organizationId={organizationId as Id<"organizations">}
                userId={editingEmployee.userId as Id<"users">}
                periods={editingEmployeePeriods}
                clinicHours={clinicHoursForEditor}
                onSavePeriod={async (a) => {
                  await saveSchedulePeriod(a);
                  invalidateScheduleCache();
                }}
                onRemovePeriod={async (a) => {
                  await removeSchedulePeriod(a);
                  invalidateScheduleCache();
                }}
                onSaveLegacy={async (a) => {
                  await bulkSetEmployeeSchedule(a);
                  invalidateScheduleCache();
                }}
                onManageLeaves={() =>
                  navigate({ to: "/dashboard/gabinet/settings/leaves" })
                }
              />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
