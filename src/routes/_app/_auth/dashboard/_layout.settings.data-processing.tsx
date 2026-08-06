import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { SectionHeader } from "@untitled/app/section-headers/section-headers";
import { UntitledAlert } from "@/components/ui/untitled-alert";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "@/lib/ez-icons";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/data-processing"
)({
  component: DataProcessingSettings,
});

interface Subprocessor {
  name: string;
  purposeKey: string;
  country: string;
  privacyUrl: string;
  dpaUrl?: string;
}

const SUBPROCESSORS: Subprocessor[] = [
  {
    name: "Convex",
    purposeKey: "dataProcessing.subprocessors.convex",
    country: "USA",
    privacyUrl: "https://www.convex.dev/legal/privacy",
    dpaUrl: "https://www.convex.dev/legal/dpa",
  },
  {
    name: "Netlify",
    purposeKey: "dataProcessing.subprocessors.netlify",
    country: "USA",
    privacyUrl: "https://www.netlify.com/privacy/",
    dpaUrl: "https://www.netlify.com/legal/dpa/",
  },
  {
    name: "Resend",
    purposeKey: "dataProcessing.subprocessors.resend",
    country: "USA",
    privacyUrl: "https://resend.com/legal/privacy-policy",
    dpaUrl: "https://resend.com/legal/dpa",
  },
  {
    name: "Stripe",
    purposeKey: "dataProcessing.subprocessors.stripe",
    country: "USA",
    privacyUrl: "https://stripe.com/privacy",
    dpaUrl: "https://stripe.com/legal/dpa",
  },
  {
    name: "Google",
    purposeKey: "dataProcessing.subprocessors.google",
    country: "USA",
    privacyUrl: "https://policies.google.com/privacy",
    dpaUrl: "https://workspace.google.com/terms/dpa_terms.html",
  },
  {
    name: "Hetzner Online",
    purposeKey: "dataProcessing.subprocessors.hetzner",
    country: "DE",
    privacyUrl: "https://www.hetzner.com/legal/privacy-policy",
    dpaUrl: "https://www.hetzner.com/legal/privacy-policy",
  },
];

function DataProcessingSettings() {
  const { t } = useTranslation();

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <SectionHeader.Root className="pt-4">
        <SectionHeader.Group>
          <SectionHeader.Heading className="flex-1">
            {t("dataProcessing.title")}
          </SectionHeader.Heading>
        </SectionHeader.Group>
        <UntitledAlert>{t("dataProcessing.description")}</UntitledAlert>
      </SectionHeader.Root>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-1 p-6 pb-4">
          <h2 className="text-base font-medium text-foreground">
            {t("dataProcessing.subprocessorList")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("dataProcessing.subprocessorListDescription")}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-border bg-muted/40">
                <th className="px-6 py-3 text-left font-medium text-muted-foreground">
                  {t("dataProcessing.columns.name")}
                </th>
                <th className="px-6 py-3 text-left font-medium text-muted-foreground">
                  {t("dataProcessing.columns.purpose")}
                </th>
                <th className="px-6 py-3 text-left font-medium text-muted-foreground">
                  {t("dataProcessing.columns.country")}
                </th>
                <th className="px-6 py-3 text-left font-medium text-muted-foreground">
                  {t("dataProcessing.columns.links")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {SUBPROCESSORS.map((sp) => (
                <tr key={sp.name} className="hover:bg-muted/20">
                  <td className="px-6 py-4 font-medium text-foreground">
                    {sp.name}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {t(sp.purposeKey)}
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant="outline" className="font-mono text-xs">
                      {sp.country}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <a
                        href={sp.privacyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        {t("dataProcessing.privacyPolicy")}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      {sp.dpaUrl && (
                        <a
                          href={sp.dpaUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          DPA
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t border-border px-6 py-4">
          <p className="text-xs text-muted-foreground">
            {t("dataProcessing.lastUpdated", { date: "2026-08-06" })}
          </p>
        </div>
      </div>
    </div>
  );
}
