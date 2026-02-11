import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { CustomFieldDefinitionForm } from "@/components/custom-fields/custom-field-definition-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { EntityType, CustomFieldType } from "@cvx/schema";
import { Id } from "@cvx/_generated/dataModel";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/custom-fields"
)({
  component: CustomFieldsSettings,
});

const entityTypes: EntityType[] = ["contact", "company", "lead", "document"];

function CustomFieldsSettings() {
  const { organizationId } = useOrganization();
  const [activeTab, setActiveTab] = useState<EntityType>("contact");
  const [showForm, setShowForm] = useState(false);

  const createDefinition = useMutation(api.customFields.createDefinition);
  const deleteDefinition = useMutation(api.customFields.deleteDefinition);

  const { data: definitions } = useQuery(
    convexQuery(api.customFields.getDefinitions, {
      organizationId,
      entityType: activeTab,
    })
  );

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <PageHeader
        title="Custom Fields"
        description="Define custom fields for your CRM entities."
        actions={
          <Button onClick={() => setShowForm(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Field
          </Button>
        }
      />

      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as EntityType);
          setShowForm(false);
        }}
      >
        <TabsList>
          {entityTypes.map((t) => (
            <TabsTrigger key={t} value={t} className="capitalize">
              {t}s
            </TabsTrigger>
          ))}
        </TabsList>

        {entityTypes.map((entityType) => (
          <TabsContent key={entityType} value={entityType}>
            {showForm && activeTab === entityType && (
              <Card className="mb-4">
                <CardHeader>
                  <CardTitle className="text-base">
                    New {entityType} field
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CustomFieldDefinitionForm
                    entityType={entityType}
                    onCancel={() => setShowForm(false)}
                    onSubmit={async (data) => {
                      await createDefinition({
                        organizationId,
                        entityType,
                        ...data,
                        order: (definitions?.length ?? 0) + 1,
                      });
                      setShowForm(false);
                    }}
                  />
                </CardContent>
              </Card>
            )}

            <div className="space-y-2">
              {definitions?.length === 0 && !showForm && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No custom fields for {entityType}s yet.
                </p>
              )}
              {definitions?.map((def) => (
                <Card key={def._id}>
                  <CardContent className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-sm font-medium">{def.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {def.fieldKey}
                        </p>
                      </div>
                      <Badge variant="outline">{def.fieldType}</Badge>
                      {def.isRequired && (
                        <Badge variant="secondary">Required</Badge>
                      )}
                      {def.group && (
                        <Badge variant="outline">{def.group}</Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={async () => {
                        if (
                          window.confirm(
                            `Delete field "${def.name}"?`
                          )
                        ) {
                          await deleteDefinition({
                            organizationId,
                            definitionId: def._id as Id<"customFieldDefinitions">,
                          });
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
