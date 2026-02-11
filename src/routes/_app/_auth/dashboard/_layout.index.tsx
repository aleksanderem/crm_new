import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { PipelineChart } from "@/components/dashboard/pipeline-chart";
import { ActivityTimeline } from "@/components/activity-timeline/activity-timeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_app/_auth/dashboard/_layout/")({
  component: DashboardIndex,
});

function DashboardIndex() {
  const { organizationId } = useOrganization();

  const { data: stats, isLoading: statsLoading } = useQuery(
    convexQuery(api.dashboard.getStats, { organizationId })
  );
  const { data: stageData } = useQuery(
    convexQuery(api.dashboard.getLeadsByStage, { organizationId })
  );
  const { data: recentActivity } = useQuery(
    convexQuery(api.activities.getRecentForOrg, { organizationId })
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Overview of your CRM pipeline and activity."
      />

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
          openDeals={stats?.openDeals ?? 0}
          pipelineValue={stats?.pipelineValue ?? 0}
          winRate={stats?.winRate ?? 0}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PipelineChart data={stageData ?? []} />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityTimeline
              activities={
                recentActivity?.map((a) => ({
                  _id: a._id,
                  action: a.action,
                  description: a.description,
                  performedByName: a.performedByName,
                  createdAt: a.createdAt,
                })) ?? []
              }
              maxHeight="350px"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
