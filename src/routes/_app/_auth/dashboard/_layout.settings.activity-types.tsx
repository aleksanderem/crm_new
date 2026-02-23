import { useState, useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { ActivityTypeForm } from "@/components/settings/activity-type-form";
import { CustomFieldDefinitionForm } from "@/components/custom-fields/custom-field-definition-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2 } from "@/lib/ez-icons";
import { getActivityIcon } from "@/lib/activity-icon-registry";
import { Id } from "@cvx/_generated/dataModel";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/activity-types"
)({
  component: ActivityTypesSettings,
});

function ActivityTypesSettings() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeFieldTab, setActiveFieldTab] = useState<string>("");
  const [showFieldForm, setShowFieldForm] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);

  const seedDefaults = useMutation(api.activityTypes.seedDefaults);
  const createType = useMutation(api.activityTypes.create);
  const updateType = useMutation(api.activityTypes.update);
  const removeType = useMutation(api.activityTypes.remove);
  const createFieldDefinition = useMutation(api.customFields.createDefinition);
  const updateFieldDefinition = useMutation(api.customFields.updateDefinition);
  const deleteFieldDefinition = useMutation(api.customFields.deleteDefinition);

  const seededRef = useRef(false);
  useEffect(() => {
    if (!seededRef.current) {
      seededRef.current = true;
      seedDefaults({ organizationId });
    }
  }, [organizationId, seedDefaults]);

  const { data: activityTypes } = useQuery(
    convexQuery(api.activityTypes.list, { organizationId })
  );

  const sortedTypes = activityTypes
    ? [...activityTypes].sort((a, b) => a.order - b.order)
    : [];

  // Set initial field tab when types load
  useEffect(() => {
    if (sortedTypes.length > 0 && !activeFieldTab) {
      setActiveFieldTab(sortedTypes[0].key);
    }
  }, [sortedTypes.length, activeFieldTab]);

  const { data: fieldDefinitions } = useQuery(
    convexQuery(api.customFields.getDefinitions, {
      organizationId,
      entityType: "activity" as any,
      activityTypeKey: activeFieldTab || undefined,
    })
  );

  const handleCreate = async (data: {
    name: string;
    key: string;
    icon: string;
    color: string;
  }) => {
    setIsSubmitting(true);
    try {
      await createType({
        organizationId,
        key: data.key,
        name: data.name,
        icon: data.icon,
        color: data.color,
      });
      setShowCreateForm(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (
    typeId: string,
    data: { name: string; key: string; icon: string; color: string }
  ) => {
    setIsSubmitting(true);
    try {
      await updateType({
        organizationId,
        activityTypeId: typeId as Id<"activityTypeDefinitions">,
        name: data.name,
        icon: data.icon,
        color: data.color,
      });
      setEditingId(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (typeId: string) => {
    if (window.confirm(t('activityTypeSettings.confirmDeleteType'))) {
      await removeType({
        organizationId,
        activityTypeId: typeId as Id<"activityTypeDefinitions">,
      });
    }
  };

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <PageHeader
        title={t('activityTypeSettings.title')}
        description={t('activityTypeSettings.description')}
        actions={
          <Button onClick={() => setShowCreateForm(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t('activityTypeSettings.addType')}
          </Button>
        }
      />

      {/* Create form */}
      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('activityTypeSettings.newType')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityTypeForm
              onSubmit={handleCreate}
              onCancel={() => setShowCreateForm(false)}
              isSubmitting={isSubmitting}
            />
          </CardContent>
        </Card>
      )}

      {/* Activity types list */}
      <div className="space-y-2">
        {sortedTypes.length === 0 && !showCreateForm && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t('activityTypeSettings.emptyTypes')}
          </p>
        )}
        {sortedTypes.map((type) => {
          const Icon = getActivityIcon(type.icon);

          if (editingId === type._id) {
            return (
              <Card key={type._id}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {t('activityTypeSettings.editType')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ActivityTypeForm
                    initialData={{
                      name: type.name,
                      key: type.key,
                      icon: type.icon,
                      color: type.color ?? "",
                    }}
                    onSubmit={(data) => handleUpdate(type._id, data)}
                    onCancel={() => setEditingId(null)}
                    isSubmitting={isSubmitting}
                  />
                </CardContent>
              </Card>
            );
          }

          return (
            <Card key={type._id}>
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  {Icon && (
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-md"
                      style={
                        type.color?.startsWith("#")
                          ? { backgroundColor: type.color, color: "#fff" }
                          : undefined
                      }
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium">{type.name}</p>
                  </div>
                  <Badge variant="outline">{type.key}</Badge>
                  {type.isSystem && (
                    <Badge variant="secondary">{t('activityTypeSettings.system')}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setEditingId(type._id)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {!type.isSystem && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleDelete(type._id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Custom fields per activity type */}
      {sortedTypes.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">
            {t('activityTypeSettings.customFieldsByType')}
          </h2>

          <Tabs
            value={activeFieldTab}
            onValueChange={(v) => {
              setActiveFieldTab(v);
              setShowFieldForm(false);
            }}
          >
            <TabsList>
              {sortedTypes.map((type) => (
                <TabsTrigger key={type.key} value={type.key}>
                  {type.name}
                </TabsTrigger>
              ))}
            </TabsList>

            {sortedTypes.map((type) => (
              <TabsContent key={type.key} value={type.key}>
                <div className="mb-3 flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFieldForm(true)}
                  >
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    {t('activityTypeSettings.addField')}
                  </Button>
                </div>

                {showFieldForm && activeFieldTab === type.key && (
                  <Card className="mb-4">
                    <CardHeader>
                      <CardTitle className="text-base">
                        {t('activityTypeSettings.newFieldFor', { name: type.name })}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CustomFieldDefinitionForm
                        entityType={"activity" as any}
                        onCancel={() => setShowFieldForm(false)}
                        onSubmit={async (data) => {
                          await createFieldDefinition({
                            organizationId,
                            entityType: "activity" as any,
                            activityTypeKey: type.key,
                            ...data,
                            order: (fieldDefinitions?.length ?? 0) + 1,
                          });
                          setShowFieldForm(false);
                        }}
                      />
                    </CardContent>
                  </Card>
                )}

                <div className="space-y-2">
                  {fieldDefinitions?.length === 0 && !showFieldForm && (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      {t('activityTypeSettings.noFieldsFor', { name: type.name })}
                    </p>
                  )}
                  {fieldDefinitions?.map((def) => {
                    if (editingFieldId === def._id) {
                      return (
                        <Card key={def._id}>
                          <CardHeader>
                            <CardTitle className="text-base">
                              {t('activityTypeSettings.editField')}
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <CustomFieldDefinitionForm
                              entityType={"activity" as any}
                              initialData={{
                                name: def.name,
                                fieldKey: def.fieldKey,
                                fieldType: def.fieldType,
                                options: def.options,
                                isRequired: def.isRequired,
                                group: def.group,
                              }}
                              onCancel={() => setEditingFieldId(null)}
                              onSubmit={async (data) => {
                                await updateFieldDefinition({
                                  organizationId,
                                  definitionId: def._id as Id<"customFieldDefinitions">,
                                  name: data.name,
                                  options: data.options,
                                  isRequired: data.isRequired,
                                  group: data.group,
                                });
                                setEditingFieldId(null);
                              }}
                            />
                          </CardContent>
                        </Card>
                      );
                    }
                    return (
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
                              <Badge variant="secondary">{t('activityTypeSettings.required')}</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setEditingFieldId(def._id)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={async () => {
                                if (
                                  window.confirm(
                                    t('activityTypeSettings.confirmDeleteField', { name: def.name })
                                  )
                                ) {
                                  await deleteFieldDefinition({
                                    organizationId,
                                    definitionId:
                                      def._id as Id<"customFieldDefinitions">,
                                  });
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      )}
    </div>
  );
}
