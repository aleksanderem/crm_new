import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { FunctionArgs } from "convex/server";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import { useSupabaseGabinetLocationsList } from "@/hooks/use-supabase-gabinet-locations";
import type { MappedGabinetEmployeeSchedule } from "@/lib/supabase/mappers/gabinet/employee-schedules";
import { usePermission } from "@/hooks/use-permission";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Clock, Pencil, Plus, Trash2, MoreHorizontal } from "@/lib/ez-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatActionError } from "@/lib/format-action-error";
import { TimePicker5Min } from "@/components/gabinet/calendar/time-picker-5min";

export interface FlexibleClinicHours {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isOpen: boolean;
  breakStart?: string;
  breakEnd?: string;
}

export interface SchedulePeriod {
  effectiveFrom?: string;
  effectiveTo?: string;
  entries: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isWorking: boolean;
    breakStart?: string;
    breakEnd?: string;
    locationId?: string;
  }>;
}

interface DaySchedule {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isWorking: boolean;
  breakStart: string;
  breakEnd: string;
  locationId: string;
}

const DAY_NAMES_EN = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const DAY_NAMES_PL = [
  "Niedziela",
  "Poniedziałek",
  "Wtorek",
  "Środa",
  "Czwartek",
  "Piątek",
  "Sobota",
];

function parseIsoDate(iso: string): Date | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d));
}

function formatShortDate(d: Date, lang: string): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return lang === "pl" ? `${day}.${month}` : `${month}/${day}`;
}

// Display order: Mon..Sun. Convex/Supabase stores dayOfWeek 0=Sun..6=Sat.
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function getMondayOfDate(d: Date): Date {
  const result = new Date(d);
  const dow = result.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  result.setDate(result.getDate() + offset);
  return result;
}

function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getCurrentWeekRange(): { from: string; to: string } {
  const monday = getMondayOfDate(new Date());
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  return { from: toLocalIsoDate(monday), to: toLocalIsoDate(sunday) };
}

interface PeriodWeek {
  monday: Date;
  sunday: Date;
  days: Array<{ dayOfWeek: number; date: Date; inRange: boolean }>;
}

function getWeeksInPeriod(from: string, to: string): PeriodWeek[] {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  if (!start || !end || start > end) return [];
  const cursor = getMondayOfDate(start);
  const result: PeriodWeek[] = [];
  while (cursor <= end) {
    const monday = new Date(cursor);
    const sunday = new Date(cursor);
    sunday.setDate(sunday.getDate() + 6);
    const days = DISPLAY_ORDER.map((dayOfWeek) => {
      const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const date = new Date(monday);
      date.setDate(monday.getDate() + offset);
      return {
        dayOfWeek,
        date,
        inRange: date >= start && date <= end,
      };
    });
    result.push({ monday, sunday, days });
    cursor.setDate(cursor.getDate() + 7);
  }
  return result;
}

function formatWeekRange(week: PeriodWeek, lang: string): string {
  return `${formatShortDate(week.monday, lang)} – ${formatShortDate(week.sunday, lang)}`;
}

export function groupSchedulesIntoPeriods(
  schedules: MappedGabinetEmployeeSchedule[] | undefined,
): SchedulePeriod[] {
  if (!schedules) return [];
  const periodMap = new Map<string, MappedGabinetEmployeeSchedule[]>();
  for (const entry of schedules) {
    const key = entry.effectiveFrom ?? "";
    if (!periodMap.has(key)) periodMap.set(key, []);
    periodMap.get(key)!.push(entry);
  }
  return [...periodMap.entries()]
    .map(([from, entries]) => ({
      effectiveFrom: from || undefined,
      effectiveTo: entries[0]?.effectiveTo ?? undefined,
      entries: entries
        .map((e) => ({
          dayOfWeek: e.dayOfWeek,
          startTime: e.startTime,
          endTime: e.endTime,
          isWorking: e.isWorking,
          breakStart: e.breakStart,
          breakEnd: e.breakEnd,
          locationId: e.locationId,
        }))
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek),
    }))
    .sort((a, b) =>
      (a.effectiveFrom ?? "").localeCompare(b.effectiveFrom ?? ""),
    );
}

/**
 * Return the period that is active for the given ISO date (YYYY-MM-DD).
 * Priority: dated period covering the date wins over the default period.
 */
