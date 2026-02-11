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
            onSubmit={async (data, customFields) => {
              setIsSubmitting(true);
              try {
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
