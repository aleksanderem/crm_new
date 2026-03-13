import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { KpiRow } from "../kpi-row";
import { NudgeCard } from "../nudge-card";
import { SourceBar } from "../source-bar";
import { RecentItems } from "../recent-items";
import { useTranslation } from "react-i18next";

export function ContactsWidgets({ organizationId }: { organizationId: Id<"organizations"> }) {
  const { t } = useTranslation();
  const kpis = useQuery(api.sidebarWidgets.getContactsKpis, { organizationId });
  const nudges = useQuery(api.nudges.getContactsNudges, { organizationId });
  const sources = useQuery(api.sidebarWidgets.getContactsBySource, { organizationId });

  if (!kpis) return null;

  return (
    <>
      <KpiRow
        items={[
          { label: t("sidebar.total"), value: kpis.total },
          { label: t("sidebar.newThisWeek"), value: kpis.newThisWeek },
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
      {sources && sources.length > 0 && <SourceBar segments={sources} />}
      <RecentItems organizationId={organizationId} entityType="contacts" linkPrefix="/dashboard/contacts/" />
    </>
  );
}
