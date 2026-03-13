import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { KpiRow } from "../kpi-row";
import { NudgeCard } from "../nudge-card";
import { SourceBar } from "../source-bar";
import { useTranslation } from "react-i18next";

export function ContactsWidgets({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation();
  const kpis = useQuery(api.sidebarWidgets.getContactsKpis, { organizationId: organizationId as any });
  const nudges = useQuery(api.nudges.getContactsNudges, { organizationId: organizationId as any });
  const sources = useQuery(api.sidebarWidgets.getContactsBySource, { organizationId: organizationId as any });

  if (!kpis) return null;

  return (
    <>
      <KpiRow
        items={[
          { label: t("sidebar.total"), value: kpis.total },
          { label: t("sidebar.newThisWeek"), value: kpis.newThisWeek },
          { label: t("sidebar.unlinked"), value: kpis.unlinked },
        ]}
      />
      {nudges?.map((n) => (
        <NudgeCard key={n.message} message={n.message} severity={n.severity} icon={n.icon} />
      ))}
      {sources && sources.length > 0 && <SourceBar segments={sources} />}
    </>
  );
}
