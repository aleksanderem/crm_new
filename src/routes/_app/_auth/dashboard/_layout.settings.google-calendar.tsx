import { createFileRoute } from "@tanstack/react-router";
import { GoogleCalendarSyncSettings } from "@/components/settings/google-calendar-sync-settings";
import { useOrganization } from "@/components/org-context";
import { useTranslation } from "react-i18next";
import { SectionHeader } from "@untitled/app/section-headers/section-headers";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/google-calendar"
)({
  component: GoogleCalendarSettingsPage,
});

function GoogleCalendarSettingsPage() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <SectionHeader.Root className="pt-4">
        <SectionHeader.Group>
          <SectionHeader.Heading className="flex-1">
            {t("googleCalendar.settings.title")}
          </SectionHeader.Heading>
        </SectionHeader.Group>
      </SectionHeader.Root>

      <GoogleCalendarSyncSettings organizationId={organizationId} />
    </div>
  );
}
