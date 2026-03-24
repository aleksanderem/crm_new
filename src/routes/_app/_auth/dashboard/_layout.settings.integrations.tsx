import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useTranslation } from "react-i18next";
import { SectionHeader } from "@/components/application/section-headers/section-headers";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { GoogleIntegrationCard } from "@/components/settings/google-integration-card";
import { SmsConfigCard } from "@/components/settings/sms-config-card";
import { useEffect } from "react";
import { toast } from "sonner";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/integrations"
)({
  component: IntegrationsSettings,
});

function IntegrationsSettings() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();

  const { data: user } = useQuery(convexQuery(api.app.getCurrentUser, {}));

  // The Convex site URL is derived from the client URL
  // VITE_CONVEX_URL is like "https://xyz.convex.cloud" — site URL uses the same domain
  const convexUrl = import.meta.env.VITE_CONVEX_URL as string;
  const convexSiteUrl = convexUrl.replace(".cloud", ".site");

  // Show toast on success/error from OAuth callback redirect
  const searchParams = new URLSearchParams(window.location.search);
  const success = searchParams.get("success");
  const error = searchParams.get("error");

  useEffect(() => {
    if (success === "true") {
      toast.success(t("integrations.connected"));
      // Clean up URL params
      window.history.replaceState({}, "", window.location.pathname);
    } else if (error) {
      toast.error(`${t("integrations.notConnected")}: ${error}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [success, error, t]);

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <SectionHeader.Root className="pt-4">
        <SectionHeader.Group>
          <SectionHeader.Heading className="flex-1">
            {t("settings.integrations")}
          </SectionHeader.Heading>
        </SectionHeader.Group>
        <Alert>
                  <AlertDescription>{t("integrations.description")}</AlertDescription>
                </Alert>
      </SectionHeader.Root>

      {user && (
        <GoogleIntegrationCard
          organizationId={organizationId}
          userId={user._id}
          convexSiteUrl={convexSiteUrl}
        />
      )}

      <SmsConfigCard organizationId={organizationId} />
    </div>
  );
}
