import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatActionError } from "@/lib/format-action-error";

export const Route = createFileRoute("/_app/_auth/admin/email-config")({
  component: AdminEmailConfig,
});

type ProviderChoice = "env" | "resend" | "mailgun";

function AdminEmailConfig() {
  const { t } = useTranslation();
  const getIsPlatformAdmin = useAction(api.app.getIsPlatformAdmin);
  const { data: adminStatus, isLoading: userLoading } = useQuery({
    queryKey: ["isPlatformAdmin"],
    queryFn: () => getIsPlatformAdmin({}),
  });
  const { data: settings, isLoading: settingsLoading } = useQuery(
    convexQuery(api.platformSettings.get, {}),
  );

  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [provider, setProvider] = useState<ProviderChoice>("env");
  const [resendApiKey, setResendApiKey] = useState("");
  const [mailgunApiKey, setMailgunApiKey] = useState("");
  const [mailgunDomain, setMailgunDomain] = useState("");
  const [mailgunRegion, setMailgunRegion] = useState<"us" | "eu">("us");

  useEffect(() => {
    if (settings) {
      setFromName(settings.invitationFromName ?? "");
      setFromEmail(settings.invitationFromEmail ?? "");
      setReplyTo(settings.invitationReplyToEmail ?? "");
      setProvider(settings.provider ?? "env");
      setMailgunDomain(settings.mailgunDomain ?? "");
      setMailgunRegion(settings.mailgunRegion ?? "us");
      // Never prefill the API key inputs — they're masked. User leaves blank
      // to keep existing, or types a new value to replace.
      setResendApiKey("");
      setMailgunApiKey("");
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: useAction(api.platformSettings.set),
    onSuccess: () => {
      toast.success("Platform email settings saved");
    },
    onError: (e: Error) => {
      toast.error(
        formatActionError(e, t, {
          key: "admin.email.errors.saveFailed",
          defaultValue: "Nie udało się zapisać ustawień e-mail.",
        }),
      );
    },
  });

  if (userLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!adminStatus?.isPlatformAdmin) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <Card>
          <CardHeader>
            <CardTitle>403 — Platform admin required</CardTitle>
            <CardDescription>
              This page is only accessible to platform administrators.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/dashboard" className="text-sm underline">
              Back to dashboard
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({
      invitationFromName: fromName.trim() || undefined,
      invitationFromEmail: fromEmail.trim() || undefined,
      invitationReplyToEmail: replyTo.trim() || undefined,
      provider: provider === "env" ? undefined : provider,
      resendApiKey: resendApiKey.trim() || undefined,
      mailgunApiKey: mailgunApiKey.trim() || undefined,
      mailgunDomain: mailgunDomain.trim() || undefined,
      mailgunRegion: provider === "mailgun" ? mailgunRegion : undefined,
    });
  };

  const disabled = settingsLoading || saveMutation.isPending;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Platform admin · Email
          </h1>
          <p className="text-sm text-muted-foreground">
            Global email configuration used by platform-level messages
            (invitations, password resets) — separate from per-gabinet mail
            providers.
          </p>
        </div>
        <Link to="/admin" className="text-sm underline">
          ← Back
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Provider</CardTitle>
          <CardDescription>
            Where the platform sends from. Leave on "Default" to use the
            <code className="mx-1">AUTH_RESEND_KEY</code> environment variable
            (no admin config needed). Pick Resend or Mailgun to override with
            your own API key.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="provider">Provider</Label>
              <Select
                value={provider}
                onValueChange={(v) => setProvider(v as ProviderChoice)}
                disabled={disabled}
              >
                <SelectTrigger id="provider">
                  <SelectValue placeholder="Choose provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="env">Default (env Resend)</SelectItem>
                  <SelectItem value="resend">Resend (custom API key)</SelectItem>
                  <SelectItem value="mailgun">Mailgun</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {provider === "resend" && (
              <div className="space-y-2 rounded-md border border-dashed p-4">
                <Label htmlFor="resendApiKey">Resend API key</Label>
                <Input
                  id="resendApiKey"
                  type="password"
                  autoComplete="off"
                  placeholder={
                    settings?.hasResendApiKey
                      ? "•••••••• (leave blank to keep existing)"
                      : "re_..."
                  }
                  value={resendApiKey}
                  onChange={(e) => setResendApiKey(e.target.value)}
                  disabled={disabled}
                />
                <p className="text-xs text-muted-foreground">
                  Used only for platform-level sends. Per-gabinet mail providers
                  are not affected.
                </p>
              </div>
            )}

            {provider === "mailgun" && (
              <div className="space-y-3 rounded-md border border-dashed p-4">
                <div className="space-y-2">
                  <Label htmlFor="mailgunApiKey">Mailgun API key</Label>
                  <Input
                    id="mailgunApiKey"
                    type="password"
                    autoComplete="off"
                    placeholder={
                      settings?.hasMailgunApiKey
                        ? "•••••••• (leave blank to keep existing)"
                        : "key-..."
                    }
                    value={mailgunApiKey}
                    onChange={(e) => setMailgunApiKey(e.target.value)}
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mailgunDomain">Domain</Label>
                  <Input
                    id="mailgunDomain"
                    placeholder="mg.helloalex.pl"
                    value={mailgunDomain}
                    onChange={(e) => setMailgunDomain(e.target.value)}
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mailgunRegion">Region</Label>
                  <Select
                    value={mailgunRegion}
                    onValueChange={(v) => setMailgunRegion(v as "us" | "eu")}
                    disabled={disabled}
                  >
                    <SelectTrigger id="mailgunRegion">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="us">US (api.mailgun.net)</SelectItem>
                      <SelectItem value="eu">EU (api.eu.mailgun.net)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="border-t pt-4 space-y-4">
              <h3 className="text-sm font-medium">Invitation email From</h3>
              <div className="space-y-2">
                <Label htmlFor="fromName">From name</Label>
                <Input
                  id="fromName"
                  placeholder="Quera"
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  disabled={disabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fromEmail">From email</Label>
                <Input
                  id="fromEmail"
                  type="email"
                  placeholder="noreply@quera.helloalex.pl"
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                  disabled={disabled}
                />
                <p className="text-xs text-muted-foreground">
                  Required when using Resend (custom key) or Mailgun. With
                  Default env Resend, falls back to <code>AUTH_EMAIL</code>.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="replyTo">Reply-to (optional)</Label>
                <Input
                  id="replyTo"
                  type="email"
                  placeholder="support@quera.helloalex.pl"
                  value={replyTo}
                  onChange={(e) => setReplyTo(e.target.value)}
                  disabled={disabled}
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={disabled}>
                {saveMutation.isPending ? "Saving…" : "Save"}
              </Button>
              {settings?.updatedAt && (
                <span className="text-xs text-muted-foreground">
                  Last updated {new Date(settings.updatedAt).toLocaleString()}
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
