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
  "/_app/_auth/dashboard/_layout/gabinet/settings/reminders"
)({
  component: ReminderSettings,
});

function ReminderSettings() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const upsertSettings = useMutation(api.orgSettings.upsert);
  const [saving, setSaving] = useState(false);

  const { data: orgSettings } = useQuery(
    convexQuery(api.orgSettings.get, { organizationId })
  );

  const [enabled, setEnabled] = useState(false);
  const [hoursBefore, setHoursBefore] = useState(24);

  useEffect(() => {
    if (orgSettings) {
      setEnabled(orgSettings.reminderEnabled ?? false);
      setHoursBefore(orgSettings.reminderHoursBefore ?? 24);
    }
  }, [orgSettings]);

  const handleSave = async () => {
    if (hoursBefore < 1 || hoursBefore > 168) {
      toast.error(t("gabinet.reminders.hoursBeforeDescription"));
      return;
    }
    setSaving(true);
    try {
      await upsertSettings({
        organizationId,
        reminderEnabled: enabled,
        reminderHoursBefore: hoursBefore,
      });
      toast.success(t("gabinet.reminders.saved"));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t("gabinet.reminders.title")}
        description={t("gabinet.reminders.description")}
      />

      <div className="max-w-lg space-y-6">
        <div className="flex items-start gap-3">
          <Checkbox
            id="reminderEnabled"
            checked={enabled}
            onCheckedChange={(checked) => setEnabled(checked === true)}
          />
          <div className="grid gap-1 leading-none">
            <Label htmlFor="reminderEnabled">
              {t("gabinet.reminders.enabled")}
            </Label>
            <p className="text-muted-foreground text-sm">
              {t("gabinet.reminders.enabledDescription")}
            </p>
          </div>
        </div>

        {enabled && (
          <div className="space-y-2">
            <Label htmlFor="hoursBefore">
              {t("gabinet.reminders.hoursBefore")}
            </Label>
            <Input
              id="hoursBefore"
              type="number"
              className="w-32"
              min={1}
              max={168}
              value={hoursBefore}
              onChange={(e) => setHoursBefore(Number(e.target.value))}
            />
            <p className="text-muted-foreground text-xs">
              {t("gabinet.reminders.hoursBeforeDescription")}
            </p>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
