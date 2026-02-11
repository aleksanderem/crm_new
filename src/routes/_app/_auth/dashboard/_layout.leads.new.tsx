import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { LeadForm } from "@/components/forms/lead-form";
import { Card, CardContent } from "@/components/ui/card";
import { useState } from "react";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/leads/new"
)({
  component: NewLead,
});

function NewLead() {
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const createLead = useMutation(api.leads.create);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: pipelines } = useQuery(
    convexQuery(api.pipelines.list, { organizationId })
  );

  const { data: stages } = useQuery(
    convexQuery(api.pipelines.getStages, { organizationId })
  );

  const { data: customFieldDefs } = useQuery(
    convexQuery(api.customFields.getDefinitions, {
      organizationId,
      entityType: "lead",
    })
  );

  return (
    <div>
      <PageHeader title="New Lead" />
      <Card>
        <CardContent className="pt-6">
          <LeadForm
            pipelines={pipelines}
            stages={stages}
            customFieldDefinitions={customFieldDefs}
            isSubmitting={isSubmitting}
            onCancel={() => navigate({ to: "/dashboard/leads" })}
            onSubmit={async (data, customFields) => {
              setIsSubmitting(true);
              try {
                const id = await createLead({
                  organizationId,
                  ...data,
                  customFields,
                });
                navigate({ to: `/dashboard/leads/${id}` });
              } finally {
                setIsSubmitting(false);
              }
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
