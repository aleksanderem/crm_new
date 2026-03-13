import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { KpiRow } from "../kpi-row";
import { NudgeCard } from "../nudge-card";
import { SmartAgenda } from "../smart-agenda";
import { useTranslation } from "react-i18next";

export function ActivitiesWidgets({ organizationId }: { organizationId: Id<"organizations"> }) {
  const { t } = useTranslation();
  const user = useQuery(api.app.getCurrentUser);
  const kpis = useQuery(
    api.sidebarWidgets.getActivitiesKpis,
    user?._id ? { organizationId, userId: user._id } : "skip"
  );
  const nudges = useQuery(
    api.nudges.getActivitiesNudges,
    user?._id ? { organizationId, userId: user._id } : "skip"
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
      {nudges?.map((n, index) => (
        <NudgeCard
          key={`${n.message}-${index}`}
          message={n.message}
          messageValues={n.messageValues}
          severity={n.severity}
          icon={n.icon}
        />
      ))}
      {user?._id && <SmartAgenda organizationId={organizationId} userId={user._id} />}
    </>
  );
}
