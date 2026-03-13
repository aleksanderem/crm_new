import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { KpiRow } from "../kpi-row";
import { useTranslation } from "react-i18next";

export function ProductsWidgets({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation();
  const kpis = useQuery(api.sidebarWidgets.getProductsKpis, { organizationId: organizationId as any });

  if (!kpis) return null;

  return (
    <KpiRow
      items={[
        { label: t("sidebar.total"), value: kpis.total },
        { label: t("sidebar.inDeals"), value: kpis.inDeals },
        { label: t("sidebar.topSeller"), value: kpis.topSeller || "—" },
      ]}
    />
  );
}
