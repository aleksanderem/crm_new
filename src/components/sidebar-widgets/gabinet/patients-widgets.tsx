import { useAction } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate, useMatchRoute } from "@tanstack/react-router";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { KpiRow } from "../kpi-row";
import { RecentItems } from "../recent-items";
import { BarRanking } from "../bar-ranking";
import { Button } from "@/components/ui/button";
import { X } from "@/lib/ez-icons";
import { useTranslation } from "react-i18next";

type NudgeFilter = "missing-contact" | "no-recent-visit" | "duplicates";

function NudgeFilterCallout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();
  const location = useLocation();

  const isOnPatientsIndex = !!matchRoute({
    to: "/dashboard/gabinet/patients",
  });
  if (!isOnPatientsIndex) return null;

  const search = location.search as { nudge?: NudgeFilter } | undefined;
  const nudge = search?.nudge;
  if (!nudge) return null;

  const message =
    nudge === "missing-contact"
      ? t("gabinet.patients.nudgeFilter.missingContact", {
          defaultValue: "Pokazywani są klienci bez telefonu i e-maila.",
        })
      : nudge === "no-recent-visit"
        ? t("gabinet.patients.nudgeFilter.noRecentVisit", {
            defaultValue: "Pokazywani są klienci bez wizyty w ostatnich 90 dniach.",
          })
        : t("gabinet.patients.nudgeFilter.duplicates", {
            defaultValue:
              "Pokazywani są klienci z duplikatem e-maila lub telefonu. Użyj akcji „Scal z…”, aby je połączyć.",
          });

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
      <p className="mb-2 leading-snug">{message}</p>
      <Button
        variant="outline"
        size="sm"
        className="h-7 w-full gap-1 text-xs"
        onClick={() =>
          navigate({
            to: "/dashboard/gabinet/patients",
            search: { nudge: undefined },
          })
        }
      >
        <X className="h-3.5 w-3.5" variant="stroke" />
        {t("common.clearFilters")}
      </Button>
    </div>
  );
}

export function GabinetPatientsWidgets({ organizationId }: { organizationId: Id<"organizations"> }) {
  const { t } = useTranslation();
  const getPatientsKpis = useAction(api.gabinet.sidebarWidgets.getPatientsKpis);
  const getTopTreatments = useAction(api.gabinet.sidebarWidgets.getTopTreatments);
  const { data: kpis } = useQuery({
    queryKey: ["gabinet.sidebarWidgets.getPatientsKpis", organizationId],
    queryFn: () => getPatientsKpis({ organizationId }),
    enabled: !!organizationId,
  });
  const { data: topTreatments } = useQuery({
    queryKey: ["gabinet.sidebarWidgets.getTopTreatments", organizationId],
    queryFn: () => getTopTreatments({ organizationId }),
    enabled: !!organizationId,
  });

  return (
    <>
      <NudgeFilterCallout />

      {kpis && (
        <KpiRow
          size="hero"
          items={[
            { label: t("sidebar.gabinet.total"), value: kpis.total, color: "text-primary" },
            { label: t("sidebar.gabinet.newThisMonth"), value: kpis.newThisMonth, color: "text-emerald-500" },
          ]}
        />
      )}

      {/* Top treatments */}
      {topTreatments && topTreatments.length > 0 && <BarRanking items={topTreatments} />}

      {/* Recent patients */}
      <RecentItems organizationId={organizationId} entityType="gabinetPatients" linkPrefix="/dashboard/gabinet/patients/" />
    </>
  );
}
