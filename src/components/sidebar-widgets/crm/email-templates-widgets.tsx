import type { Id } from "@cvx/_generated/dataModel";
import { KpiRow } from "../kpi-row";
import { BarRanking } from "../bar-ranking";
import { RecentItems } from "../recent-items";
import { useTranslation } from "react-i18next";
import { useSupabaseEmailTemplatesList } from "@/hooks/use-supabase-email-templates";
import { useSupabaseEmailEventLog } from "@/hooks/use-supabase-email-events";
import { useMemo } from "react";

export function EmailTemplatesWidgets({ organizationId }: { organizationId: Id<"organizations"> }) {
  const { t } = useTranslation();
  const { data: templates } = useSupabaseEmailTemplatesList(organizationId);
  const { data: eventLog } = useSupabaseEmailEventLog(organizationId, {
    status: "sent",
    limit: 500,
  });

  // Derive KPIs from Supabase data
  const kpis = useMemo(() => {
    if (!templates) return null;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const thisMonthEntries = (eventLog ?? []).filter((e) => e.createdAt >= startOfMonth);

    // Count usages per template this month
    const usageByTemplate = new Map<string, number>();
    for (const entry of thisMonthEntries) {
      if (entry.templateId) {
        usageByTemplate.set(
          entry.templateId,
          (usageByTemplate.get(entry.templateId) ?? 0) + 1,
        );
      }
    }

    let topTemplateName = "";
    let maxUsage = 0;
    for (const [tid, count] of usageByTemplate) {
      if (count > maxUsage) {
        maxUsage = count;
        const tmpl = templates.find((t) => t._id === tid);
        topTemplateName = tmpl?.name ?? "";
      }
    }

    return {
      totalTemplates: templates.length,
      usagesThisMonth: thisMonthEntries.length,
      topTemplateName,
    };
  }, [templates, eventLog]);

  // Derive top templates ranking
  const topTemplates = useMemo(() => {
    if (!templates || !eventLog) return null;
    const usageByTemplate = new Map<string, number>();
    for (const entry of eventLog) {
      if (entry.templateId) {
        usageByTemplate.set(
          entry.templateId,
          (usageByTemplate.get(entry.templateId) ?? 0) + 1,
        );
      }
    }
    return templates
      .map((t) => ({
        label: t.name,
        value: usageByTemplate.get(t._id) ?? 0,
      }))
      .filter((t) => t.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [templates, eventLog]);

  if (!kpis) return null;

  return (
    <>
      <KpiRow
        items={[
          { label: t("sidebar.templates"), value: kpis.totalTemplates },
          { label: t("sidebar.usagesThisMonth"), value: kpis.usagesThisMonth },
          { label: t("sidebar.topTemplate"), value: kpis.topTemplateName || "—" },
        ]}
      />
      {topTemplates && topTemplates.length > 0 && <BarRanking items={topTemplates} />}
      <RecentItems organizationId={organizationId} entityType="documents" linkPrefix="/dashboard/email-templates/" />
    </>
  );
}
