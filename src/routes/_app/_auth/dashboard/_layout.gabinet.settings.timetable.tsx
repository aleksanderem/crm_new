import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import { useOrganization } from "@/components/org-context";
import { useSupabaseGabinetEmployeesList } from "@/hooks/use-supabase-gabinet-employees";
import { useSupabaseGabinetEmployeeSchedulesList } from "@/hooks/use-supabase-gabinet-employee-schedules";
import { useSupabaseGabinetWorkingHoursList } from "@/hooks/use-supabase-gabinet-working-hours";
import { useSupabaseOrganizationMembers } from "@/hooks/use-supabase-organizations";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { SectionHeader } from "@untitled/app/section-headers/section-headers";
import { UntitledAlert } from "@/components/ui/untitled-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/settings/timetable"
)({
  component: TimetablePage,
});

const DAY_NAMES_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_NAMES_PL = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];
// Display order: Mon..Sun. Convex/Supabase stores dayOfWeek 0=Sun..6=Sat.
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

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

interface ResolvedEmployeeSchedule {
  entries: DisplayEntry[];
  activePeriod?: SchedulePeriod;
  totalPeriods: number;
  datedPeriods: number;
  hasOverrides: boolean;
}

function resolveEmployeeSchedule(
  employee: MappedGabinetEmployee,
  schedules: MappedGabinetEmployeeSchedule[] | undefined,
  clinicHours: MappedGabinetWorkingHours[] | undefined,
  today: string,
): ResolvedEmployeeSchedule {
  const own = (schedules ?? []).filter((s) => s.userId === employee.userId);
  const periods = groupSchedulesIntoPeriods(own);
  const fallback = buildClinicFallback(clinicHours);

  if (periods.length === 0) {
    return {
      entries: fallback,
      totalPeriods: 0,
      datedPeriods: 0,
      hasOverrides: false,
    };
  }

  const datedPeriods = periods.filter((p) => p.effectiveFrom).length;
  const activePeriod = findActivePeriod(periods, today);

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
        return fallback[i];
      })
    : fallback;

  return {
    entries,
    activePeriod,
    totalPeriods: periods.length,
    datedPeriods,
    hasOverrides: true,
  };
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
  const { data: members } = useSupabaseOrganizationMembers(organizationId);

  const dayNames = i18n.language === "pl" ? DAY_NAMES_PL : DAY_NAMES_EN;
  const today = new Date().toISOString().split("T")[0];

  const userMap = useMemo(() => {
    const map = new Map<string, { name: string | null; email: string | null }>();
    for (const m of members ?? []) {
      if (m.user) map.set(m.userId, { name: m.user.name, email: m.user.email });
    }
    return map;
  }, [members]);

  const [search, setSearch] = useState("");
  const [editingEmployee, setEditingEmployee] =
    useState<MappedGabinetEmployee | null>(null);

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
    if (!search.trim()) return list;
    const needle = search.toLowerCase();
    return list.filter((e) => {
      const u = userMap.get(e.userId);
      const fullName = `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim();
      return (
        fullName.toLowerCase().includes(needle) ||
        u?.name?.toLowerCase().includes(needle) ||
        u?.email?.toLowerCase().includes(needle) ||
        e.specialization?.toLowerCase().includes(needle)
      );
    });
  }, [employees, userMap, search]);

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

      <div className="flex items-center gap-2">
        <Input
          placeholder={t("gabinet.timetable.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs font-medium text-muted-foreground">
              <th className="px-4 py-2 text-left min-w-[200px]">
                {t("gabinet.timetable.employee")}
              </th>
              {DISPLAY_ORDER.map((dayIdx, i) => (
                <th
                  key={dayIdx}
                  className="px-2 py-2 text-center min-w-[90px]"
                >
                  {dayNames[i]}
                </th>
              ))}
              <th className="px-2 py-2 w-[80px]"></th>
            </tr>
          </thead>
          <tbody>
            {sortedEmployees.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  {t("gabinet.timetable.empty")}
                </td>
              </tr>
            )}
            {sortedEmployees.map((emp) => {
              const {
                entries,
                activePeriod,
                datedPeriods,
                hasOverrides,
              } = resolveEmployeeSchedule(emp, schedules, clinicHours, today);
              const activeDatedLabel =
                activePeriod?.effectiveFrom
                  ? `${activePeriod.effectiveFrom}${
                      activePeriod.effectiveTo
                        ? ` — ${activePeriod.effectiveTo}`
                        : ` — ${t("gabinet.employees.schedule.ongoing")}`
                    }`
                  : null;
              return (
                <tr key={emp._id} className="border-b last:border-b-0">
                  <td className="px-4 py-2 align-middle">
                    <div className="flex flex-col">
                      <span className="font-medium">{employeeName(emp)}</span>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        {emp.specialization && (
                          <span className="text-xs text-muted-foreground">
                            {emp.specialization}
                          </span>
                        )}
                        {!hasOverrides && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1">
                            {t("gabinet.timetable.usingDefaults")}
                          </Badge>
                        )}
                        {activeDatedLabel && (
                          <Badge
                            variant="default"
                            className="text-[10px] h-4 px-1"
                            title={t("gabinet.timetable.activePeriodHint")}
                          >
                            {activeDatedLabel}
                          </Badge>
                        )}
                        {datedPeriods > 0 && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] h-4 px-1"
                            title={t("gabinet.timetable.datedPeriodsHint")}
                          >
                            {t("gabinet.timetable.datedPeriodsCount", {
                              count: datedPeriods,
                            })}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </td>
                  {DISPLAY_ORDER.map((dayIdx) => {
                    const entry = entries.find((e) => e.dayOfWeek === dayIdx);
                    return (
                      <td
                        key={dayIdx}
                        className="px-2 py-2 text-center align-middle"
                      >
                        {entry?.isWorking ? (
                          <div className="text-xs leading-tight">
                            <div className="font-medium">
                              {entry.startTime}–{entry.endTime}
                            </div>
                            {entry.breakStart && entry.breakEnd && (
                              <div className="text-muted-foreground text-[10px]">
                                {t("gabinet.schedules.break")}: {entry.breakStart}–{entry.breakEnd}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-right align-middle">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingEmployee(emp)}
                      aria-label={t("common.edit")}
                    >
                      <Pencil className="h-4 w-4" variant="stroke" />
                    </Button>
                  </td>
                </tr>
              );
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
