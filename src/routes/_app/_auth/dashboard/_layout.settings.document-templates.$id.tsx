import { useState, useRef, useCallback, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DocumentTemplateEditor,
  type DocumentTemplateEditorHandle,
  type TemplateField,
} from "@/components/documents/template-editor";
import {
  TemplateFieldPanel,
  type TemplateFieldRecord,
} from "@/components/documents/template-field-panel";
import {
  TemplateFieldConfig,
  type FieldConfigData,
} from "@/components/documents/template-field-config";
import {
  ArrowLeft,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Archive,
} from "@/lib/ez-icons";
import { toast } from "sonner";
import type { Id } from "@cvx/_generated/dataModel";
import type { DataSourceInfo } from "@/lib/document-data-sources";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/document-templates/$id",
)({
  component: EditDocumentTemplatePage,
});

type Category =
  | "contract"
  | "invoice"
  | "consent"
  | "referral"
  | "prescription"
  | "report"
  | "protocol"
  | "custom";

type Module = "platform" | "gabinet" | "crm";

type Status = "draft" | "active" | "archived";

type SignatureRole = "author" | "client" | "patient" | "employee" | "witness";

interface SignatureSlot {
  id: string;
  role: SignatureRole;
  label: string;
}

const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: "contract", label: "Umowa" },
  { value: "invoice", label: "Faktura" },
  { value: "consent", label: "Zgoda" },
  { value: "referral", label: "Skierowanie" },
  { value: "prescription", label: "Recepta" },
  { value: "report", label: "Raport" },
  { value: "protocol", label: "Protokol" },
  { value: "custom", label: "Inny" },
];

const MODULE_OPTIONS: { value: Module; label: string }[] = [
  { value: "platform", label: "Platforma" },
  { value: "crm", label: "CRM" },
  { value: "gabinet", label: "Gabinet" },
];

const STATUS_LABELS: Record<Status, string> = {
  draft: "Szkic",
  active: "Aktywny",
  archived: "Archiwalny",
};

const SIGNATURE_ROLE_OPTIONS: { value: SignatureRole; label: string }[] = [
  { value: "author", label: "Autor" },
  { value: "client", label: "Klient" },
  { value: "patient", label: "Pacjent" },
  { value: "employee", label: "Pracownik" },
  { value: "witness", label: "Swiadek" },
];

function statusBadgeVariant(status: Status) {
  switch (status) {
    case "draft":
      return "outline" as const;
    case "active":
      return "default" as const;
    case "archived":
      return "secondary" as const;
  }
}

