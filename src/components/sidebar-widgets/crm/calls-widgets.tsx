import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { KpiRow } from "../kpi-row";
import { NudgeCard } from "../nudge-card";
import { SmartAgenda } from "../smart-agenda";
import { useTranslation } from "react-i18next";

export function CallsWidgets({ organizationId }: { organizationId: Id<"organizations"> }) {
  const { t } = useTranslation();
  const user = useQuery(api.app.getCurrentUser);
  const kpis = useQuery(api.sidebarWidgets.getCallsKpis, { organizationId });
  const nudges = useQuery(api.nudges.getCallsNudges, { organizationId });

  if (!kpis) return null;

  return (
    <>
      <KpiRow
        items={[
          { label: t("sidebar.todayCalls"), value: kpis.todayCount },
          { label: t("sidebar.answerRate"), value: `${kpis.answerRate}%` },
          { label: t("sidebar.avgDuration"), value: `${kpis.avgDurationSec}s` },
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
