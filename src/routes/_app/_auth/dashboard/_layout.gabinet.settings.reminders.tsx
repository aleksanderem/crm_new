import { createFileRoute } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useSupabaseOrgSettings } from "@/hooks/use-supabase-organizations";
import { SectionHeader } from "@untitled/app/section-headers/section-headers";
import { UntitledAlert } from "@/components/ui/untitled-alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PermissionGate, usePermission } from "@/hooks/use-permission";
import { Skeleton } from "@/components/ui/skeleton";

function ReminderSettingsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/settings/reminders"
)({
  component: () => (
    <PermissionGate feature="gabinet_settings" action="view" loadingFallback={<ReminderSettingsSkeleton />}>
      <ReminderSettings />
    </PermissionGate>
  ),
});

interface ChannelConfig {
  sms48h: boolean;
  sms24h: boolean;
  email48h: boolean;
  email24h: boolean;
}

function ChannelToggle({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        disabled={disabled}
        className="mt-0.5"
      />
      <div className="grid gap-1 leading-none">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
    </div>
  );
}

function ReminderSettings() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const { allowed: canEdit } = usePermission("gabinet_settings", "edit");
  const upsertSettings = useAction(api.orgSettings.upsert);
  const [saving, setSaving] = useState(false);

  const { data: orgSettings } = useSupabaseOrgSettings(organizationId);

  const [config, setConfig] = useState<ChannelConfig>({
    sms48h: false,
    sms24h: false,
    email48h: false,
    email24h: false,
  });

  useEffect(() => {
    if (orgSettings) {
      setConfig({
        sms48h: orgSettings.reminderSms48h ?? false,
        sms24h: orgSettings.reminderSms24h ?? false,
        email48h: orgSettings.reminderEmail48h ?? false,
        email24h: orgSettings.reminderEmail24h ?? false,
      });
    }
  }, [orgSettings]);

  const toggle = (key: keyof ChannelConfig) => (value: boolean) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await upsertSettings({
        organizationId,
        reminderSms48h: config.sms48h,
        reminderSms24h: config.sms24h,
        reminderEmail48h: config.email48h,
        reminderEmail24h: config.email24h,
      });
      toast.success(t("gabinet.reminders.saved"));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <SectionHeader.Root className="pt-4">
        <SectionHeader.Group>
          <SectionHeader.Heading className="flex-1">
            {t("gabinet.reminders.title")}
          </SectionHeader.Heading>
        </SectionHeader.Group>
        <UntitledAlert>{t("gabinet.reminders.description")}</UntitledAlert>
      </SectionHeader.Root>

      <div className="max-w-lg space-y-6">
        <div className="space-y-4">
          <p className="text-sm font-medium">{t("gabinet.reminders.sectionSms")}</p>
          <ChannelToggle
            id="sms48h"
            label={t("gabinet.reminders.sms48h")}
            description={t("gabinet.reminders.sms48hDesc")}
            checked={config.sms48h}
            onCheckedChange={toggle("sms48h")}
            disabled={!canEdit}
          />
          <ChannelToggle
            id="sms24h"
            label={t("gabinet.reminders.sms24h")}
            description={t("gabinet.reminders.sms24hDesc")}
            checked={config.sms24h}
            onCheckedChange={toggle("sms24h")}
            disabled={!canEdit}
          />
        </div>

        <Separator />

        <div className="space-y-4">
          <p className="text-sm font-medium">{t("gabinet.reminders.sectionEmail")}</p>
          <ChannelToggle
            id="email48h"
            label={t("gabinet.reminders.email48h")}
            description={t("gabinet.reminders.email48hDesc")}
            checked={config.email48h}
            onCheckedChange={toggle("email48h")}
            disabled={!canEdit}
          />
          <ChannelToggle
            id="email24h"
            label={t("gabinet.reminders.email24h")}
            description={t("gabinet.reminders.email24hDesc")}
            checked={config.email24h}
            onCheckedChange={toggle("email24h")}
            disabled={!canEdit}
          />
        </div>

        <p className="text-muted-foreground text-xs">
          {t("gabinet.reminders.noContactWarning")}
        </p>

        {canEdit && (
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
