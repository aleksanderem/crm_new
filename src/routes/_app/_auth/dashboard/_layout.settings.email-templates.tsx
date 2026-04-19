import { useState, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useSupabaseEmailTemplatesList } from "@/hooks/use-supabase-email-templates";
import { useOrganization } from "@/components/org-context";
import { SectionHeader } from "@untitled/app/section-headers/section-headers";
import { UntitledAlert } from "@/components/ui/untitled-alert";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2 } from "@/lib/ez-icons";
import { Id } from "@cvx/_generated/dataModel";
import { EmailTemplateEditor } from "@/components/email/template-editor";
import type { EmailTemplateEditorHandle } from "@/components/email/template-editor";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/email-templates",
)({
  component: EmailTemplatesSettings,
});

interface TemplateVariable {
  key: string;
  label: string;
  source: string;
}

interface TemplateFormData {
  name: string;
  subject: string;
  body: string;
  contentJson: string;
  category: string;
  module: string;
  variables: TemplateVariable[];
}

const emptyForm: TemplateFormData = {
  name: "",
  subject: "",
  body: "",
  contentJson: "",
  category: "",
  module: "",
  variables: [],
};

const MODULE_OPTIONS = [
  { value: "", label: "Wszystkie moduły" },
  { value: "crm", label: "CRM" },
  { value: "gabinet", label: "Gabinet" },
];

