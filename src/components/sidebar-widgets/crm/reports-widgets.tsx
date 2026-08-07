import type { Id } from "@cvx/_generated/dataModel";
import { KpiRow } from "../kpi-row";
import { useTranslation } from "react-i18next";
import { useSupabaseInsightsKpis } from "@/hooks/use-supabase-sidebar-widgets";

export function ReportsWidgets({ organizationId }: { organizationId: Id<"organizations"> }) {
  const { t } = useTranslation();
  const { data: kpis } = useSupabaseInsightsKpis(organizationId as string);

  if (!kpis) return null;

  return (
    <KpiRow
      size="hero"
      items={[
        { label: t("sidebar.winRate"), value: `${kpis.winRate}%`, color: "text-primary" },
        { label: t("sidebar.openDeals"), value: kpis.openDeals },
      ]}
    />
  );
}
