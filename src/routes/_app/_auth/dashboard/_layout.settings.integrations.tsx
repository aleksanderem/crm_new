import { createFileRoute } from "@tanstack/react-router";
import { useOrganization } from "@/components/org-context";
import { useTranslation } from "react-i18next";
import { SectionHeader } from "@untitled/app/section-headers/section-headers";
import { UntitledAlert } from "@/components/ui/untitled-alert";
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

  // Show toast on success/error from OAuth callback redirect
  const searchParams = new URLSearchParams(window.location.search);
  const success = searchParams.get("success");
  const error = searchParams.get("error");

  useEffect(() => {
    if (success === "true") {
      toast.success(t("integrations.connected"));
      window.history.replaceState({}, "", window.location.pathname);
    } else if (error) {
      console.error("[integrations] OAuth callback error:", error);
      toast.error(t("integrations.oauthError"));
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
        <UntitledAlert>{t("integrations.description")}</UntitledAlert>
      </SectionHeader.Root>

      <SmsConfigCard organizationId={organizationId} />
    </div>
  );
}
