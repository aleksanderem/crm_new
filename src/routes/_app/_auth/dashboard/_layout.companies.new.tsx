import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { CompanyForm } from "@/components/forms/company-form";
import { Card, CardContent } from "@/components/ui/card";
import { useState } from "react";
import { Id } from "@cvx/_generated/dataModel";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/companies/new"
)({
  component: NewCompany,
});

function NewCompany() {
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const createCompany = useMutation(api.companies.create);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: customFieldDefs } = useQuery(
    convexQuery(api.customFields.getDefinitions, {
      organizationId,
      entityType: "company",
    })
  );

  return (
    <div>
      <PageHeader title="New Company" />
      <Card>
        <CardContent className="pt-6">
          <CompanyForm
            customFieldDefinitions={customFieldDefs}
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
                const id = await createCompany({
                  organizationId,
                  ...data,
                  customFields,
                });
                navigate({ to: `/dashboard/companies/${id}` });
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
