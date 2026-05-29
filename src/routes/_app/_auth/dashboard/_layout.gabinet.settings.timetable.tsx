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
import { EMPLOYEE_ROLES } from "@/lib/options";
import { Pencil } from "@/lib/ez-icons";
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

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/settings/timetable"
)({
  component: TimetablePage,
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
  }, [employees, userMap, search, roleFilter, locationFilter, employeeLocationIds]);

  const employeeName = (e: MappedGabinetEmployee) => {
    if (e.firstName || e.lastName) {
      return `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim();
    }
    const u = userMap.get(e.userId);
    return u?.name || u?.email || t("common.unknown");
  };

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
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs font-medium text-muted-foreground">
              <th className="px-4 py-2 text-left min-w-[200px]">
                {t("gabinet.timetable.employee")}
              </th>
              <th className="px-2 py-2 text-left min-w-[140px]">
                {t("gabinet.timetable.week")}
              </th>
              {DISPLAY_ORDER.map((dayIdx, i) => (
                <th
                  key={dayIdx}
                  className="px-2 py-2 text-center min-w-[90px]"
                >
                  <span>{dayNames[i]}</span>
                </th>
              ))}
              <th className="px-2 py-2 w-[80px]"></th>
            </tr>
          </thead>
          <tbody>
            {sortedEmployees.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  {t("gabinet.timetable.empty")}
                </td>
              </tr>
            )}
            {sortedEmployees.map((emp) => {
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
              return weeks.map((week, weekIdx) => {
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
                const isFirstWeekRow = weekIdx === 0;
                const isLastWeekRow = weekIdx === weeks.length - 1;
                const isCurrentWeek = weekIdx === 0;
                const rowBorder = isLastWeekRow
                  ? "border-b last:border-b-0"
                  : "";
                return (
                  <tr
                    key={`${emp._id}-${week.monday}`}
                    className={`${rowBorder} ${
                      isCurrentWeek ? "bg-muted/20" : ""
                    }`}
                  >
                    {isFirstWeekRow && (
                      <td
                        className="px-4 py-2 align-top border-r"
                        rowSpan={weeks.length}
                      >
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
                            {!meta.hasOverrides && (
                              <Badge
                                variant="outline"
                                className="text-[10px] h-4 px-1"
                              >
                                {t("gabinet.timetable.usingDefaults")}
                              </Badge>
                            )}
                            {meta.datedPeriods > 0 && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] h-4 px-1"
                                title={t("gabinet.timetable.datedPeriodsHint")}
                              >
                                {t("gabinet.timetable.datedPeriodsCount", {
                                  count: meta.datedPeriods,
                                })}
                              </Badge>
                            )}
                            {leaveBadgeLabel && (
                              <Badge
                                variant="destructive"
                                className="text-[10px] h-4 px-1"
                                title={t("gabinet.timetable.leaveBadgeHint")}
                              >
                                {leaveBadgeLabel}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </td>
                    )}
                    <td className="px-2 py-2 align-middle">
                      <div className="flex flex-col leading-tight">
                        <span className="text-xs font-medium">
                          {formatWeekRange(week.monday, i18n.language)}
                        </span>
                        {isCurrentWeek && (
                          <span className="text-[10px] text-muted-foreground">
                            {t("gabinet.timetable.currentWeek")}
                          </span>
                        )}
                        {activeDatedLabel && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0 mt-0.5 self-start whitespace-nowrap"
                            title={t("gabinet.timetable.activePeriodHint")}
                          >
                            {activeDatedLabel}
                          </Badge>
                        )}
                      </div>
                    </td>
                    {DISPLAY_ORDER.map((dayIdx) => {
                      const entry = entries.find((e) => e.dayOfWeek === dayIdx);
                      const date = week.dates.get(dayIdx);
                      const leave = date
                        ? findLeaveForDate(leaves, emp.userId, date)
                        : undefined;
                      const dateLabel = formatShortDate(date, i18n.language);
                      return (
                        <td
                          key={dayIdx}
                          className="px-2 py-2 text-center align-middle"
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
                                  leave.reason ? `\n${leave.reason}` : ""
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
                                {entry.breakStart && entry.breakEnd && (
                                  <div className="text-muted-foreground text-[10px]">
                                    {t("gabinet.schedules.break")}:{" "}
                                    {entry.breakStart}–{entry.breakEnd}
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
                    {isFirstWeekRow && (
                      <td
                        className="px-2 py-2 text-right align-top"
                        rowSpan={weeks.length}
                      >
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingEmployee(emp)}
                          aria-label={t("common.edit")}
                        >
                          <Pencil className="h-4 w-4" variant="stroke" />
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
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
