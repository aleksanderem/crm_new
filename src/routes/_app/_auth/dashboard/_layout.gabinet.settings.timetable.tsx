import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Pencil, Plus, Trash2 } from "@/lib/ez-icons";
import { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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

interface DaySchedule {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isWorking: boolean;
  breakStart: string;
  breakEnd: string;
}

function buildDefaultSchedule(
  clinicHours: MappedGabinetWorkingHours[] | undefined,
): DaySchedule[] {
  return Array.from({ length: 7 }, (_, i) => {
    const clinicDay = clinicHours?.find((h) => h.dayOfWeek === i);
    if (clinicDay) {
      return {
        dayOfWeek: i,
        startTime: clinicDay.startTime,
        endTime: clinicDay.endTime,
        isWorking: clinicDay.isOpen,
        breakStart: clinicDay.breakStart ?? "",
        breakEnd: clinicDay.breakEnd ?? "",
      };
    }
    return {
      dayOfWeek: i,
      startTime: "08:00",
      endTime: "17:00",
      isWorking: i >= 1 && i <= 5,
      breakStart: "",
      breakEnd: "",
    };
  });
}

function buildEmployeeSchedule(
  employee: MappedGabinetEmployee,
  schedules: MappedGabinetEmployeeSchedule[] | undefined,
  clinicHours: MappedGabinetWorkingHours[] | undefined,
): { entries: DaySchedule[]; hasOverrides: boolean } {
  // Use only default-period entries (those without effectiveFrom)
  const own = (schedules ?? []).filter(
    (s) => s.userId === employee.userId && !s.effectiveFrom,
  );
  if (own.length === 0) {
    return { entries: buildDefaultSchedule(clinicHours), hasOverrides: false };
  }
  const entries = Array.from({ length: 7 }, (_, i) => {
    const found = own.find((e) => e.dayOfWeek === i);
    if (found) {
      return {
        dayOfWeek: i,
        startTime: found.startTime,
        endTime: found.endTime,
        isWorking: found.isWorking,
        breakStart: found.breakStart ?? "",
        breakEnd: found.breakEnd ?? "",
      };
    }
    // Fallback to clinic default for missing days
    const clinicDay = clinicHours?.find((h) => h.dayOfWeek === i);
    return {
      dayOfWeek: i,
      startTime: clinicDay?.startTime ?? "08:00",
      endTime: clinicDay?.endTime ?? "17:00",
      isWorking: clinicDay?.isOpen ?? (i >= 1 && i <= 5),
      breakStart: clinicDay?.breakStart ?? "",
      breakEnd: clinicDay?.breakEnd ?? "",
    };
  });
  return { entries, hasOverrides: true };
}

function TimetablePage() {
  const { t, i18n } = useTranslation();
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();

  const bulkSetEmployeeSchedule = useAction(
    // @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
    api.gabinet.scheduling.bulkSetEmployeeSchedule,
  );

  const { data: employees } = useSupabaseGabinetEmployeesList(organizationId, {
    activeOnly: true,
  });
  const { data: schedules } = useSupabaseGabinetEmployeeSchedulesList(organizationId);
  const { data: clinicHours } = useSupabaseGabinetWorkingHoursList(organizationId);
  const { data: members } = useSupabaseOrganizationMembers(organizationId);

  const dayNames = i18n.language === "pl" ? DAY_NAMES_PL : DAY_NAMES_EN;

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

  const handleSave = async (
    employee: MappedGabinetEmployee,
    hours: DaySchedule[],
  ) => {
    await bulkSetEmployeeSchedule({
      organizationId,
      userId: employee.userId,
      hours: hours.map((h) => ({
        dayOfWeek: h.dayOfWeek,
        startTime: h.startTime,
        endTime: h.endTime,
        isWorking: h.isWorking,
        breakStart: h.breakStart || undefined,
        breakEnd: h.breakEnd || undefined,
      })),
    });
    invalidateScheduleCache();
  };

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
              const { entries, hasOverrides } = buildEmployeeSchedule(
                emp,
                schedules,
                clinicHours,
              );
              return (
                <tr key={emp._id} className="border-b last:border-b-0">
                  <td className="px-4 py-2 align-middle">
                    <div className="flex flex-col">
                      <span className="font-medium">{employeeName(emp)}</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
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
        <EmployeeScheduleEditor
          employee={editingEmployee}
          employeeName={employeeName(editingEmployee)}
          schedules={schedules}
          clinicHours={clinicHours}
          onClose={() => setEditingEmployee(null)}
          onSave={async (hours) => {
            await handleSave(editingEmployee, hours);
          }}
        />
      )}
    </div>
  );
}

