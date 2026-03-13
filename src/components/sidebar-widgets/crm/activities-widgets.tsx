import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { KpiRow } from "../kpi-row";
import { NudgeCard } from "../nudge-card";
import { useTranslation } from "react-i18next";

export function ActivitiesWidgets({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation();
  const user = useQuery(api.app.getCurrentUser);
  const kpis = useQuery(
    api.sidebarWidgets.getActivitiesKpis,
    user?._id ? { organizationId: organizationId as any, userId: user._id as any } : "skip"
  );
  const nudges = useQuery(
    api.nudges.getActivitiesNudges,
    user?._id ? { organizationId: organizationId as any, userId: user._id as any } : "skip"
  );

  if (!kpis) return null;

  return (
    <>
      <KpiRow
        items={[
          {
            label: t("sidebar.overdue"),
            value: kpis.overdue,
            color: kpis.overdue > 0 ? "text-red-500" : undefined,
          },
          { label: t("sidebar.today"), value: kpis.today },
          { label: t("sidebar.completionRate"), value: `${kpis.completionRate}%` },
        ]}
      />
      {nudges?.map((n, i) => (
        <NudgeCard key={i} message={n.message} severity={n.severity} icon={n.icon} />
      ))}
    </>
  );
}
