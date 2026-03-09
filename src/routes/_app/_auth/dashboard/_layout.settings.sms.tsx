import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/sms"
)({
  component: SmsSettings,
});

type Provider = "smsapi" | "twilio";

function SmsSettings() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();

  const { data: config } = useQuery(
    convexQuery(api.sms.getConfig, { organizationId })
  );

  const saveConfig = useMutation(api.sms.saveConfig);
  const toggleActive = useMutation(api.sms.toggleActive);

  // Form state
  const [provider, setProvider] = useState<Provider>("smsapi");
  const [apiToken, setApiToken] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [senderId, setSenderId] = useState("");
  const [fromNumber, setFromNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);

  // Seed provider from existing config (don't pre-fill secrets)
  useEffect(() => {
    if (config) {
      setProvider((config.provider as Provider) ?? "smsapi");
      setSenderId(config.senderId ?? "");
      setFromNumber(config.fromNumber ?? "");
    }
  }, [config]);

  const handleSave = async () => {
    if (!apiToken.trim()) {
      toast.error(t("sms.apiTokenRequired"));
      return;
    }
    setSaving(true);
    try {
      await saveConfig({
        organizationId,
        provider,
        apiToken: apiToken.trim(),
        apiSecret: apiSecret.trim() || undefined,
        senderId: senderId.trim() || undefined,
        fromNumber: fromNumber.trim() || undefined,
      });
      setApiToken("");
      setApiSecret("");
      toast.success(t("sms.saved"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (isActive: boolean) => {
    setToggling(true);
    try {
      await toggleActive({ organizationId, isActive });
      toast.success(
        isActive ? t("sms.activatedSuccess") : t("sms.deactivatedSuccess")
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setToggling(false);
    }
  };

  const isConfigured = !!config;

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <PageHeader
        title={t("sms.title")}
        description={t("sms.description")}
      />

      {/* Current status */}
      {isConfigured && (
        <Card>
          <CardContent className="py-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">{t("sms.isActive")}</p>
                <p className="text-xs text-muted-foreground">
                  {config.provider === "smsapi"
                    ? t("sms.providerSmsapi")
                    : t("sms.providerTwilio")}
                  {" · "}
                  {config.hasToken
                    ? t("sms.tokenSet")
                    : t("sms.notConfigured")}
                  {config.hasSecret && ` · ${t("sms.secretSet")}`}
                </p>
              </div>
              <Switch
                checked={config.isActive}
                onCheckedChange={handleToggleActive}
                disabled={toggling}
                aria-label={t("sms.isActive")}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Config form */}
      <Card>
        <CardContent className="py-4 space-y-4">
          {/* Provider select */}
          <div className="space-y-1.5">
            <Label htmlFor="sms-provider">{t("sms.provider")}</Label>
            <Select
              value={provider}
              onValueChange={(v) => setProvider(v as Provider)}
            >
              <SelectTrigger id="sms-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="smsapi">
                  {t("sms.providerSmsapi")}
                </SelectItem>
                <SelectItem value="twilio">
                  {t("sms.providerTwilio")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* API Token */}
          <div className="space-y-1.5">
            <Label htmlFor="sms-token">
              {t("sms.apiToken")}
              {config?.hasToken && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({t("sms.tokenSet")})
                </span>
              )}
            </Label>
            <Input
              id="sms-token"
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder={
                config?.hasToken ? "••••••••" : t("sms.apiTokenPlaceholder")
              }
              autoComplete="off"
            />
          </div>

          {/* API Secret — Twilio only */}
          {provider === "twilio" && (
            <div className="space-y-1.5">
              <Label htmlFor="sms-secret">
                {t("sms.apiSecret")}
                {config?.hasSecret && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    ({t("sms.secretSet")})
                  </span>
                )}
              </Label>
              <Input
                id="sms-secret"
                type="password"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                placeholder={
                  config?.hasSecret ? "••••••••" : t("sms.apiSecretPlaceholder")
                }
                autoComplete="off"
              />
            </div>
          )}

          {/* Sender ID — SMSAPI only */}
          {provider === "smsapi" && (
            <div className="space-y-1.5">
              <Label htmlFor="sms-sender">{t("sms.senderId")}</Label>
              <Input
                id="sms-sender"
                value={senderId}
                onChange={(e) => setSenderId(e.target.value)}
                placeholder="MyClinic"
              />
            </div>
          )}

          {/* From number — Twilio only */}
          {provider === "twilio" && (
            <div className="space-y-1.5">
              <Label htmlFor="sms-from">{t("sms.fromNumber")}</Label>
              <Input
                id="sms-from"
                value={fromNumber}
                onChange={(e) => setFromNumber(e.target.value)}
                placeholder="+48500000000"
              />
            </div>
          )}

          <Button onClick={handleSave} disabled={saving || !apiToken.trim()}>
            {saving ? t("common.saving") : t("sms.save")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
