import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { KpiRow } from "../kpi-row";
import { useTranslation } from "react-i18next";

export function EmailTemplatesWidgets({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation();
  const kpis = useQuery(api.sidebarWidgets.getEmailTemplatesKpis, { organizationId: organizationId as any });

  if (!kpis) return null;

  return (
    <KpiRow
      items={[
        { label: t("sidebar.templates"), value: kpis.totalTemplates },
        { label: t("sidebar.usagesThisMonth"), value: kpis.usagesThisMonth },
        { label: t("sidebar.topTemplate"), value: kpis.topTemplateName || "—" },
      ]}
    />
  );
}
