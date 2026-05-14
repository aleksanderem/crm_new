import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { FunctionArgs } from "convex/server";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import { useSupabaseGabinetLocationsList } from "@/hooks/use-supabase-gabinet-locations";
import type { MappedGabinetEmployeeSchedule } from "@/lib/supabase/mappers/gabinet/employee-schedules";
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
import { Clock, Pencil, Plus, Trash2 } from "@/lib/ez-icons";

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
    setPeriodFrom("");
    setPeriodTo("");
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
    } catch (e: any) {
      toast.error(e.message);
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
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const isEditing = editingPeriodKey !== null || addingNew;
  const today = new Date().toISOString().split("T")[0];

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
          {!isEditing && (
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
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditPeriod(period)}
                    >
                      <Pencil className="h-3.5 w-3.5" variant="stroke" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => handleDeletePeriod(period.effectiveFrom)}
                    >
                      <Trash2 className="h-3.5 w-3.5" variant="stroke" />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1 text-xs">
                  {Array.from({ length: 7 }, (_, i) => {
                    const entry = period.entries.find(
                      (e) => e.dayOfWeek === i,
                    );
                    return (
                      <div
                        key={i}
                        className={`text-center p-1 rounded ${entry?.isWorking ? "bg-primary/10" : "bg-muted text-muted-foreground"}`}
                      >
                        <div className="font-medium">
                          {dayNames[i].substring(0, 3)}
                        </div>
                        {entry?.isWorking ? (
                          <div>
                            {entry.startTime}–{entry.endTime}
                          </div>
                        ) : (
                          <div>—</div>
                        )}
                      </div>
                    );
                  })}
                </div>
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
          <Button size="sm" onClick={openNewPeriod}>
            <Plus className="mr-1 h-4 w-4" variant="stroke" />
            {t("gabinet.employees.schedule.addPeriod")}
          </Button>
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

            <div className="rounded-lg border">
              <div className="grid grid-cols-[140px_50px_1fr_1fr_2fr_1fr] gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                <span>{t("gabinet.scheduling.day")}</span>
                <span>{t("gabinet.scheduling.open")}</span>
                <span>{t("gabinet.scheduling.start")}</span>
                <span>{t("gabinet.scheduling.end")}</span>
                <span>{t("gabinet.schedules.break")}</span>
                <span>{t("gabinet.appointments.location")}</span>
              </div>

              {periodHours.map((h) => {
                const hasBreak = Boolean(h.breakStart || h.breakEnd);
                return (
                  <div
                    key={h.dayOfWeek}
                    className="grid grid-cols-[140px_50px_1fr_1fr_2fr_1fr] items-center gap-2 border-b px-3 py-1.5 last:border-b-0"
                  >
                    <span className="text-sm font-medium">
                      {dayNames[h.dayOfWeek]}
                    </span>
                    <Checkbox
                      checked={h.isWorking}
                      onCheckedChange={(checked) =>
                        updateDay(h.dayOfWeek, "isWorking", checked as boolean)
                      }
                    />
                    <Input
                      type="time"
                      className="h-7 w-22"
                      value={h.startTime}
                      onChange={(e) =>
                        updateDay(h.dayOfWeek, "startTime", e.target.value)
                      }
                      disabled={!h.isWorking}
                    />
                    <Input
                      type="time"
                      className="h-7 w-22"
                      value={h.endTime}
                      onChange={(e) =>
                        updateDay(h.dayOfWeek, "endTime", e.target.value)
                      }
                      disabled={!h.isWorking}
                    />
                    {hasBreak ? (
                      <div className="flex items-center gap-1">
                        <Input
                          type="time"
                          className="h-7 w-22"
                          value={h.breakStart}
                          onChange={(e) =>
                            updateDay(
                              h.dayOfWeek,
                              "breakStart",
                              e.target.value,
                            )
                          }
                          disabled={!h.isWorking}
                        />
                        <span className="text-xs text-muted-foreground">–</span>
                        <Input
                          type="time"
                          className="h-7 w-22"
                          value={h.breakEnd}
                          onChange={(e) =>
                            updateDay(h.dayOfWeek, "breakEnd", e.target.value)
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
                  </div>
                );
              })}
            </div>

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
