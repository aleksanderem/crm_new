import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useSupabaseCustomFieldDefinitions } from "@/hooks/use-supabase-custom-fields";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { SectionHeader } from "@untitled/app/section-headers/section-headers";
import { UntitledAlert } from "@/components/ui/untitled-alert";
import { CustomFieldDefinitionForm } from "@/components/custom-fields/custom-field-definition-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Trash2 } from "@/lib/ez-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { EntityType } from "@cvx/schema";
import { Id } from "@cvx/_generated/dataModel";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/custom-fields"
)({
  component: CustomFieldsSettings,
});

const ENTITY_TYPE_CONFIG: Array<{ value: EntityType; labelKey: string; group: "crm" | "gabinet" | "other" }> = [
  { value: "contact", labelKey: "customFields.entityTypes.contact", group: "crm" },
  { value: "company", labelKey: "customFields.entityTypes.company", group: "crm" },
  { value: "lead", labelKey: "customFields.entityTypes.lead", group: "crm" },
  { value: "document", labelKey: "customFields.entityTypes.document", group: "crm" },
  { value: "activity", labelKey: "customFields.entityTypes.activity", group: "crm" },
  { value: "product", labelKey: "customFields.entityTypes.product", group: "crm" },
  { value: "call", labelKey: "customFields.entityTypes.call", group: "crm" },
  { value: "pipeline", labelKey: "customFields.entityTypes.pipeline", group: "crm" },
  { value: "gabinetPatient", labelKey: "customFields.entityTypes.gabinetPatient", group: "gabinet" },
  { value: "gabinetTreatment", labelKey: "customFields.entityTypes.gabinetTreatment", group: "gabinet" },
  { value: "gabinetAppointment", labelKey: "customFields.entityTypes.gabinetAppointment", group: "gabinet" },
  { value: "gabinetPackage", labelKey: "customFields.entityTypes.gabinetPackage", group: "gabinet" },
  { value: "gabinetDocument", labelKey: "customFields.entityTypes.gabinetDocument", group: "gabinet" },
  { value: "gabinetEmployee", labelKey: "customFields.entityTypes.gabinetEmployee", group: "gabinet" },
];

function CustomFieldsSettings() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const [activeTab, setActiveTab] = useState<EntityType>("contact");
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: Id<"customFieldDefinitions">; name: string } | null>(null);

  const queryClient = useQueryClient();
  const createDefinition = useAction(api.customFields.createDefinition);
  const deleteDefinition = useAction(api.customFields.deleteDefinition);

  const { data: definitions } = useSupabaseCustomFieldDefinitions(
    organizationId,
    activeTab,
  );

  const crmTypes = ENTITY_TYPE_CONFIG.filter((c) => c.group === "crm");
  const gabinetTypes = ENTITY_TYPE_CONFIG.filter((c) => c.group === "gabinet");
  return (
    <div className="flex h-full w-full flex-col gap-6">
      <SectionHeader.Root className="pt-4">
        <SectionHeader.Group>
          <SectionHeader.Heading className="flex-1">
            {t("customFields.title")}
          </SectionHeader.Heading>
          <SectionHeader.Actions>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="mr-2 h-4 w-4" variant="stroke" />
              {t("customFields.addField")}
            </Button>
          </SectionHeader.Actions>
        </SectionHeader.Group>
        <UntitledAlert>{t("customFields.description")}</UntitledAlert>
      </SectionHeader.Root>

      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as EntityType);
          setShowForm(false);
        }}
      >
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">CRM</p>
          <TabsList className="flex-wrap h-auto">
            {crmTypes.map((cfg) => (
              <TabsTrigger key={cfg.value} value={cfg.value}>
                {t(cfg.labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-2">Gabinet</p>
          <TabsList className="flex-wrap h-auto">
            {gabinetTypes.map((cfg) => (
              <TabsTrigger key={cfg.value} value={cfg.value}>
                {t(cfg.labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {ENTITY_TYPE_CONFIG.map(({ value: entityType, labelKey }) => (
          <TabsContent key={entityType} value={entityType}>
            {showForm && activeTab === entityType && (
              <Card className="mb-4">
                <CardHeader>
                  <CardTitle className="text-base">
                    {t("customFields.newFieldFor", { entity: t(labelKey) })}
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
                      void queryClient.invalidateQueries({ queryKey: supabaseKeys.customFieldDefinitions.list(organizationId) });
                      setShowForm(false);
                    }}
                  />
                </CardContent>
              </Card>
            )}

            <div className="space-y-2">
              {definitions?.length === 0 && !showForm && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t("customFields.noFields", { entity: t(labelKey) })}
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
                        <Badge variant="secondary">{t("common.required")}</Badge>
                      )}
                      {def.group && (
                        <Badge variant="outline">{def.group}</Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setDeleteTarget({ id: def._id as Id<"customFieldDefinitions">, name: def.name })}
                    >
                      <Trash2 className="h-4 w-4" variant="stroke" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("common.confirmDeleteDescription", { name: deleteTarget?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteTarget) return;
                await deleteDefinition({
                  organizationId,
                  definitionId: deleteTarget.id,
                });
                void queryClient.invalidateQueries({ queryKey: supabaseKeys.customFieldDefinitions.list(organizationId) });
                setDeleteTarget(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
