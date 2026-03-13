import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { KpiRow } from "../kpi-row";
import { SmartAgenda } from "../smart-agenda";
import { RecentItems } from "../recent-items";
import { useTranslation } from "react-i18next";

export function GabinetDocumentsWidgets({ organizationId }: { organizationId: Id<"organizations"> }) {
  const { t } = useTranslation();
  const user = useQuery(api.app.getCurrentUser);
  const kpis = useQuery(api.gabinet.sidebarWidgets.getDocumentsKpis, { organizationId });
  if (!kpis) return null;

  return (
    <>
      <KpiRow
        size="hero"
        items={[
          { label: t("sidebar.gabinet.totalTemplates"), value: kpis.totalTemplates, color: "text-primary" },
          { label: t("sidebar.gabinet.newDocumentsThisMonth"), value: kpis.newDocumentsThisMonth, color: "text-emerald-500" },
        ]}
      />
      <KpiRow
        items={[
          {
            label: t("sidebar.gabinet.pendingSignature"),
            value: kpis.pendingSignature,
            color: kpis.pendingSignature > 0 ? "text-amber-500" : undefined,
          },
        ]}
      />

      {/* Smart Agenda */}
      {user?._id && <SmartAgenda organizationId={organizationId} userId={user._id} />}

      {/* Recent documents */}
      <RecentItems organizationId={organizationId} entityType="gabinetDocuments" linkPrefix="/dashboard/gabinet/documents/" />
    </>
  );
}
