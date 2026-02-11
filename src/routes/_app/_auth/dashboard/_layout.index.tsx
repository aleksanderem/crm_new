import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { Id } from "@cvx/_generated/dataModel";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { PipelineChart } from "@/components/dashboard/pipeline-chart";
import { UpcomingActivities } from "@/components/dashboard/upcoming-activities";
import { TopPerformers } from "@/components/dashboard/top-performers";
import { MiniChartsRow } from "@/components/crm/mini-charts";
import { ActivityTimeline } from "@/components/activity-timeline/activity-timeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { TimeRange } from "@/components/crm/types";

export const Route = createFileRoute("/_app/_auth/dashboard/_layout/")({
  component: DashboardIndex,
});

function DashboardIndex() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();

  // Time range states for chart widgets
  const [wonDealsRange, setWonDealsRange] = useState<TimeRange>("last30days");
  const [revenueRange, setRevenueRange] = useState<TimeRange>("last30days");
  const [contactsDayRange, setContactsDayRange] = useState<TimeRange>("last30days");
  const [contactsSourceRange, setContactsSourceRange] = useState<TimeRange>("last30days");
  const [companiesDayRange, setCompaniesDayRange] = useState<TimeRange>("last30days");
  const [companiesIndustryRange, setCompaniesIndustryRange] = useState<TimeRange>("last30days");
  const [callsDayRange, setCallsDayRange] = useState<TimeRange>("last30days");
  const [callOutcomesRange, setCallOutcomesRange] = useState<TimeRange>("last30days");
  const [performersRange, setPerformersRange] = useState<TimeRange>("last30days");

  // --- Existing queries ---
  const { data: stats, isLoading: statsLoading } = useQuery(
    convexQuery(api.dashboard.getStats, { organizationId })
  );
  const { data: pipelines } = useQuery(
    convexQuery(api.pipelines.list, { organizationId })
  );
  const defaultPipeline = pipelines?.find((p) => p.isDefault) ?? pipelines?.[0];
  const { data: stageData } = useQuery({
    ...convexQuery(api.dashboard.getLeadsByStage, {
      organizationId,
      pipelineId: defaultPipeline?._id ?? ("" as Id<"pipelines">),
    }),
    enabled: !!defaultPipeline,
  });
  const { data: recentActivity } = useQuery(
    convexQuery(api.activities.getRecentForOrg, { organizationId })
  );

  // --- New chart queries ---
  const { data: wonDealsData } = useQuery(
    convexQuery(api.dashboard.getWonDealsByDay, {
      organizationId,
      timeRange: wonDealsRange,
    })
  );
  const { data: revenueData } = useQuery(
    convexQuery(api.dashboard.getRevenueByMonth, {
      organizationId,
      timeRange: revenueRange,
    })
  );
  const { data: contactsDayData } = useQuery(
    convexQuery(api.dashboard.getContactsByDay, {
      organizationId,
      timeRange: contactsDayRange,
    })
  );
  const { data: contactsSourceData } = useQuery(
    convexQuery(api.dashboard.getContactsBySource, {
      organizationId,
      timeRange: contactsSourceRange,
    })
  );
  const { data: companiesDayData } = useQuery(
    convexQuery(api.dashboard.getCompaniesByDay, {
      organizationId,
      timeRange: companiesDayRange,
    })
  );
  const { data: companiesIndustryData } = useQuery(
    convexQuery(api.dashboard.getCompaniesByIndustry, {
      organizationId,
      timeRange: companiesIndustryRange,
    })
  );
  const { data: callsDayData } = useQuery(
    convexQuery(api.dashboard.getCallsByDay, {
      organizationId,
      timeRange: callsDayRange,
    })
  );
  const { data: callOutcomesData } = useQuery(
    convexQuery(api.dashboard.getCallOutcomeOverview, {
      organizationId,
      timeRange: callOutcomesRange,
    })
  );
  const { data: performersData } = useQuery(
    convexQuery(api.dashboard.getTopPerformers, {
      organizationId,
      timeRange: performersRange,
    })
  );
  const { data: upcomingData } = useQuery(
    convexQuery(api.dashboard.getUpcomingActivities, { organizationId })
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("dashboard.title")}
        description={t("dashboard.subtitle")}
      />

      {/* KPI Cards */}
      {statsLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <KpiCards
          totalContacts={stats?.totalContacts ?? 0}
          totalCompanies={stats?.totalCompanies ?? 0}
          openDeals={stats?.openLeads ?? 0}
          pipelineValue={stats?.pipelineValue ?? 0}
          winRate={stats?.winRate ?? 0}
        />
      )}

      {/* Pipeline Chart + Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PipelineChart
            data={
              stageData?.map((s) => ({
                name: s.stageName,
                count: s.count,
                value: s.totalValue,
              })) ?? []
            }
          />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("dashboard.recentActivity")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityTimeline
              activities={
                recentActivity?.map((a) => ({
                  _id: a._id,
                  action: a.action,
                  description: a.description,
                  performedByName: a.user?.name ?? undefined,
                  createdAt: a.createdAt,
                })) ?? []
              }
              maxHeight="350px"
            />
          </CardContent>
        </Card>
      </div>

      {/* Won Deals + Revenue */}
      <MiniChartsRow
        leftChart={{
          title: t("dashboard.wonDealsByDay"),
          data: wonDealsData ?? [],
          chartType: "bar",
          timeRange: wonDealsRange,
          onTimeRangeChange: setWonDealsRange,
          accentColor: "#22c55e",
        }}
        rightChart={{
          title: t("dashboard.revenueByMonth"),
          data: revenueData ?? [],
          chartType: "bar",
          timeRange: revenueRange,
          onTimeRangeChange: setRevenueRange,
          accentColor: "#8b5cf6",
        }}
      />

      {/* Contacts by Day + Source */}
      <MiniChartsRow
        leftChart={{
          title: t("dashboard.contactsByDay"),
          data: contactsDayData ?? [],
          chartType: "line",
          timeRange: contactsDayRange,
          onTimeRangeChange: setContactsDayRange,
        }}
        rightChart={{
          title: t("dashboard.contactsBySource"),
          data: contactsSourceData ?? [],
          chartType: "bar",
          timeRange: contactsSourceRange,
          onTimeRangeChange: setContactsSourceRange,
          accentColor: "#06b6d4",
        }}
      />

      {/* Companies by Day + Industry */}
      <MiniChartsRow
        leftChart={{
          title: t("dashboard.companiesByDay"),
          data: companiesDayData ?? [],
          chartType: "line",
          timeRange: companiesDayRange,
          onTimeRangeChange: setCompaniesDayRange,
          accentColor: "#f59e0b",
        }}
        rightChart={{
          title: t("dashboard.companiesByIndustry"),
          data: companiesIndustryData ?? [],
          chartType: "bar",
          timeRange: companiesIndustryRange,
          onTimeRangeChange: setCompaniesIndustryRange,
          accentColor: "#f59e0b",
        }}
      />

      {/* Calls by Day + Outcomes */}
      <MiniChartsRow
        leftChart={{
          title: t("dashboard.callsByDay"),
          data: callsDayData ?? [],
          chartType: "line",
          timeRange: callsDayRange,
          onTimeRangeChange: setCallsDayRange,
          accentColor: "#f97316",
        }}
        rightChart={{
          title: t("dashboard.callOutcomes"),
          data: callOutcomesData ?? [],
          chartType: "bar",
          timeRange: callOutcomesRange,
          onTimeRangeChange: setCallOutcomesRange,
          accentColor: "#f43f5e",
        }}
      />

      {/* Upcoming Activities + Top Performers */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <UpcomingActivities activities={upcomingData ?? []} />
        </div>
        <TopPerformers
          performers={performersData ?? []}
          timeRange={performersRange}
          onTimeRangeChange={setPerformersRange}
        />
      </div>
    </div>
  );
}
