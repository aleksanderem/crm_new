import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useSupabaseCustomFieldDefinitions } from "@/hooks/use-supabase-custom-fields";
import { PageHeader } from "@/components/layout/page-header";
import { ContactForm } from "@/components/forms/contact-form";
import { Card, CardContent } from "@/components/ui/card";
import { useState, type ComponentProps } from "react";
import { Id } from "@cvx/_generated/dataModel";
import { supabaseKeys } from "@/lib/supabase/query-keys";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/contacts/new"
)({
  component: NewContact,
});

function NewContact() {
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createContact = useAction(api.contacts.create);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: customFieldDefs } = useSupabaseCustomFieldDefinitions(
    organizationId,
    "contact",
  );

  return (
    <div>
      <PageHeader title="New Contact" />
      <Card>
        <CardContent className="pt-6">
          <ContactForm
            customFieldDefinitions={
              customFieldDefs as unknown as ComponentProps<typeof ContactForm>["customFieldDefinitions"]
            }
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
                // Invalidate Supabase contacts cache after create
                void queryClient.invalidateQueries({ queryKey: supabaseKeys.contacts.list(organizationId) });
                navigate({ to: `/dashboard/contacts/${id}` });
              } catch (e) {
                toast.error(e instanceof Error ? e.message : String(e));
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
