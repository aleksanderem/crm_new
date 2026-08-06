import type { Id } from "@cvx/_generated/dataModel";
import { KpiRow } from "../kpi-row";
import { useTranslation } from "react-i18next";
import { useSupabaseInboxKpis } from "@/hooks/use-supabase-sidebar-widgets";

export function InboxWidgets({ organizationId }: { organizationId: Id<"organizations"> }) {
  const { t } = useTranslation();
  const { data: kpis } = useSupabaseInboxKpis(organizationId as string);

  if (!kpis) return null;

  return (
    <>
      <KpiRow
        size="hero"
        items={[
          {
            label: t("sidebar.unread"),
            value: kpis.unread,
            color: kpis.unread > 0 ? "text-red-500" : undefined,
          },
          { label: t("sidebar.todayReceived"), value: kpis.todayReceived },
        ]}
      />
    </>
  );
}
