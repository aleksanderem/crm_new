import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import { useOrganization } from "@/components/org-context";
import { useSupabaseMailProvidersList } from "@/hooks/use-supabase-mail-providers";
import { SectionHeader } from "@untitled/app/section-headers/section-headers";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Mail, Calendar } from "@/lib/ez-icons";
import { EmailBrandEditor } from "@/components/settings/email-brand-editor";
import { MailProviderCard } from "@/components/settings/mail-provider-card";
import { MailProviderForm } from "@/components/settings/mail-provider-form";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/mail"
)({
  component: MailSettings,
});

type ProviderType = "google" | "microsoft" | "mailgun" | "resend";
type ProviderStatus = "active" | "inactive" | "error" | "pending_auth";

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
  status: ProviderStatus;
  isDefault?: boolean;
  isShared?: boolean;
  capabilities?: {
    canSend: boolean;
    canReceive: boolean;
    canSync: boolean;
  };
}

function MailSettings() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();

  const [formOpen, setFormOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<MailProvider | undefined>(undefined);

  const convexUrl = import.meta.env.VITE_CONVEX_URL as string;
  const convexSiteUrl = convexUrl.replace(".cloud", ".site");

  const { data: user } = useQuery(convexQuery(api.app.getCurrentUser, {}));

  const { data: providers } = useSupabaseMailProvidersList(organizationId);

  const removeProvider = useMutation(api.mailProviders.remove);
  const setDefault = useMutation(api.mailProviders.setDefault);

  const handleEdit = (provider: MailProvider) => {
    setEditingProvider(provider);
    setFormOpen(true);
  };

  const handleAddNew = () => {
    setEditingProvider(undefined);
    setFormOpen(true);
  };

  const handleFormClose = (open: boolean) => {
    setFormOpen(open);
    if (!open) setEditingProvider(undefined);
  };

  const handleRemove = async (providerId: string) => {
    await removeProvider({
      organizationId,
      providerId: providerId as Id<"mailProviders">,
    });
  };

  const handleSetDefault = async (providerId: string) => {
    await setDefault({
      organizationId,
      providerId: providerId as Id<"mailProviders">,
    });
  };

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <SectionHeader.Root className="pt-4">
        <SectionHeader.Group>
          <SectionHeader.Heading className="flex-1">
            {t("settings.mail.title")}
          </SectionHeader.Heading>
        </SectionHeader.Group>
      </SectionHeader.Root>

      <Tabs defaultValue="providers">
        <TabsList>
          <TabsTrigger value="providers">{t("settings.mail.providers")}</TabsTrigger>
          <TabsTrigger value="brand">{t("settings.mail.brand")}</TabsTrigger>
          <TabsTrigger value="events">{t("settings.mail.events")}</TabsTrigger>
        </TabsList>

        <TabsContent value="providers" className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <div />
            <Button onClick={handleAddNew}>
              <Plus className="mr-2 h-4 w-4" variant="stroke" />
              {t("settings.mail.addProvider")}
            </Button>
          </div>

          {(!providers || providers.length === 0) ? (
            <div className="py-12 text-center">
              <p className="text-sm font-medium">{t("settings.mail.noProviders")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("settings.mail.noProvidersDescription")}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {providers.map((provider) => (
                <MailProviderCard
                  key={provider._id}
                  provider={provider as MailProvider}
                  onEdit={handleEdit}
                  onSetDefault={handleSetDefault}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="brand" className="mt-6">
          <EmailBrandEditor organizationId={organizationId} />
        </TabsContent>

        <TabsContent value="events" className="mt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="flex items-start gap-4 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Mail className="h-5 w-5 text-muted-foreground" variant="stroke" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{t("settingsNav.emailEvents")}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("settings.emailEvents")}
                  </p>
                  <Link
                    to="/dashboard/settings/email-events"
                    className="mt-3 inline-flex items-center text-xs text-primary hover:underline"
                  >
                    {t("common.edit")} →
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-start gap-4 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Calendar className="h-5 w-5 text-muted-foreground" variant="stroke" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{t("settingsNav.automations")}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("settings.automations", { defaultValue: "Reguły automatyzacji wysyłki" })}
                  </p>
                  <Link
                    to="/dashboard/settings/automations"
                    className="mt-3 inline-flex items-center text-xs text-primary hover:underline"
                  >
                    {t("common.edit")} →
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <MailProviderForm
        open={formOpen}
        onOpenChange={handleFormClose}
        provider={editingProvider}
        organizationId={organizationId}
        userId={user?._id}
        convexSiteUrl={convexSiteUrl}
      />
    </div>
  );
}
