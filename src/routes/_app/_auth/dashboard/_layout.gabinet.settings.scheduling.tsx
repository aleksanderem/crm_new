import { createFileRoute } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useSupabaseGabinetWorkingHoursList } from "@/hooks/use-supabase-gabinet-working-hours";
import { SectionHeader } from "@untitled/app/section-headers/section-headers";
import { UntitledAlert } from "@/components/ui/untitled-alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TimePicker5Min } from "@/components/gabinet/calendar/time-picker-5min";
import { Plus, Trash2, MoreHorizontal } from "@/lib/ez-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";
import { PermissionGate, usePermission } from "@/hooks/use-permission";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useSupabaseActivitiesByEntity } from "@/hooks/use-supabase-activities";
import { ActivityTimeline } from "@/components/activity-timeline/activity-timeline";
import type { ActivityWithMetadata } from "@/components/activity-timeline/presenter/activity-presenter";

function SchedulingSettingsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/settings/scheduling"
)({
  component: () => (
    <PermissionGate feature="gabinet_settings" action="view" loadingFallback={<SchedulingSettingsSkeleton />}>
      <SchedulingSettings />
    </PermissionGate>
  ),
});

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_NAMES_PL = ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"];
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

interface DayHours {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isOpen: boolean;
  breakStart: string;
  breakEnd: string;
}

const DEFAULT_HOURS: DayHours[] = Array.from({ length: 7 }, (_, i) => ({
  dayOfWeek: i,
  startTime: "08:00",
  endTime: "17:00",
  isOpen: i >= 1 && i <= 5, // Mon-Fri open
  breakStart: "12:00",
  breakEnd: "13:00",
}));

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function getBookableMinutes(h: DayHours): number {
  if (!h.isOpen) return 0;
  const total = timeToMinutes(h.endTime) - timeToMinutes(h.startTime);
  if (h.breakStart && h.breakEnd && h.breakEnd > h.breakStart) {
    return total - (timeToMinutes(h.breakEnd) - timeToMinutes(h.breakStart));
  }
  return total;
}

