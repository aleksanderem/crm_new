import { useState, useRef, useCallback } from "react";
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
import { ArrowLeft, Plus, Trash2, ChevronDown, ChevronUp } from "@/lib/ez-icons";
import { toast } from "sonner";
import type { DataSourceInfo } from "@/lib/document-data-sources";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/document-templates/new",
)({
  component: NewDocumentTemplatePage,
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

const SIGNATURE_ROLE_OPTIONS: { value: SignatureRole; label: string }[] = [
  { value: "author", label: "Autor" },
  { value: "client", label: "Klient" },
  { value: "patient", label: "Pacjent" },
  { value: "employee", label: "Pracownik" },
  { value: "witness", label: "Swiadek" },
];

function NewDocumentTemplatePage() {
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const editorRef = useRef<DocumentTemplateEditorHandle>(null);

  // Template metadata
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Category>("custom");
  const [module, setModule] = useState<Module>("platform");
  const [requiresSignature, setRequiresSignature] = useState(false);
  const [signatureSlots, setSignatureSlots] = useState<SignatureSlot[]>([]);
  const [accessMode, setAccessMode] = useState<"all" | "roles" | "users">(
    "all",
  );
  const [showSettings, setShowSettings] = useState(true);

  // Editor content
  const [content, setContent] = useState("");

  // Local fields (not yet saved to DB)
  const [localFields, setLocalFields] = useState<TemplateFieldRecord[]>([]);
  const [nextFieldId, setNextFieldId] = useState(1);

  // Field config modal
  const [fieldConfigOpen, setFieldConfigOpen] = useState(false);
  const [editingField, setEditingField] = useState<
    (FieldConfigData & { _id: string }) | undefined
  >(undefined);

  const [saving, setSaving] = useState(false);

  // Data sources
  const { data: sources } = useQuery(
    convexQuery(api.documentDataSources.listAvailableSources, {
      module: module || undefined,
    }),
  );

  const createTemplate = useMutation(api.documentTemplates.create);
  const createField = useMutation(api.documentTemplateFields.create);

  // Field operations (local)
  const handleAddField = useCallback(() => {
    setEditingField(undefined);
    setFieldConfigOpen(true);
  }, []);

  const handleEditField = useCallback(
    (fieldId: string) => {
      const field = localFields.find((f) => f._id === fieldId);
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
    [localFields],
  );

  const handleDeleteField = useCallback(
    (fieldId: string) => {
      setLocalFields((prev) => prev.filter((f) => f._id !== fieldId));
    },
    [],
  );

  const handleFieldClick = useCallback(
    (fieldKey: string) => {
      const field = localFields.find((f) => f.fieldKey === fieldKey);
      if (field && editorRef.current) {
        editorRef.current.insertField(field.fieldKey, field.label);
      }
    },
    [localFields],
  );

  const handleReorder = useCallback((fieldIds: string[]) => {
    setLocalFields((prev) => {
      const map = new Map(prev.map((f) => [f._id, f]));
      return fieldIds
        .map((id, idx) => {
          const f = map.get(id);
          if (!f) return null;
          return { ...f, sortOrder: idx };
        })
        .filter(Boolean) as TemplateFieldRecord[];
    });
  }, []);

  const handleFieldSave = useCallback(
    (data: FieldConfigData) => {
      if (editingField) {
        // Update existing local field
        setLocalFields((prev) =>
          prev.map((f) =>
            f._id === editingField._id
              ? {
                  ...f,
                  label: data.label,
                  fieldKey: data.fieldKey,
                  type: data.type,
                  group: data.group,
                  width: data.width,
                  defaultValue: data.defaultValue,
                  binding: data.binding,
                  validation: data.validation,
                  options: data.options,
                }
              : f,
          ),
        );
      } else {
        // Add new local field
        const newId = `local_${nextFieldId}`;
        setNextFieldId((n) => n + 1);
        setLocalFields((prev) => [
          ...prev,
          {
            _id: newId,
            fieldKey: data.fieldKey,
            label: data.label,
            type: data.type,
            sortOrder: prev.length,
            group: data.group,
            width: data.width,
            defaultValue: data.defaultValue,
            binding: data.binding,
            validation: data.validation,
            options: data.options,
          },
        ]);
      }
      setFieldConfigOpen(false);
      setEditingField(undefined);
    },
    [editingField, nextFieldId],
  );

  // Signature slots
  const addSignatureSlot = () => {
    setSignatureSlots((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "author", label: "" },
    ]);
  };

  const updateSignatureSlot = (
    id: string,
    patch: Partial<SignatureSlot>,
  ) => {
    setSignatureSlots((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  };

  const removeSignatureSlot = (id: string) => {
    setSignatureSlots((prev) => prev.filter((s) => s.id !== id));
  };

  // Save
  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Nazwa szablonu jest wymagana");
      return;
    }

    const finalContent = editorRef.current?.getHTML() ?? content;

    setSaving(true);
    try {
      const templateId = await createTemplate({
        organizationId,
        name: name.trim(),
        description: description.trim() || undefined,
        category,
        content: finalContent,
        module,
        requiredSources: [],
        requiresSignature,
        signatureSlots: signatureSlots.filter((s) => s.label.trim()),
        accessControl: {
          mode: accessMode,
          roles: [],
          userIds: [],
        },
      });

      // Create fields in sequence
      for (let i = 0; i < localFields.length; i++) {
        const f = localFields[i];
        await createField({
          templateId,
          fieldKey: f.fieldKey,
          label: f.label,
          type: f.type as any,
          sortOrder: i,
          group: f.group,
          options: f.options,
          defaultValue: f.defaultValue,
          binding: f.binding,
          validation: f.validation,
          width: f.width,
        });
      }

      toast.success("Szablon zostal utworzony");
      navigate({
        to: "/dashboard/settings/document-templates/$id",
        params: { id: templateId },
      });
    } catch (e: any) {
      toast.error(e.message ?? "Blad podczas zapisywania szablonu");
    } finally {
      setSaving(false);
    }
  };

  const editorFields: TemplateField[] = localFields.map((f) => ({
    fieldKey: f.fieldKey,
    label: f.label,
    type: f.type,
  }));

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
          <span className="text-foreground">Nowy szablon</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline">Szkic</Badge>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Zapisywanie..." : "Zapisz szkic"}
          </Button>
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
                  id="requiresSignature"
                  checked={requiresSignature}
                  onCheckedChange={(v) =>
                    setRequiresSignature(v === true)
                  }
                />
                <Label htmlFor="requiresSignature" className="font-normal">
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
                            <SelectItem key={opt.value} value={opt.value}>
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
        </div>

        {/* Field panel */}
        <div className="w-80 shrink-0 border-l">
          <TemplateFieldPanel
            fields={localFields}
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
        existingKeys={localFields.map((f) => f.fieldKey)}
      />
    </div>
  );
}
