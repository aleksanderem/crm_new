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
import { Plus, Trash2 } from "@/lib/ez-icons";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";
import { PermissionGate } from "@/hooks/use-permission";
import { Skeleton } from "@/components/ui/skeleton";

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

function SchedulingSettings() {
  const { t, i18n } = useTranslation();
  const { organizationId } = useOrganization();
  const bulkSet = useAction(api.gabinet.scheduling.bulkSetWorkingHours);
  const [saving, setSaving] = useState(false);

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

      <div className="rounded-lg border">
        <div className="grid grid-cols-[180px_80px_1fr_1fr_2fr] gap-2 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>{t("gabinet.scheduling.day")}</span>
          <span>{t("gabinet.scheduling.open")}</span>
          <span>{t("gabinet.scheduling.start")}</span>
          <span>{t("gabinet.scheduling.end")}</span>
          <span>{t("gabinet.schedules.break")}</span>
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
            className={`grid grid-cols-[180px_80px_1fr_1fr_2fr] items-center gap-2 border-b px-4 py-2 last:border-b-0 ${hasTimeError || hasBreakError ? "bg-red-50 dark:bg-red-950/20" : ""}`}
          >
            <span className="text-sm font-medium">{dayNames[h.dayOfWeek]}</span>
            <Checkbox
              checked={h.isOpen}
              onCheckedChange={(checked) => updateDay(h.dayOfWeek, "isOpen", checked as boolean)}
            />
            <TimePicker5Min
              className="h-8 w-24"
              value={h.startTime}
              onChange={(v) => updateDay(h.dayOfWeek, "startTime", v)}
              disabled={!h.isOpen}
            />
            <TimePicker5Min
              className="h-8 w-24"
              value={h.endTime}
              onChange={(v) => updateDay(h.dayOfWeek, "endTime", v)}
              disabled={!h.isOpen}
            />
            {hasBreak ? (
              <div className="flex items-center gap-1">
                <TimePicker5Min
                  className="h-8 w-24"
                  value={h.breakStart}
                  onChange={(v) => updateDay(h.dayOfWeek, "breakStart", v)}
                  disabled={!h.isOpen}
                />
                <span className="text-xs text-muted-foreground">–</span>
                <TimePicker5Min
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
          </div>
        );
        })}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || validationErrors.length > 0 || breakErrors.length > 0}>
          {saving ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </div>
  );
}
