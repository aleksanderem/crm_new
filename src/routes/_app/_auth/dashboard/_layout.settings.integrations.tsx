import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useTranslation } from "react-i18next";
import { GoogleIntegrationCard } from "@/components/settings/google-integration-card";
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
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t("settings.integrations")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("integrations.description")}
        </p>
      </div>

      {user && (
        <GoogleIntegrationCard
          organizationId={organizationId}
          userId={user._id}
          convexSiteUrl={convexSiteUrl}
        />
      )}
    </div>
  );
}
