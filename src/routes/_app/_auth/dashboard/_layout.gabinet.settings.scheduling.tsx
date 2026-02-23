import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/settings/scheduling"
)({
  component: SchedulingSettings,
});

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_NAMES_PL = ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"];

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
  const bulkSet = useMutation(api["gabinet/scheduling"].bulkSetWorkingHours);
  const [saving, setSaving] = useState(false);

  const { data: existing } = useQuery(
    convexQuery(api["gabinet/scheduling"].getWorkingHours, { organizationId })
  );

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

  const handleSave = async () => {
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
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const dayNames = i18n.language === "pl" ? DAY_NAMES_PL : DAY_NAMES;

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title={t("gabinet.scheduling.title")} description={t("gabinet.scheduling.description")} />

      <div className="rounded-lg border">
        <div className="grid grid-cols-[180px_80px_1fr_1fr_1fr_1fr] gap-2 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>{t("gabinet.scheduling.day")}</span>
          <span>{t("gabinet.scheduling.open")}</span>
          <span>{t("gabinet.scheduling.start")}</span>
          <span>{t("gabinet.scheduling.end")}</span>
          <span>{t("gabinet.scheduling.breakStart")}</span>
          <span>{t("gabinet.scheduling.breakEnd")}</span>
        </div>

        {hours.map((h) => (
          <div
            key={h.dayOfWeek}
            className="grid grid-cols-[180px_80px_1fr_1fr_1fr_1fr] items-center gap-2 border-b px-4 py-2 last:border-b-0"
          >
            <span className="text-sm font-medium">{dayNames[h.dayOfWeek]}</span>
            <Checkbox
              checked={h.isOpen}
              onCheckedChange={(checked) => updateDay(h.dayOfWeek, "isOpen", checked as boolean)}
            />
            <Input
              type="time"
              className="h-8 w-24"
              value={h.startTime}
              onChange={(e) => updateDay(h.dayOfWeek, "startTime", e.target.value)}
              disabled={!h.isOpen}
            />
            <Input
              type="time"
              className="h-8 w-24"
              value={h.endTime}
              onChange={(e) => updateDay(h.dayOfWeek, "endTime", e.target.value)}
              disabled={!h.isOpen}
            />
            <Input
              type="time"
              className="h-8 w-24"
              value={h.breakStart}
              onChange={(e) => updateDay(h.dayOfWeek, "breakStart", e.target.value)}
              disabled={!h.isOpen}
            />
            <Input
              type="time"
              className="h-8 w-24"
              value={h.breakEnd}
              onChange={(e) => updateDay(h.dayOfWeek, "breakEnd", e.target.value)}
              disabled={!h.isOpen}
            />
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </div>
  );
}
