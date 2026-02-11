import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { ContactForm } from "@/components/forms/contact-form";
import { ActivityTimeline } from "@/components/activity-timeline/activity-timeline";
import { RelationshipPanel } from "@/components/entity-relationships/relationship-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Id } from "@cvx/_generated/dataModel";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/contacts/$contactId"
)({
  component: ContactDetail,
});

function ContactDetail() {
  const { contactId } = Route.useParams();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const updateContact = useMutation(api.contacts.update);
  const removeContact = useMutation(api.contacts.remove);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: contact, isLoading } = useQuery(
    convexQuery(api.contacts.getById, {
      organizationId,
      contactId: contactId as Id<"contacts">,
    })
  );

  const { data: activities } = useQuery(
    convexQuery(api.activities.getForEntity, {
      entityType: "contact",
      entityId: contactId,
    })
  );

  const { data: relationships } = useQuery(
    convexQuery(api.relationships.getForEntity, {
      organizationId,
      entityType: "contact",
      entityId: contactId,
    })
  );

  const { data: customFieldDefs } = useQuery(
    convexQuery(api.customFields.getDefinitions, {
      organizationId,
      entityType: "contact",
    })
  );

  const { data: customFieldValues } = useQuery(
    convexQuery(api.customFields.getValues, {
      organizationId,
      entityType: "contact",
      entityId: contactId,
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

  if (!contact) {
    return <div>Contact not found.</div>;
  }

  const handleDelete = async () => {
    if (window.confirm("Delete this contact?")) {
      await removeContact({
        organizationId,
        contactId: contactId as Id<"contacts">,
      });
      navigate({ to: "/dashboard/contacts" });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${contact.firstName} ${contact.lastName ?? ""}`}
        description={contact.email ?? contact.title}
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
              <ContactForm
                initialData={contact}
                customFieldDefinitions={customFieldDefs}
                customFieldValues={customFieldValues ?? {}}
                isSubmitting={isSubmitting}
                onCancel={() => navigate({ to: "/dashboard/contacts" })}
                onSubmit={async (data, customFields) => {
                  setIsSubmitting(true);
                  try {
                    await updateContact({
                      organizationId,
                      contactId: contactId as Id<"contacts">,
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
                    targetName: r.targetName ?? r.targetId,
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
                  activities?.map((a) => ({
                    _id: a._id,
                    action: a.action,
                    description: a.description,
                    performedByName: a.performedByName,
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
