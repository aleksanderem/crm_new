import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { KpiRow } from "../kpi-row";
import { BarRanking } from "../bar-ranking";
import { RecentItems } from "../recent-items";
import { useTranslation } from "react-i18next";

export function EmailTemplatesWidgets({ organizationId }: { organizationId: Id<"organizations"> }) {
  const { t } = useTranslation();
  const kpis = useQuery(api.sidebarWidgets.getEmailTemplatesKpis, { organizationId });
  const topTemplates = useQuery(api.sidebarWidgets.getTopTemplates, { organizationId });

  if (!kpis) return null;

  return (
    <>
      <KpiRow
        items={[
          { label: t("sidebar.templates"), value: kpis.totalTemplates },
          { label: t("sidebar.usagesThisMonth"), value: kpis.usagesThisMonth },
          { label: t("sidebar.topTemplate"), value: kpis.topTemplateName || "—" },
        ]}
      />
      {topTemplates && topTemplates.length > 0 && <BarRanking items={topTemplates} />}
      <RecentItems organizationId={organizationId} entityType="documents" linkPrefix="/dashboard/email-templates/" />
    </>
  );
}