function EmailTemplatesSettings() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateFormData>(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const editorRef = useRef<EmailTemplateEditorHandle>(null);

  const createTemplate = useAction(api.emailTemplates.create);
  const updateTemplate = useAction(api.emailTemplates.update);
  const removeTemplate = useAction(api.emailTemplates.remove);

  const { data: templates } = useSupabaseEmailTemplatesList(organizationId);

  const { data: variableSources } = useQuery(
    convexQuery(api.emailTemplates.listVariableSources, {
      module: form.module || undefined,
    }),
  );

  const openCreateDialog = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEditDialog = (template: {
    _id: string;
    name: string;
    subject: string;
    body: string;
    category?: string;
    module?: string;
    variables: TemplateVariable[];
  }) => {
    setEditingId(template._id);
    setForm({
      name: template.name,
      subject: template.subject,
      body: template.body,
      contentJson: "",
      category: template.category ?? "",
      module: template.module ?? "",
      variables: template.variables,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.subject.trim()) return;
    setIsSubmitting(true);
    // Use the HTML from the TipTap editor as the body for rendering/sending.
    const bodyPayload = editorRef.current?.getHTML() ?? form.body;
    try {
      if (editingId) {
        await updateTemplate({
          organizationId,
          templateId: editingId as Id<"emailTemplates">,
          name: form.name.trim(),
          subject: form.subject.trim(),
          body: bodyPayload,
          category: form.category.trim() || undefined,
          module: form.module || undefined,
          variables: form.variables,
        });
      } else {
        await createTemplate({
          organizationId,
          name: form.name.trim(),
          subject: form.subject.trim(),
          body: bodyPayload,
          category: form.category.trim() || undefined,
          module: form.module || undefined,
          variables: form.variables,
        });
      }
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (
    templateId: string,
    isActive: boolean,
  ) => {
    await updateTemplate({
      organizationId,
      templateId: templateId as Id<"emailTemplates">,
      isActive,
    });
  };

  const handleDelete = (templateId: string, templateName: string) => {
    setDeleteTarget({ id: templateId, name: templateName });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await removeTemplate({ organizationId, templateId: deleteTarget.id as Id<"emailTemplates"> });
    setDeleteTarget(null);
  };

  const insertVariable = (
    field: "subject" | "body",
    sourceKey: string,
    fieldKey: string,
    fieldLabel: string,
    sourceLabel: string,
  ) => {
    const varTag = `{{${sourceKey}.${fieldKey}}}`;
    setForm((prev) => {
      const updated = { ...prev, [field]: prev[field] + varTag };
      const alreadyExists = prev.variables.some(
        (v) => v.key === `${sourceKey}.${fieldKey}`,
      );
      if (!alreadyExists) {
        return {
          ...updated,
          variables: [
            ...prev.variables,
            {
              key: `${sourceKey}.${fieldKey}`,
              label: `${sourceLabel} > ${fieldLabel}`,
              source: sourceKey,
            },
          ],
        };
      }
      return updated;
    });
  };

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <SectionHeader.Root className="pt-4">
        <SectionHeader.Group>
          <SectionHeader.Heading className="flex-1">
            {t("emailTemplates.title")}
          </SectionHeader.Heading>
          <SectionHeader.Actions>
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" variant="stroke" />
              {t("emailTemplates.addTemplate")}
            </Button>
          </SectionHeader.Actions>
        </SectionHeader.Group>
        <UntitledAlert>{t("emailTemplates.description")}</UntitledAlert>
      </SectionHeader.Root>

      {/* Templates list */}
      <div className="space-y-2">
        {(!templates || templates.length === 0) && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("emailTemplates.empty")}
          </p>
        )}
        {templates?.map((template) => (
          <Card key={template._id}>
            <CardContent className="flex items-center justify-between py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{template.name}</p>
                  {template.module && (
                    <Badge variant="outline" className="text-xs">
                      {template.module === "crm"
                        ? "CRM"
                        : template.module === "gabinet"
                          ? "Gabinet"
                          : template.module}
                    </Badge>
                  )}
                  {template.category && (
                    <Badge variant="secondary" className="text-xs">
                      {template.category}
                    </Badge>
                  )}
                  {!template.isActive && (
                    <Badge variant="outline" className="text-xs">
                      {t("common.inactive")}
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {template.subject}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={template.isActive}
                  onCheckedChange={(checked) =>
                    handleToggleActive(template._id, checked)
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => openEditDialog(template as any)}
                >
                  <Pencil className="h-4 w-4" variant="stroke" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleDelete(template._id, template.name)}
                >
                  <Trash2 className="h-4 w-4" variant="stroke" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId
                ? t("emailTemplates.editTemplate")
                : t("emailTemplates.createTemplate")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>{t("common.name")}</Label>
                <Input
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder={t("emailTemplates.namePlaceholder")}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("common.category")}</Label>
                <Input
                  value={form.category}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, category: e.target.value }))
                  }
                  placeholder={t("emailTemplates.categoryPlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("common.module")}</Label>
                <Select
                  value={form.module}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      module: value === "all" ? "" : value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Wszystkie moduły" />
                  </SelectTrigger>
                  <SelectContent>
                    {MODULE_OPTIONS.map((opt) => (
                      <SelectItem
                        key={opt.value || "all"}
                        value={opt.value || "all"}
                      >
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>{t("inbox.subject")}</Label>
                <VariablePicker
                  sources={variableSources ?? []}
                  onInsert={(sourceKey, fieldKey, fieldLabel, sourceLabel) =>
                    insertVariable(
                      "subject",
                      sourceKey,
                      fieldKey,
                      fieldLabel,
                      sourceLabel,
                    )
                  }
                  label={t("emailTemplates.insertVariable")}
                />
              </div>
              <Input
                value={form.subject}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, subject: e.target.value }))
                }
                placeholder={t("emailTemplates.subjectPlaceholder")}
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t("inbox.body")}</Label>
              <EmailTemplateEditor
                ref={editorRef}
                value={form.body}
                onChange={(html) => setForm((prev) => ({ ...prev, body: html }))}
                organizationId={organizationId}
                requiredSources={
                  form.module ? [form.module] : undefined
                }
              />
            </div>

            {form.variables.length > 0 && (
              <div className="space-y-1.5">
                <Label>{t("emailTemplates.usedVariables")}</Label>
                <div className="flex flex-wrap gap-1">
                  {form.variables.map((v) => (
                    <Badge key={v.key} variant="secondary" className="text-xs">
                      {`{{${v.key}}}`}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isSubmitting}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                !form.name.trim() || !form.subject.trim() || isSubmitting
              }
            >
              {isSubmitting
                ? t("common.saving")
                : editingId
                  ? t("common.save")
                  : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              onClick={confirmDelete}
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

// ---------------------------------------------------------------------------
// Variable Picker
// ---------------------------------------------------------------------------

interface VariableSource {
  key: string;
  label: string;
  fields: { key: string; label: string }[];
}

function VariablePicker({
  sources,
  onInsert,
  label,
}: {
  sources: VariableSource[];
  onInsert: (
    sourceKey: string,
    fieldKey: string,
    fieldLabel: string,
    sourceLabel: string,
  ) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs">
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="end">
        <div className="max-h-60 overflow-y-auto">
          {sources.map((source) => (
            <div key={source.key} className="mb-2">
              <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                {source.label}
              </p>
              {source.fields.map((field) => (
                <button
                  key={`${source.key}.${field.key}`}
                  type="button"
                  className="w-full rounded-sm px-2 py-1 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    onInsert(source.key, field.key, field.label, source.label);
                    setOpen(false);
                  }}
                >
                  {field.label}
                  <span className="ml-1 text-xs text-muted-foreground">
                    {`{{${source.key}.${field.key}}}`}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
