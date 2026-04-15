import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { KpiRow } from "../kpi-row";
import { useTranslation } from "react-i18next";

export function InboxWidgets({ organizationId }: { organizationId: Id<"organizations"> }) {
  const { t } = useTranslation();
  const user = useQuery(api.app.getCurrentUser);
  const kpis = useQuery(
    api.sidebarWidgets.getInboxKpis,
    user?._id ? { organizationId, userId: user._id } : "skip"
  );

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
