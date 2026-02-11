import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { LeadForm } from "@/components/forms/lead-form";
import { ActivityTimeline } from "@/components/activity-timeline/activity-timeline";
import { RelationshipPanel } from "@/components/entity-relationships/relationship-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Id } from "@cvx/_generated/dataModel";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/leads/$leadId"
)({
  component: LeadDetail,
});

const statusColors: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  won: "bg-green-100 text-green-700",
  lost: "bg-red-100 text-red-700",
  archived: "bg-gray-100 text-gray-700",
};

function LeadDetail() {
  const { leadId } = Route.useParams();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const updateLead = useMutation(api.leads.update);
  const removeLead = useMutation(api.leads.remove);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: lead, isLoading } = useQuery(
    convexQuery(api.leads.getById, {
      organizationId,
      leadId: leadId as Id<"leads">,
    })
  );

  const { data: pipelines } = useQuery(
    convexQuery(api.pipelines.list, { organizationId })
  );

  const pipelineId = lead?.stage?.pipelineId;
  const { data: stages } = useQuery({
    ...convexQuery(api.pipelines.getStages, {
      organizationId,
      pipelineId: pipelineId ?? ("" as Id<"pipelines">),
    }),
    enabled: !!pipelineId,
  });

  const { data: activitiesData } = useQuery(
    convexQuery(api.activities.getForEntity, {
      organizationId,
      entityType: "lead",
      entityId: leadId,
      paginationOpts: { numItems: 20, cursor: null },
    })
  );
  const activities = activitiesData?.page;

  const { data: relationships } = useQuery(
    convexQuery(api.relationships.getForEntity, {
      organizationId,
      entityType: "lead",
      entityId: leadId,
    })
  );

  const { data: customFieldDefs } = useQuery(
    convexQuery(api.customFields.getDefinitions, {
      organizationId,
      entityType: "lead",
    })
  );

  const { data: rawCustomFieldValues } = useQuery(
    convexQuery(api.customFields.getValues, {
      organizationId,
      entityType: "lead",
      entityId: leadId,
    })
  );

  // Transform value[] into Record<fieldKey, value> for the form
  const customFieldValues = (rawCustomFieldValues ?? []).reduce<Record<string, unknown>>(
    (acc, v) => {
      const def = customFieldDefs?.find((d) => d._id === v.fieldDefinitionId);
      if (def) acc[def.fieldKey] = v.value;
      return acc;
    },
    {}
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!lead) {
    return <div>Lead not found.</div>;
  }

  const handleDelete = async () => {
    if (window.confirm("Delete this lead?")) {
      await removeLead({
        organizationId,
        leadId: leadId as Id<"leads">,
      });
      navigate({ to: "/dashboard/leads" });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={lead.title}
        description={
          lead.value
            ? new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
                minimumFractionDigits: 0,
              }).format(lead.value)
            : undefined
        }
        actions={
          <div className="flex items-center gap-2">
            <Badge className={statusColors[lead.status]}>
              {lead.status}
            </Badge>
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="pt-6">
              <LeadForm
                initialData={lead}
                pipelines={pipelines}
                stages={stages}
                customFieldDefinitions={customFieldDefs}
                customFieldValues={customFieldValues}
                isSubmitting={isSubmitting}
                onCancel={() => navigate({ to: "/dashboard/leads" })}
                onSubmit={async (data, customFieldRecord) => {
                  setIsSubmitting(true);
                  try {
                    const customFields = customFieldDefs
                      ? Object.entries(customFieldRecord)
                          .filter(([, v]) => v !== undefined && v !== "")
                          .map(([key, value]) => {
                            const def = customFieldDefs.find((d) => d.fieldKey === key);
                            return def
                              ? { fieldDefinitionId: def._id as Id<"customFieldDefinitions">, value }
                              : null;
                          })
                          .filter((f): f is NonNullable<typeof f> => f !== null)
                      : undefined;
                    await updateLead({
                      organizationId,
                      leadId: leadId as Id<"leads">,
                      ...data,
                      customFields,
                    });
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Relationships</CardTitle>
            </CardHeader>
            <CardContent>
              <RelationshipPanel
                relationships={
                  relationships?.map((r) => ({
                    _id: r._id,
                    targetType: r.targetType,
                    targetId: r.targetId,
                    targetName: r.targetId,
                    relationshipType: r.relationshipType,
                  })) ?? []
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline
                activities={
                  activities?.map((a: typeof activities[number]) => ({
                    _id: a._id,
                    action: a.action,
                    description: a.description,
                    createdAt: a.createdAt,
                  })) ?? []
                }
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