function EditDocumentTemplatePage() {
  const { id } = Route.useParams();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const editorRef = useRef<DocumentTemplateEditorHandle>(null);

  const templateId = id as Id<"documentTemplates">;

  // Load template
  const { data: template } = useQuery(
    convexQuery(api.documentTemplates.getById, { id: templateId }),
  );

  // Load fields
  const { data: fields } = useQuery(
    convexQuery(api.documentTemplateFields.listByTemplate, {
      templateId,
    }),
  );

  // Load data sources based on template module
  const { data: sources } = useQuery(
    convexQuery(api.documentDataSources.listAvailableSources, {
      module: template?.module ?? undefined,
    }),
  );

  // Local state for editing
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Category>("custom");
  const [module, setModule] = useState<Module>("platform");
  const [requiresSignature, setRequiresSignature] = useState(false);
  const [signatureSlots, setSignatureSlots] = useState<SignatureSlot[]>([]);
  const [accessMode, setAccessMode] = useState<"all" | "roles" | "users">(
    "all",
  );
  const [content, setContent] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Field config modal
  const [fieldConfigOpen, setFieldConfigOpen] = useState(false);
  const [editingField, setEditingField] = useState<
    (FieldConfigData & { _id: string }) | undefined
  >(undefined);

  const [saving, setSaving] = useState(false);

  // Mutations
  const updateTemplate = useMutation(api.documentTemplates.update);
  const publishTemplate = useMutation(api.documentTemplates.publish);
  const archiveTemplate = useMutation(api.documentTemplates.archive);
  const createNewVersion = useMutation(api.documentTemplates.createNewVersion);
  const createFieldMut = useMutation(api.documentTemplateFields.create);
  const updateFieldMut = useMutation(api.documentTemplateFields.update);
  const removeFieldMut = useMutation(api.documentTemplateFields.remove);
  const reorderFieldsMut = useMutation(api.documentTemplateFields.reorder);

  // Initialize form from template data
  useEffect(() => {
    if (template && !initialized) {
      setName(template.name);
      setDescription(template.description ?? "");
      setCategory(template.category as Category);
      setModule(template.module as Module);
      setRequiresSignature(template.requiresSignature);
      setSignatureSlots(
        template.signatureSlots.map((s) => ({
          id: s.id,
          role: s.role as SignatureRole,
          label: s.label,
        })),
      );
      setAccessMode(template.accessControl.mode);
      setContent(template.content);
      setInitialized(true);
    }
  }, [template, initialized]);

  // Convert DB fields to panel format
  const panelFields: TemplateFieldRecord[] = (fields ?? []).map((f) => ({
    _id: f._id,
    fieldKey: f.fieldKey,
    label: f.label,
    type: f.type,
    sortOrder: f.sortOrder,
    group: f.group,
    width: f.width,
    binding: f.binding,
    defaultValue: f.defaultValue,
    validation: f.validation,
    options: f.options,
  }));

  const editorFields: TemplateField[] = panelFields.map((f) => ({
    fieldKey: f.fieldKey,
    label: f.label,
    type: f.type,
  }));

  // Field operations
  const handleAddField = useCallback(() => {
    setEditingField(undefined);
    setFieldConfigOpen(true);
  }, []);

  const handleEditField = useCallback(
    (fieldId: string) => {
      const field = panelFields.find((f) => f._id === fieldId);
      if (!field) return;
      setEditingField({
        _id: field._id,
        label: field.label,
        fieldKey: field.fieldKey,
        type: field.type as FieldConfigData["type"],
        group: field.group,
        width: field.width,
        defaultValue: field.defaultValue,
        binding: field.binding,
        validation: field.validation,
        options: field.options,
      });
      setFieldConfigOpen(true);
    },
    [panelFields],
  );

  const handleDeleteField = useCallback(
    async (fieldId: string) => {
      try {
        await removeFieldMut({
          id: fieldId as Id<"documentTemplateFields">,
        });
        toast.success("Pole zostalo usuniete");
      } catch (e: any) {
        toast.error(e.message ?? "Blad podczas usuwania pola");
      }
    },
    [removeFieldMut],
  );

  const handleFieldClick = useCallback(
    (fieldKey: string) => {
      const field = panelFields.find((f) => f.fieldKey === fieldKey);
      if (field && editorRef.current) {
        editorRef.current.insertField(field.fieldKey, field.label);
      }
    },
    [panelFields],
  );

  const handleReorder = useCallback(
    async (fieldIds: string[]) => {
      try {
        await reorderFieldsMut({
          templateId,
          fieldIds: fieldIds as Id<"documentTemplateFields">[],
        });
      } catch (e: any) {
        toast.error(e.message ?? "Blad podczas zmiany kolejnosci");
      }
    },
    [reorderFieldsMut, templateId],
  );

  const handleFieldSave = useCallback(
    async (data: FieldConfigData) => {
      try {
        if (editingField) {
          await updateFieldMut({
            id: editingField._id as Id<"documentTemplateFields">,
            label: data.label,
            fieldKey: data.fieldKey,
            type: data.type as any,
            group: data.group,
            width: data.width,
            defaultValue: data.defaultValue,
            binding: data.binding,
            validation: data.validation,
            options: data.options,
          });
          toast.success("Pole zostalo zaktualizowane");
        } else {
          await createFieldMut({
            templateId,
            fieldKey: data.fieldKey,
            label: data.label,
            type: data.type as any,
            sortOrder: panelFields.length,
            group: data.group,
            width: data.width,
            defaultValue: data.defaultValue,
            binding: data.binding,
            validation: data.validation,
            options: data.options,
          });
          toast.success("Pole zostalo dodane");
        }
        setFieldConfigOpen(false);
        setEditingField(undefined);
      } catch (e: any) {
        toast.error(e.message ?? "Blad podczas zapisywania pola");
      }
    },
    [
      editingField,
      updateFieldMut,
      createFieldMut,
      templateId,
      panelFields.length,
    ],
  );

  // Signature slots
  const addSignatureSlot = () => {
    setSignatureSlots((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "author", label: "" },
    ]);
  };

  const updateSignatureSlot = (
    slotId: string,
    patch: Partial<SignatureSlot>,
  ) => {
    setSignatureSlots((prev) =>
      prev.map((s) => (s.id === slotId ? { ...s, ...patch } : s)),
    );
  };

  const removeSignatureSlot = (slotId: string) => {
    setSignatureSlots((prev) => prev.filter((s) => s.id !== slotId));
  };

  // Save template
  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Nazwa szablonu jest wymagana");
      return;
    }

    const finalContent = editorRef.current?.getHTML() ?? content;

    setSaving(true);
    try {
      await updateTemplate({
        id: templateId,
        name: name.trim(),
        description: description.trim() || undefined,
        category,
        content: finalContent,
        module,
        requiresSignature,
        signatureSlots: signatureSlots.filter((s) => s.label.trim()),
        accessControl: {
          mode: accessMode,
          roles: [],
          userIds: [],
        },
      });
      toast.success("Szablon zostal zapisany");
    } catch (e: any) {
      toast.error(e.message ?? "Blad podczas zapisywania");
    } finally {
      setSaving(false);
    }
  };

  // Publish
  const handlePublish = async () => {
    try {
      await handleSave();
      await publishTemplate({ id: templateId });
      toast.success("Szablon zostal opublikowany");
    } catch (e: any) {
      toast.error(e.message ?? "Blad podczas publikacji");
    }
  };

  // Archive
  const handleArchive = async () => {
    try {
      await archiveTemplate({ id: templateId });
      toast.success("Szablon zostal zarchiwizowany");
    } catch (e: any) {
      toast.error(e.message ?? "Blad podczas archiwizacji");
    }
  };

  // Create new version
  const handleNewVersion = async () => {
    try {
      const newId = await createNewVersion({ id: templateId });
      toast.success("Utworzono nowa wersje szablonu");
      navigate({
        to: "/dashboard/settings/document-templates/$id",
        params: { id: newId },
      });
    } catch (e: any) {
      toast.error(e.message ?? "Blad podczas tworzenia nowej wersji");
    }
  };

  if (!template) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Ladowanie szablonu...</p>
      </div>
    );
  }

  const status = template.status as Status;

  return (
    <div className="flex h-full flex-col">
      {/* Header bar */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <Link to="/dashboard/settings/document-templates">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link
            to="/dashboard/settings/document-templates"
            className="hover:text-foreground"
          >
            Szablony
          </Link>
          <span>/</span>
          <span className="text-foreground">{template.name}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant={statusBadgeVariant(status)}>
            {STATUS_LABELS[status]}
          </Badge>
          <Badge variant="outline">v{template.version}</Badge>

          {status === "draft" && (
            <>
              <Button variant="outline" onClick={handleSave} disabled={saving}>
                {saving ? "Zapisywanie..." : "Zapisz"}
              </Button>
              <Button onClick={handlePublish}>Opublikuj</Button>
            </>
          )}
          {status === "active" && (
            <>
              <Button variant="outline" onClick={handleNewVersion}>
                Nowa wersja
              </Button>
              <Button variant="outline" onClick={handleArchive}>
                <Archive className="mr-2 h-4 w-4" />
                Archiwizuj
              </Button>
            </>
          )}
          {status === "archived" && (
            <Button variant="outline" disabled>
              Zarchiwizowany
            </Button>
          )}
        </div>
      </div>

      {/* Collapsible settings section */}
      <div className="border-b">
        <button
          type="button"
          className="flex w-full items-center justify-between px-4 py-2 text-sm font-medium hover:bg-muted/50"
          onClick={() => setShowSettings((v) => !v)}
        >
          <span>Ustawienia szablonu</span>
          {showSettings ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
        {showSettings && (
          <div className="grid grid-cols-2 gap-4 px-4 pb-4 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Nazwa *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nazwa szablonu"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Kategoria</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as Category)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Modul</Label>
              <Select
                value={module}
                onValueChange={(v) => setModule(v as Module)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODULE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Dostep</Label>
              <Select
                value={accessMode}
                onValueChange={(v) =>
                  setAccessMode(v as "all" | "roles" | "users")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszyscy</SelectItem>
                  <SelectItem value="roles">Wedlug rol</SelectItem>
                  <SelectItem value="users">
                    Wybrani uzytkownicy
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5 lg:col-span-4">
              <Label>Opis</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Opcjonalny opis szablonu"
                rows={2}
              />
            </div>
            <div className="col-span-2 space-y-3 lg:col-span-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="requiresSignatureEdit"
                  checked={requiresSignature}
                  onCheckedChange={(v) =>
                    setRequiresSignature(v === true)
                  }
                />
                <Label
                  htmlFor="requiresSignatureEdit"
                  className="font-normal"
                >
                  Wymaga podpisu
                </Label>
              </div>
              {requiresSignature && (
                <div className="space-y-2 pl-6">
                  <Label className="text-xs">Sloty podpisow</Label>
                  {signatureSlots.map((slot) => (
                    <div
                      key={slot.id}
                      className="flex items-center gap-2"
                    >
                      <Select
                        value={slot.role}
                        onValueChange={(v) =>
                          updateSignatureSlot(slot.id, {
                            role: v as SignatureRole,
                          })
                        }
                      >
                        <SelectTrigger className="h-8 w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SIGNATURE_ROLE_OPTIONS.map((opt) => (
                            <SelectItem
                              key={opt.value}
                              value={opt.value}
                            >
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={slot.label}
                        onChange={(e) =>
                          updateSignatureSlot(slot.id, {
                            label: e.target.value,
                          })
                        }
                        placeholder="Etykieta"
                        className="h-8 flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => removeSignatureSlot(slot.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addSignatureSlot}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Dodaj slot
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Editor + Field panel split */}
      <div className="flex min-h-0 flex-1">
        {/* Editor */}
        <div className="flex-[3] overflow-auto p-4">
          {initialized && (
            <DocumentTemplateEditor
              ref={editorRef}
              content={content}
              onChange={setContent}
              fields={editorFields}
              onInsertFieldRequest={() => {
                setEditingField(undefined);
                setFieldConfigOpen(true);
              }}
              className="min-h-[400px]"
            />
          )}
        </div>

        {/* Field panel */}
        <div className="w-80 shrink-0 border-l">
          <TemplateFieldPanel
            fields={panelFields}
            sources={(sources as DataSourceInfo[]) ?? []}
            onAddField={handleAddField}
            onEditField={handleEditField}
            onDeleteField={handleDeleteField}
            onFieldClick={handleFieldClick}
            onReorder={handleReorder}
          />
        </div>
      </div>

      {/* Field config modal */}
      <TemplateFieldConfig
        open={fieldConfigOpen}
        onOpenChange={setFieldConfigOpen}
        field={editingField}
        sources={(sources as DataSourceInfo[]) ?? []}
        onSave={handleFieldSave}
        existingKeys={panelFields.map((f) => f.fieldKey)}
      />
    </div>
  );
}
