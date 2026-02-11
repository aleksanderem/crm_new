import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { ContactForm } from "@/components/forms/contact-form";
import { Card, CardContent } from "@/components/ui/card";
import { useState } from "react";
import { Id } from "@cvx/_generated/dataModel";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/contacts/new"
)({
  component: NewContact,
});

function NewContact() {
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const createContact = useMutation(api.contacts.create);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: customFieldDefs } = useQuery(
    convexQuery(api.customFields.getDefinitions, {
      organizationId,
      entityType: "contact",
    })
  );

  return (
    <div>
      <PageHeader title="New Contact" />
      <Card>
        <CardContent className="pt-6">
          <ContactForm
            customFieldDefinitions={customFieldDefs}
            isSubmitting={isSubmitting}
            onCancel={() => navigate({ to: "/dashboard/contacts" })}
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
                const id = await createContact({
                  organizationId,
                  ...data,
                  customFields,
                });
                navigate({ to: `/dashboard/contacts/${id}` });
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