export function findActivePeriod(
  periods: SchedulePeriod[],
  date: string,
): SchedulePeriod | undefined {
  const dated = periods.filter((p) => p.effectiveFrom);
  const activeDated = dated.find(
    (p) =>
      (!p.effectiveFrom || p.effectiveFrom <= date) &&
      (!p.effectiveTo || p.effectiveTo >= date),
  );
  if (activeDated) return activeDated;
  return periods.find((p) => !p.effectiveFrom);
}

export function FlexibleScheduleEditor({
  organizationId,
  userId,
  periods,
  clinicHours,
  onSavePeriod,
  onRemovePeriod,
  onSaveLegacy,
  onManageLeaves,
}: {
  organizationId: Id<"organizations">;
  userId: Id<"users">;
  periods: SchedulePeriod[];
  clinicHours: FlexibleClinicHours[];
  onSavePeriod: (
    args: FunctionArgs<typeof api.gabinet.scheduling.saveSchedulePeriod>,
  ) => Promise<void>;
  onRemovePeriod: (
    args: FunctionArgs<typeof api.gabinet.scheduling.removeSchedulePeriod>,
  ) => Promise<void>;
  onSaveLegacy: (
    args: FunctionArgs<typeof api.gabinet.scheduling.bulkSetEmployeeSchedule>,
  ) => Promise<void>;
  onManageLeaves?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { data: locations } = useSupabaseGabinetLocationsList(organizationId);
  const { allowed: canEdit } = usePermission("gabinet_employees", "edit");
  const [saving, setSaving] = useState(false);
  const [editingPeriodKey, setEditingPeriodKey] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [periodHours, setPeriodHours] = useState<DaySchedule[]>(() =>
    buildDefaultSchedule(clinicHours),
  );

  function buildDefaultSchedule(
    clinic: FlexibleClinicHours[],
  ): DaySchedule[] {
    return Array.from({ length: 7 }, (_, i) => {
      const clinicDay = clinic.find((h) => h.dayOfWeek === i);
      if (clinicDay) {
        return {
          dayOfWeek: i,
          startTime: clinicDay.startTime,
          endTime: clinicDay.endTime,
          isWorking: clinicDay.isOpen,
          breakStart: clinicDay.breakStart ?? "",
          breakEnd: clinicDay.breakEnd ?? "",
          locationId: "",
        };
      }
      return {
        dayOfWeek: i,
        startTime: "08:00",
        endTime: "17:00",
        isWorking: i >= 1 && i <= 5,
        breakStart: "",
        breakEnd: "",
        locationId: "",
      };
    });
  }

  const dayNames = i18n.language === "pl" ? DAY_NAMES_PL : DAY_NAMES_EN;

  const openEditPeriod = (period: SchedulePeriod) => {
    setEditingPeriodKey(period.effectiveFrom ?? "");
    setPeriodFrom(period.effectiveFrom ?? "");
    setPeriodTo(period.effectiveTo ?? "");
    const hours = Array.from({ length: 7 }, (_, i) => {
      const entry = period.entries.find((e) => e.dayOfWeek === i);
      return {
        dayOfWeek: i,
        startTime: entry?.startTime ?? "08:00",
        endTime: entry?.endTime ?? "17:00",
        isWorking: entry?.isWorking ?? (i >= 1 && i <= 5),
        breakStart: entry?.breakStart ?? "",
        breakEnd: entry?.breakEnd ?? "",
        locationId: entry?.locationId ?? "",
      };
    });
    setPeriodHours(hours);
    setAddingNew(false);
  };

  const openNewPeriod = () => {
    setAddingNew(true);
    setEditingPeriodKey(null);
    const { from, to } = getCurrentWeekRange();
    setPeriodFrom(from);
    setPeriodTo(to);
    setPeriodHours(buildDefaultSchedule(clinicHours));
  };

  const cancelEdit = () => {
    setEditingPeriodKey(null);
    setAddingNew(false);
  };

  const updateDay = (
    dayOfWeek: number,
    field: keyof DaySchedule,
    value: string | boolean,
  ) => {
    setPeriodHours((prev) =>
      prev.map((h) =>
        h.dayOfWeek === dayOfWeek ? { ...h, [field]: value } : h,
      ),
    );
  };

  const copyHoursTo = (sourceDayOfWeek: number, target: "weekdays" | "all") => {
    const src = periodHours.find((h) => h.dayOfWeek === sourceDayOfWeek);
    if (!src) return;
    setPeriodHours((prev) =>
      prev.map((h) => {
        const isTarget = target === "all" || (h.dayOfWeek >= 1 && h.dayOfWeek <= 5);
        if (!isTarget || h.dayOfWeek === sourceDayOfWeek) return h;
        return { ...h, startTime: src.startTime, endTime: src.endTime, isWorking: src.isWorking, breakStart: src.breakStart, breakEnd: src.breakEnd };
      }),
    );
  };

  const handleSavePeriod = async () => {
    setSaving(true);
    try {
      if (periodFrom || periodTo) {
        await onSavePeriod({
          organizationId,
          userId,
          effectiveFrom: periodFrom || undefined,
          effectiveTo: periodTo || undefined,
          hours: periodHours.map((h) => ({
            dayOfWeek: h.dayOfWeek,
            startTime: h.startTime,
            endTime: h.endTime,
            isWorking: h.isWorking,
            breakStart: h.breakStart || undefined,
            breakEnd: h.breakEnd || undefined,
            locationId: h.locationId || undefined,
          })),
        });
      } else {
        await onSaveLegacy({
          organizationId,
          userId,
          hours: periodHours.map((h) => ({
            dayOfWeek: h.dayOfWeek,
            startTime: h.startTime,
            endTime: h.endTime,
            isWorking: h.isWorking,
            breakStart: h.breakStart || undefined,
            breakEnd: h.breakEnd || undefined,
            locationId: h.locationId || undefined,
          })),
        });
      }
      toast.success(t("common.saved"));
      cancelEdit();
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.scheduling.errors.saveFailed",
          defaultValue: "Nie udało się zapisać godzin pracy.",
        }),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePeriod = async (effectiveFrom?: string) => {
    if (!window.confirm(t("gabinet.employees.schedule.confirmDeletePeriod")))
      return;
    try {
      await onRemovePeriod({
        organizationId,
        userId,
        effectiveFrom: effectiveFrom || undefined,
      });
      toast.success(t("common.deleted"));
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.scheduling.errors.deleteFailed",
          defaultValue: "Nie udało się usunąć harmonogramu.",
        }),
      );
    }
  };

  const isEditing = editingPeriodKey !== null || addingNew;
  const today = new Date().toISOString().split("T")[0];

  const renderWeekTable = (
    period: SchedulePeriod,
    week: PeriodWeek | null,
    label: string,
  ) => (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-muted/50 text-[10px] font-medium text-muted-foreground">
            <th className="px-2 py-1 text-left whitespace-nowrap">{label}</th>
            {DISPLAY_ORDER.map((dayOfWeek) => {
              const dayInfo = week?.days.find(
                (d) => d.dayOfWeek === dayOfWeek,
              );
              return (
                <th
                  key={dayOfWeek}
                  className="px-1.5 py-1 text-center min-w-[64px]"
                >
                  <div className="leading-tight">
                    {dayNames[dayOfWeek].substring(0, 3)}
                  </div>
                  {dayInfo && (
                    <div className="text-[9px] font-normal text-muted-foreground">
                      {formatShortDate(dayInfo.date, i18n.language)}
                    </div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-2 py-1.5 text-[10px] text-muted-foreground" />
            {DISPLAY_ORDER.map((dayOfWeek) => {
              const entry = period.entries.find(
                (e) => e.dayOfWeek === dayOfWeek,
              );
              const dayInfo = week?.days.find(
                (d) => d.dayOfWeek === dayOfWeek,
              );
              const inRange = !week || (dayInfo?.inRange ?? false);
              const working = entry?.isWorking && inRange;
              return (
                <td
                  key={dayOfWeek}
                  className={`px-1.5 py-1.5 text-center align-middle ${
                    working ? "bg-primary/10" : "text-muted-foreground"
                  }`}
                >
                  {working ? (
                    <div className="leading-tight">
                      <div className="font-medium">
                        {entry.startTime}–{entry.endTime}
                      </div>
                      {entry.breakStart && entry.breakEnd && (
                        <div className="text-[9px] text-muted-foreground">
                          {entry.breakStart}–{entry.breakEnd}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span>—</span>
                  )}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );

  const renderPeriodPreview = (period: SchedulePeriod) => {
    const weeks =
      period.effectiveFrom && period.effectiveTo
        ? getWeeksInPeriod(period.effectiveFrom, period.effectiveTo)
        : [];
    if (weeks.length === 0) {
      return renderWeekTable(
        period,
        null,
        t("gabinet.employees.schedule.weeklyPattern"),
      );
    }
    return (
      <div className="flex flex-col gap-2">
        {weeks.map((week) => (
          <div key={week.monday.toISOString()}>
            {renderWeekTable(period, week, formatWeekRange(week, i18n.language))}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4" variant="stroke" />
            {t("gabinet.employees.tabs.schedule")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {periods.length > 0
              ? t("gabinet.employees.schedule.hasOverrides")
              : t("gabinet.employees.schedule.usingClinicDefaults")}
          </p>
        </div>
        <div className="flex gap-2">
          {onManageLeaves && (
            <Button variant="outline" size="sm" onClick={onManageLeaves}>
              {t("gabinet.employees.schedule.manageLeaves")}
            </Button>
          )}
          {!isEditing && canEdit && (
            <Button size="sm" onClick={openNewPeriod}>
              <Plus className="mr-1 h-4 w-4" variant="stroke" />
              {t("gabinet.employees.schedule.addPeriod")}
            </Button>
          )}
        </div>
      </div>

      {!isEditing && periods.length > 0 && (
        <div className="space-y-3">
          {periods.map((period, idx) => {
            const isActive =
              (!period.effectiveFrom || period.effectiveFrom <= today) &&
              (!period.effectiveTo || period.effectiveTo >= today);
            const label = period.effectiveFrom
              ? `${period.effectiveFrom}${period.effectiveTo ? ` — ${period.effectiveTo}` : ` — ${t("gabinet.employees.schedule.ongoing")}`}`
              : t("gabinet.employees.schedule.defaultPeriod");
            return (
              <Card
                key={period.effectiveFrom ?? `default-${idx}`}
                className={`p-4 ${isActive ? "border-primary/50" : ""}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{label}</span>
                    {isActive && (
                      <Badge variant="default" className="text-xs">
                        {t("gabinet.employees.schedule.active")}
                      </Badge>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditPeriod(period)}
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" variant="stroke" />
                        {t("common.edit")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDeletePeriod(period.effectiveFrom)}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" variant="stroke" />
                        {t("common.delete")}
                      </Button>
                    </div>
                  )}
                </div>
                {renderPeriodPreview(period)}
              </Card>
            );
          })}
        </div>
      )}

      {!isEditing && periods.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Clock
            className="h-8 w-8 text-muted-foreground/40 mb-2"
            variant="stroke"
          />
          <p className="text-sm text-muted-foreground mb-3">
            {t("gabinet.employees.schedule.usingClinicDefaults")}
          </p>
          {canEdit && (
            <Button size="sm" onClick={openNewPeriod}>
              <Plus className="mr-1 h-4 w-4" variant="stroke" />
              {t("gabinet.employees.schedule.addPeriod")}
            </Button>
          )}
        </div>
      )}

      {isEditing && (
        <Card className="p-4">
          <div className="space-y-4">
            <h4 className="font-medium">
              {addingNew
                ? t("gabinet.employees.schedule.newPeriod")
                : t("gabinet.employees.schedule.editPeriod")}
            </h4>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>
                  {t("gabinet.employees.schedule.effectiveFrom")}
                </Label>
                <Input
                  type="date"
                  value={periodFrom}
                  onChange={(e) => setPeriodFrom(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t("gabinet.employees.schedule.effectiveFromHint")}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>{t("gabinet.employees.schedule.effectiveTo")}</Label>
                <Input
                  type="date"
                  value={periodTo}
                  onChange={(e) => setPeriodTo(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t("gabinet.employees.schedule.effectiveToHint")}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
            <div className="rounded-lg border min-w-[640px]">
              <div className="grid grid-cols-[180px_50px_1fr_1fr_2fr_1fr_32px] gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                <span>{t("gabinet.scheduling.day")}</span>
                <span>{t("gabinet.scheduling.open")}</span>
                <span>{t("gabinet.scheduling.start")}</span>
                <span>{t("gabinet.scheduling.end")}</span>
                <span>{t("gabinet.schedules.break")}</span>
                <span>{t("gabinet.appointments.location")}</span>
                <span />
              </div>

              {DISPLAY_ORDER.map((dayOfWeek) => {
                const h = periodHours.find((p) => p.dayOfWeek === dayOfWeek);
                if (!h) return null;
                const hasBreak = Boolean(h.breakStart || h.breakEnd);
                return (
                  <div
                    key={h.dayOfWeek}
                    className="grid grid-cols-[180px_50px_1fr_1fr_2fr_1fr_32px] items-center gap-2 border-b px-3 py-1.5 last:border-b-0"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">
                        {dayNames[h.dayOfWeek]}
                      </span>
                    </div>
                    <Checkbox
                      checked={h.isWorking}
                      onCheckedChange={(checked) =>
                        updateDay(h.dayOfWeek, "isWorking", checked as boolean)
                      }
                    />
                    <TimePicker5Min
                      allowTyping
                      stepMinutes={15}
                      className="h-7 w-22"
                      value={h.startTime}
                      onChange={(v) =>
                        updateDay(h.dayOfWeek, "startTime", v)
                      }
                      disabled={!h.isWorking}
                    />
                    <TimePicker5Min
                      allowTyping
                      stepMinutes={15}
                      className="h-7 w-22"
                      value={h.endTime}
                      onChange={(v) =>
                        updateDay(h.dayOfWeek, "endTime", v)
                      }
                      disabled={!h.isWorking}
                    />
                    {hasBreak ? (
                      <div className="flex items-center gap-1">
                        <TimePicker5Min
                          allowTyping
                          stepMinutes={15}
                          className="h-7 w-22"
                          value={h.breakStart}
                          onChange={(v) =>
                            updateDay(h.dayOfWeek, "breakStart", v)
                          }
                          disabled={!h.isWorking}
                        />
                        <span className="text-xs text-muted-foreground">–</span>
                        <TimePicker5Min
                          allowTyping
                          stepMinutes={15}
                          className="h-7 w-22"
                          value={h.breakEnd}
                          onChange={(v) =>
                            updateDay(h.dayOfWeek, "breakEnd", v)
                          }
                          disabled={!h.isWorking}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            updateDay(h.dayOfWeek, "breakStart", "");
                            updateDay(h.dayOfWeek, "breakEnd", "");
                          }}
                          disabled={!h.isWorking}
                          aria-label={t("gabinet.scheduling.removeBreak")}
                          title={t("gabinet.scheduling.removeBreak")}
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
                          updateDay(h.dayOfWeek, "breakStart", "12:00");
                          updateDay(h.dayOfWeek, "breakEnd", "13:00");
                        }}
                        disabled={!h.isWorking}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" variant="stroke" />
                        {t("gabinet.scheduling.addBreak")}
                      </Button>
                    )}
                    <Select
                      value={h.locationId || "none"}
                      onValueChange={(val) =>
                        updateDay(
                          h.dayOfWeek,
                          "locationId",
                          val === "none" ? "" : val,
                        )
                      }
                      disabled={!h.isWorking}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          {t("common.none")}
                        </SelectItem>
                        {locations
                          ?.filter((l) => l.isActive)
                          .map((l) => (
                            <SelectItem key={l._id} value={l._id}>
                              {l.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground"
                          aria-label={t("gabinet.scheduling.copyHours", "Kopiuj godziny")}
                        >
                          <MoreHorizontal className="h-4 w-4" variant="stroke" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => copyHoursTo(h.dayOfWeek, "weekdays")}>
                          {t("gabinet.scheduling.applyToWeekdays", "Zastosuj do dni roboczych")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copyHoursTo(h.dayOfWeek, "all")}>
                          {t("gabinet.scheduling.applyToAllDays", "Zastosuj do wszystkich dni")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
            </div>

            {periodFrom && periodTo && (
              <div className="space-y-2">
                <h5 className="text-xs font-medium text-muted-foreground">
                  {t("gabinet.employees.schedule.calendarPreview")}
                </h5>
                {renderPeriodPreview({
                  effectiveFrom: periodFrom,
                  effectiveTo: periodTo,
                  entries: periodHours.map((h) => ({
                    dayOfWeek: h.dayOfWeek,
                    startTime: h.startTime,
                    endTime: h.endTime,
                    isWorking: h.isWorking,
                    breakStart: h.breakStart || undefined,
                    breakEnd: h.breakEnd || undefined,
                    locationId: h.locationId || undefined,
                  })),
                })}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={cancelEdit}>
                {t("common.cancel")}
              </Button>
              <Button
                size="sm"
                onClick={handleSavePeriod}
                disabled={saving}
              >
                {saving ? t("common.saving") : t("common.save")}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
