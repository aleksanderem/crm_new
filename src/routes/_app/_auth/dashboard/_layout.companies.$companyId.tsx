import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { CompanyForm } from "@/components/forms/company-form";
import { ActivityTimeline } from "@/components/activity-timeline/activity-timeline";
import { RelationshipPanel } from "@/components/entity-relationships/relationship-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Id } from "@cvx/_generated/dataModel";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/companies/$companyId"
)({
  component: CompanyDetail,
});

function CompanyDetail() {
  const { companyId } = Route.useParams();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const updateCompany = useMutation(api.companies.update);
  const removeCompany = useMutation(api.companies.remove);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: company, isLoading } = useQuery(
    convexQuery(api.companies.getById, {
      organizationId,
      companyId: companyId as Id<"companies">,
    })
  );

  const { data: activitiesData } = useQuery(
    convexQuery(api.activities.getForEntity, {
      organizationId,
      entityType: "company",
      entityId: companyId,
      paginationOpts: { numItems: 20, cursor: null },
    })
  );
  const activities = activitiesData?.page;

  const { data: relationships } = useQuery(
    convexQuery(api.relationships.getForEntity, {
      organizationId,
      entityType: "company",
      entityId: companyId,
    })
  );

  const { data: customFieldDefs } = useQuery(
    convexQuery(api.customFields.getDefinitions, {
      organizationId,
      entityType: "company",
    })
  );

  const { data: customFieldValues } = useQuery(
    convexQuery(api.customFields.getValues, {
      organizationId,
      entityType: "company",
      entityId: companyId,
    })
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!company) {
    return <div>Company not found.</div>;
  }

  const handleDelete = async () => {
    if (window.confirm("Delete this company?")) {
      await removeCompany({
        organizationId,
        companyId: companyId as Id<"companies">,
      });
      navigate({ to: "/dashboard/companies" });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={company.name}
        description={[company.industry, company.domain]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="pt-6">
              <CompanyForm
                initialData={company}
                customFieldDefinitions={customFieldDefs}
                customFieldValues={(customFieldValues ?? []).reduce<Record<string, unknown>>(
                  (acc, v) => {
                    const def = customFieldDefs?.find((d) => d._id === v.fieldDefinitionId);
                    if (def) acc[def.fieldKey] = v.value;
                    return acc;
                  },
                  {}
                )}
                isSubmitting={isSubmitting}
                onCancel={() => navigate({ to: "/dashboard/companies" })}
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
                    await updateCompany({
                      organizationId,
                      companyId: companyId as Id<"companies">,
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
