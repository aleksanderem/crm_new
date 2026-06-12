import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { ExternalLink } from "@/lib/ez-icons";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";

type ProviderType = "google" | "microsoft" | "mailgun" | "resend";

interface MailProvider {
  _id: string;
  name: string;
  providerType: ProviderType;
  fromName?: string;
  fromEmail?: string;
  replyToEmail?: string;
  apiConfig?: {
    apiKey?: string;
    domain?: string;
    region?: string;
  };
  isShared?: boolean;
  capabilities?: {
    canSend: boolean;
    canReceive: boolean;
    canSync: boolean;
  };
}

interface MailProviderFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider?: MailProvider;
  organizationId: Id<"organizations">;
  userId?: string;
  convexSiteUrl: string;
}

export function MailProviderForm({
  open,
  onOpenChange,
  provider,
  organizationId,
  userId,
  convexSiteUrl,
}: MailProviderFormProps) {
  const { t } = useTranslation();
  const isEdit = !!provider;

  const createProvider = useAction(api.mailProviders.create);
  const updateProvider = useAction(api.mailProviders.update);

  const [providerType, setProviderType] = useState<ProviderType>(
    provider?.providerType ?? "resend"
  );
  const [name, setName] = useState(provider?.name ?? "");
  const [fromName, setFromName] = useState(provider?.fromName ?? "");
  const [fromEmail, setFromEmail] = useState(provider?.fromEmail ?? "");
  const [replyToEmail, setReplyToEmail] = useState(provider?.replyToEmail ?? "");
  const [apiKey, setApiKey] = useState(provider?.apiConfig?.apiKey ?? "");
  const [domain, setDomain] = useState(provider?.apiConfig?.domain ?? "");
  const [region, setRegion] = useState(provider?.apiConfig?.region ?? "us");
  const [canSend, setCanSend] = useState(provider?.capabilities?.canSend ?? true);
  const [canReceive, setCanReceive] = useState(provider?.capabilities?.canReceive ?? false);
  const [canSync, setCanSync] = useState(provider?.capabilities?.canSync ?? false);
  const [isShared, setIsShared] = useState(provider?.isShared ?? false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open && provider) {
      setProviderType(provider.providerType);
      setName(provider.name);
      setFromName(provider.fromName ?? "");
      setFromEmail(provider.fromEmail ?? "");
      setReplyToEmail(provider.replyToEmail ?? "");
      setApiKey(provider.apiConfig?.apiKey ?? "");
      setDomain(provider.apiConfig?.domain ?? "");
      setRegion(provider.apiConfig?.region ?? "us");
      setCanSend(provider.capabilities?.canSend ?? true);
      setCanReceive(provider.capabilities?.canReceive ?? false);
      setCanSync(provider.capabilities?.canSync ?? false);
      setIsShared(provider.isShared ?? false);
    } else if (open && !provider) {
      setProviderType("resend");
      setName("");
      setFromName("");
      setFromEmail("");
      setReplyToEmail("");
      setApiKey("");
      setDomain("");
      setRegion("us");
      setCanSend(true);
      setCanReceive(false);
      setCanSync(false);
      setIsShared(false);
    }
  }, [open, provider]);

  const handleConnectOAuth = (type: "google" | "microsoft") => {
    const endpoint = type === "google" ? "google/oauth/initiate" : "microsoft/oauth/initiate";
    const url = `${convexSiteUrl}/${endpoint}?organizationId=${organizationId}&userId=${userId ?? ""}`;
    window.location.href = url;
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      const hasApiConfig = !isOAuth && (apiKey.trim() || domain.trim());
      const payload = {
        organizationId,
        name: name.trim(),
        providerType,
        fromName: fromName.trim(),
        fromEmail: fromEmail.trim(),
        replyToEmail: replyToEmail.trim() || undefined,
        apiConfig: hasApiConfig ? {
          apiKey: apiKey.trim() || undefined,
          domain: domain.trim() || undefined,
          region: region || undefined,
        } : undefined,
        isShared,
        capabilities: { canSend, canReceive, canSync },
      };
      if (isEdit && provider) {
        const { providerType: _pt, ...updateFields } = payload;
        await updateProvider({ ...updateFields, providerId: provider._id as Id<"mailProviders"> });
      } else {
        await createProvider(payload);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: isEdit
            ? "mailProviders.errors.updateFailed"
            : "mailProviders.errors.createFailed",
          defaultValue: isEdit
            ? "Nie udało się zapisać dostawcy poczty."
            : "Nie udało się dodać dostawcy poczty.",
        }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const isOAuth = providerType === "google" || providerType === "microsoft";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("common.edit") : t("settings.mail.addProvider")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!isEdit && (
            <div className="space-y-1.5">
              <Label>{t("common.type")}</Label>
              <Select value={providerType} onValueChange={(v) => setProviderType(v as ProviderType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="google">{t("settings.mail.providerType.google")}</SelectItem>
                  <SelectItem value="microsoft">{t("settings.mail.providerType.microsoft")}</SelectItem>
                  <SelectItem value="mailgun">{t("settings.mail.providerType.mailgun")}</SelectItem>
                  <SelectItem value="resend">{t("settings.mail.providerType.resend")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t("settings.mail.form.name")}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("settings.mail.form.name")}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("settings.mail.form.fromName")}</Label>
            <Input
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="Acme Corp"
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("settings.mail.form.fromEmail")}</Label>
            <Input
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder="noreply@company.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("settings.mail.form.replyTo")}</Label>
            <Input
              type="email"
              value={replyToEmail}
              onChange={(e) => setReplyToEmail(e.target.value)}
              placeholder="support@company.com"
            />
          </div>

          {isOAuth ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => handleConnectOAuth(providerType as "google" | "microsoft")}
            >
              <ExternalLink className="mr-2 h-4 w-4" variant="stroke" />
              {providerType === "google"
                ? t("settings.mail.connectGoogle")
                : t("settings.mail.connectMicrosoft")}
            </Button>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>{t("settings.mail.form.apiKey")}</Label>
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                />
              </div>

              {providerType === "mailgun" && (
                <>
                  <div className="space-y-1.5">
                    <Label>{t("settings.mail.form.domain")}</Label>
                    <Input
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                      placeholder="mg.company.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("settings.mail.form.region")}</Label>
                    <Select value={region} onValueChange={setRegion}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="us">US</SelectItem>
                        <SelectItem value="eu">EU</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </>
          )}

          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <Label className="cursor-pointer">{t("settings.mail.capabilities.send")}</Label>
              <Switch checked={canSend} onCheckedChange={setCanSend} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="cursor-pointer">{t("settings.mail.capabilities.receive")}</Label>
              <Switch checked={canReceive} onCheckedChange={setCanReceive} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="cursor-pointer">{t("settings.mail.capabilities.sync")}</Label>
              <Switch checked={canSync} onCheckedChange={setCanSync} />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label className="cursor-pointer">{t("settings.mail.sharedProvider")}</Label>
            <Switch checked={isShared} onCheckedChange={setIsShared} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          {!isOAuth && (
            <Button onClick={handleSubmit} disabled={!name.trim() || isSubmitting}>
              {isSubmitting ? t("common.saving") : t("common.save")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
