import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useSupabasePipelinesList, useSupabasePipelineStages } from "@/hooks/use-supabase-pipelines";
import { useSupabaseCustomFieldDefinitions } from "@/hooks/use-supabase-custom-fields";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { PageHeader } from "@/components/layout/page-header";
import { LeadForm } from "@/components/forms/lead-form";
import { Card, CardContent } from "@/components/ui/card";
import { useState } from "react";
import { Id } from "@cvx/_generated/dataModel";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/leads/new"
)({
  component: NewLead,
});

function NewLead() {
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const createLead = useAction(api.leads.create);
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: pipelines } = useSupabasePipelinesList(organizationId);

  const firstPipelineId = pipelines?.[0]?._id;

  const { data: stages } = useSupabasePipelineStages(
    organizationId,
    firstPipelineId,
    { enabled: !!firstPipelineId },
  );

  const { data: customFieldDefs } = useSupabaseCustomFieldDefinitions(
    organizationId,
    "lead",
  );

  return (
    <div>
      <PageHeader title="New Lead" />
      <Card>
        <CardContent className="pt-6">
          <LeadForm
            pipelines={pipelines as any}
            stages={stages as any}
            customFieldDefinitions={customFieldDefs as any}
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
                const id = await createLead({
                  organizationId,
                  ...data,
                  customFields,
                });
                queryClient.invalidateQueries({ queryKey: supabaseKeys.leads.all });
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
