import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { KpiRow } from "../kpi-row";
import { NudgeCard } from "../nudge-card";
import { BarRanking } from "../bar-ranking";
import { useTranslation } from "react-i18next";

export function ProductsWidgets({ organizationId }: { organizationId: Id<"organizations"> }) {
  const { t } = useTranslation();
  const kpis = useQuery(api.sidebarWidgets.getProductsKpis, { organizationId });
  const nudges = useQuery(api.nudges.getProductsNudges, { organizationId });
  const topProducts = useQuery(api.sidebarWidgets.getTopProducts, { organizationId });

  if (!kpis) return null;

  return (
    <>
      <KpiRow
        items={[
          { label: t("sidebar.total"), value: kpis.total },
          { label: t("sidebar.inDeals"), value: kpis.inDeals },
          { label: t("sidebar.topSeller"), value: kpis.topSeller || "—" },
        ]}
      />
      {nudges?.map((n, index) => (
        <NudgeCard
          key={`${n.message}-${index}`}
          message={n.message}
          messageValues={n.messageValues}
          severity={n.severity}
          icon={n.icon}
        />
      ))}
      {topProducts && topProducts.length > 0 && <BarRanking items={topProducts} />}
    </>
  );
}