function AvailabilityPreview({ hours, dayNames }: { hours: DayHours[]; dayNames: string[] }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="mb-3">
        <p className="text-sm font-medium">{t("gabinet.scheduling.preview")}</p>
        <p className="text-xs text-muted-foreground">{t("gabinet.scheduling.previewDescription")}</p>
      </div>
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {DISPLAY_ORDER.map((dayOfWeek) => {
          const h = hours.find((x) => x.dayOfWeek === dayOfWeek);
          if (!h) return null;
          const bookable = getBookableMinutes(h);
          const bookableH = Math.floor(bookable / 60);
          const bookableM = bookable % 60;
          const hasBreak = h.isOpen && h.breakStart && h.breakEnd && h.breakEnd > h.breakStart;
          return (
            <div key={dayOfWeek} className="flex flex-col gap-0.5 rounded-md border bg-background px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium">{dayNames[dayOfWeek]}</span>
                {h.isOpen ? (
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-green-700 border-green-300 bg-green-50 dark:text-green-400 dark:border-green-800 dark:bg-green-950/30">
                    {h.startTime}–{h.endTime}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-muted-foreground">
                    {t("gabinet.scheduling.closed")}
                  </Badge>
                )}
              </div>
              {h.isOpen && (
                <div className="text-[10px] text-muted-foreground">
                  {t("gabinet.scheduling.bookableHours", { hours: bookableH, minutes: bookableM })}
                  {hasBreak && (
                    <span className="ml-1">
                      · {t("gabinet.scheduling.withBreak", { start: h.breakStart, end: h.breakEnd })}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SchedulingSettings() {
  const { t, i18n } = useTranslation();
  const { organizationId } = useOrganization();
  const { allowed: canEdit } = usePermission("gabinet_settings", "edit");
  const bulkSet = useAction(api.gabinet.scheduling.bulkSetWorkingHours);
  const [saving, setSaving] = useState(false);

  const { data: workingHoursActivities } = useSupabaseActivitiesByEntity(
    organizationId,
    "gabinetWorkingHours",
    organizationId,
  );

  const { data: existing } = useSupabaseGabinetWorkingHoursList(organizationId);

  const [hours, setHours] = useState<DayHours[]>(DEFAULT_HOURS);

  useEffect(() => {
    if (existing && existing.length > 0) {
      const merged = DEFAULT_HOURS.map((def) => {
        const found = existing.find((e) => e.dayOfWeek === def.dayOfWeek);
        if (found) {
          return {
            dayOfWeek: found.dayOfWeek,
            startTime: found.startTime,
            endTime: found.endTime,
            isOpen: found.isOpen,
            breakStart: found.breakStart ?? "",
            breakEnd: found.breakEnd ?? "",
          };
        }
        return def;
      });
      setHours(merged);
    }
  }, [existing]);

  const updateDay = (dayOfWeek: number, field: keyof DayHours, value: string | boolean) => {
    setHours((prev) =>
      prev.map((h) => (h.dayOfWeek === dayOfWeek ? { ...h, [field]: value } : h))
    );
  };

  const copyHoursTo = (sourceDayOfWeek: number, target: "weekdays" | "all") => {
    const src = hours.find((h) => h.dayOfWeek === sourceDayOfWeek);
    if (!src) return;
    setHours((prev) =>
      prev.map((h) => {
        const isTarget = target === "all" || (h.dayOfWeek >= 1 && h.dayOfWeek <= 5);
        if (!isTarget || h.dayOfWeek === sourceDayOfWeek) return h;
        return { ...h, startTime: src.startTime, endTime: src.endTime, isOpen: src.isOpen, breakStart: src.breakStart, breakEnd: src.breakEnd };
      }),
    );
  };

  const validationErrors = hours
    .filter((h) => h.isOpen && h.endTime <= h.startTime)
    .map((h) => dayNames[h.dayOfWeek]);

  const breakErrors = hours
    .filter(
      (h) =>
        h.isOpen &&
        h.breakStart &&
        h.breakEnd &&
        h.breakEnd <= h.breakStart
    )
    .map((h) => dayNames[h.dayOfWeek]);

  const handleSave = async () => {
    if (validationErrors.length > 0) {
      toast.error(
        t("gabinet.scheduling.validationEndAfterStart", {
          days: validationErrors.join(", "),
        })
      );
      return;
    }
    if (breakErrors.length > 0) {
      toast.error(
        t("gabinet.scheduling.validationBreakEndAfterStart", {
          days: breakErrors.join(", "),
        })
      );
      return;
    }
    setSaving(true);
    try {
      await bulkSet({
        organizationId,
        hours: hours.map((h) => ({
          dayOfWeek: h.dayOfWeek,
          startTime: h.startTime,
          endTime: h.endTime,
          isOpen: h.isOpen,
          breakStart: h.breakStart || undefined,
          breakEnd: h.breakEnd || undefined,
        })),
      });
      toast.success(t("common.saved"));
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

  const dayNames = i18n.language === "pl" ? DAY_NAMES_PL : DAY_NAMES;

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <SectionHeader.Root className="pt-4">
        <SectionHeader.Group>
          <SectionHeader.Heading className="flex-1">
            {t("gabinet.scheduling.title")}
          </SectionHeader.Heading>
        </SectionHeader.Group>
        <UntitledAlert>{t("gabinet.scheduling.description")}</UntitledAlert>
      </SectionHeader.Root>

      <div className="rounded-lg border overflow-x-auto">
        <div className="grid grid-cols-[180px_80px_1fr_1fr_2fr_32px] gap-2 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground min-w-[620px]">
          <span>{t("gabinet.scheduling.day")}</span>
          <span>{t("gabinet.scheduling.open")}</span>
          <span>{t("gabinet.scheduling.start")}</span>
          <span>{t("gabinet.scheduling.end")}</span>
          <span>{t("gabinet.schedules.break")}</span>
          <span />
        </div>

        {DISPLAY_ORDER.map((dayOfWeek) => {
          const h = hours.find((x) => x.dayOfWeek === dayOfWeek);
          if (!h) return null;
          const hasTimeError = h.isOpen && h.endTime <= h.startTime;
          const hasBreakError = h.isOpen && h.breakStart && h.breakEnd && h.breakEnd <= h.breakStart;
          const hasBreak = Boolean(h.breakStart || h.breakEnd);
          return (
          <div
            key={h.dayOfWeek}
            className={`grid grid-cols-[180px_80px_1fr_1fr_2fr_32px] items-center gap-2 border-b px-4 py-2 last:border-b-0 min-w-[620px] ${hasTimeError || hasBreakError ? "bg-red-50 dark:bg-red-950/20" : ""}`}
          >
            <span className="text-sm font-medium">{dayNames[h.dayOfWeek]}</span>
            <Checkbox
              checked={h.isOpen}
              onCheckedChange={(checked) => updateDay(h.dayOfWeek, "isOpen", checked as boolean)}
            />
            <TimePicker5Min
              allowTyping
              className="h-8 w-24"
              value={h.startTime}
              onChange={(v) => updateDay(h.dayOfWeek, "startTime", v)}
              disabled={!h.isOpen}
            />
            <TimePicker5Min
              allowTyping
              className="h-8 w-24"
              value={h.endTime}
              onChange={(v) => updateDay(h.dayOfWeek, "endTime", v)}
              disabled={!h.isOpen}
            />
            {hasBreak ? (
              <div className="flex items-center gap-1">
                <TimePicker5Min
                  allowTyping
                  className="h-8 w-24"
                  value={h.breakStart}
                  onChange={(v) => updateDay(h.dayOfWeek, "breakStart", v)}
                  disabled={!h.isOpen}
                />
                <span className="text-xs text-muted-foreground">–</span>
                <TimePicker5Min
                  allowTyping
                  className="h-8 w-24"
                  value={h.breakEnd}
                  onChange={(v) => updateDay(h.dayOfWeek, "breakEnd", v)}
                  disabled={!h.isOpen}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    updateDay(h.dayOfWeek, "breakStart", "");
                    updateDay(h.dayOfWeek, "breakEnd", "");
                  }}
                  disabled={!h.isOpen}
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
                className="h-8 justify-self-start text-xs"
                onClick={() => {
                  updateDay(h.dayOfWeek, "breakStart", "12:00");
                  updateDay(h.dayOfWeek, "breakEnd", "13:00");
                }}
                disabled={!h.isOpen}
              >
                <Plus className="mr-1 h-3.5 w-3.5" variant="stroke" />
                {t("gabinet.scheduling.addBreak")}
              </Button>
            )}
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

      <AvailabilityPreview hours={hours} dayNames={dayNames} />

      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving || validationErrors.length > 0 || breakErrors.length > 0}>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      )}

      {workingHoursActivities && workingHoursActivities.length > 0 && (
        <div className="space-y-1.5 border-t pt-4">
          <p className="text-xs font-medium text-muted-foreground">{t("dashboard.recentActivity")}</p>
          <ActivityTimeline
            activities={workingHoursActivities as ActivityWithMetadata[]}
            maxHeight="240px"
          />
        </div>
      )}
    </div>
  );
}