function EmployeeScheduleEditor({
  employee,
  employeeName,
  schedules,
  clinicHours,
  onClose,
  onSave,
}: {
  employee: MappedGabinetEmployee;
  employeeName: string;
  schedules: MappedGabinetEmployeeSchedule[] | undefined;
  clinicHours: MappedGabinetWorkingHours[] | undefined;
  onClose: () => void;
  onSave: (hours: DaySchedule[]) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const dayFull =
    i18n.language === "pl"
      ? ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"]
      : ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  const [hours, setHours] = useState<DaySchedule[]>(() => {
    const { entries } = buildEmployeeSchedule(employee, schedules, clinicHours);
    return entries;
  });
  const [saving, setSaving] = useState(false);

  // Re-init if the editor is reopened for a different employee (or data refreshes)
  useEffect(() => {
    const { entries } = buildEmployeeSchedule(employee, schedules, clinicHours);
    setHours(entries);
  }, [employee._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateDay = (
    dayOfWeek: number,
    field: keyof DaySchedule,
    value: string | boolean,
  ) => {
    setHours((prev) =>
      prev.map((h) => (h.dayOfWeek === dayOfWeek ? { ...h, [field]: value } : h)),
    );
  };

  const timeErrors = hours.filter(
    (h) => h.isWorking && h.endTime <= h.startTime,
  );
  const breakErrors = hours.filter(
    (h) =>
      h.isWorking &&
      h.breakStart &&
      h.breakEnd &&
      h.breakEnd <= h.breakStart,
  );

  const handleSubmit = async () => {
    if (timeErrors.length > 0) {
      toast.error(
        t("gabinet.scheduling.validationEndAfterStart", {
          days: timeErrors.map((h) => dayFull[h.dayOfWeek]).join(", "),
        }),
      );
      return;
    }
    if (breakErrors.length > 0) {
      toast.error(
        t("gabinet.scheduling.validationBreakEndAfterStart", {
          days: breakErrors.map((h) => dayFull[h.dayOfWeek]).join(", "),
        }),
      );
      return;
    }
    setSaving(true);
    try {
      await onSave(hours);
      toast.success(t("common.saved"));
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="flex flex-col sm:max-w-[560px]">
        <SheetHeader>
          <SheetTitle>{t("gabinet.timetable.editTitle")}</SheetTitle>
          <SheetDescription>{employeeName}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4">
          <div className="rounded-lg border">
            <div className="grid grid-cols-[140px_50px_1fr_1fr_2fr] gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
              <span>{t("gabinet.scheduling.day")}</span>
              <span>{t("gabinet.scheduling.open")}</span>
              <span>{t("gabinet.scheduling.start")}</span>
              <span>{t("gabinet.scheduling.end")}</span>
              <span>{t("gabinet.schedules.break")}</span>
            </div>

            {DISPLAY_ORDER.map((dayIdx) => {
              const h = hours.find((x) => x.dayOfWeek === dayIdx)!;
              const hasBreak = Boolean(h.breakStart || h.breakEnd);
              const hasTimeError = h.isWorking && h.endTime <= h.startTime;
              const hasBreakError =
                h.isWorking && h.breakStart && h.breakEnd && h.breakEnd <= h.breakStart;
              return (
                <div
                  key={dayIdx}
                  className={`grid grid-cols-[140px_50px_1fr_1fr_2fr] items-center gap-2 border-b px-3 py-1.5 last:border-b-0 ${hasTimeError || hasBreakError ? "bg-red-50 dark:bg-red-950/20" : ""}`}
                >
                  <span className="text-sm font-medium">{dayFull[dayIdx]}</span>
                  <Checkbox
                    checked={h.isWorking}
                    onCheckedChange={(checked) =>
                      updateDay(dayIdx, "isWorking", checked as boolean)
                    }
                  />
                  <Input
                    type="time"
                    className="h-7"
                    value={h.startTime}
                    onChange={(e) => updateDay(dayIdx, "startTime", e.target.value)}
                    disabled={!h.isWorking}
                  />
                  <Input
                    type="time"
                    className="h-7"
                    value={h.endTime}
                    onChange={(e) => updateDay(dayIdx, "endTime", e.target.value)}
                    disabled={!h.isWorking}
                  />
                  {hasBreak ? (
                    <div className="flex items-center gap-1">
                      <Input
                        type="time"
                        className="h-7"
                        value={h.breakStart}
                        onChange={(e) =>
                          updateDay(dayIdx, "breakStart", e.target.value)
                        }
                        disabled={!h.isWorking}
                      />
                      <span className="text-xs text-muted-foreground">–</span>
                      <Input
                        type="time"
                        className="h-7"
                        value={h.breakEnd}
                        onChange={(e) =>
                          updateDay(dayIdx, "breakEnd", e.target.value)
                        }
                        disabled={!h.isWorking}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          updateDay(dayIdx, "breakStart", "");
                          updateDay(dayIdx, "breakEnd", "");
                        }}
                        disabled={!h.isWorking}
                        aria-label={t("gabinet.scheduling.removeBreak")}
                      >
                        <Trash2 className="h-3.5 w-3.5" variant="stroke" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 justify-self-start text-xs"
                      onClick={() => {
                        updateDay(dayIdx, "breakStart", "12:00");
                        updateDay(dayIdx, "breakEnd", "13:00");
                      }}
                      disabled={!h.isWorking}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" variant="stroke" />
                      {t("gabinet.scheduling.addBreak")}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <SheetFooter className="border-t pt-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
