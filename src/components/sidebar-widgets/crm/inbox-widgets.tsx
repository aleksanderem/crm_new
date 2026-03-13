import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { KpiRow } from "../kpi-row";
import { NudgeCard } from "../nudge-card";
import { useTranslation } from "react-i18next";

export function InboxWidgets({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation();
  const user = useQuery(api.app.getCurrentUser);
  const kpis = useQuery(
    api.sidebarWidgets.getInboxKpis,
    user?._id ? { organizationId: organizationId as any, userId: user._id as any } : "skip"
  );
  const nudges = useQuery(api.nudges.getInboxNudges, { organizationId: organizationId as any });

  if (!kpis) return null;

  return (
    <>
      <KpiRow
        items={[
          {
            label: t("sidebar.unread"),
            value: kpis.unread,
            color: kpis.unread > 0 ? "text-red-500" : undefined,
          },
          { label: t("sidebar.todayReceived"), value: kpis.todayReceived },
        ]}
      />
      {nudges?.map((n) => (
        <NudgeCard key={n.message} message={n.message} severity={n.severity} icon={n.icon} />
      ))}
    </>
  );
}
