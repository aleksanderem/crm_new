import { useState } from "react";
import { Node, mergeAttributes, type Editor } from "@tiptap/core";
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  type ReactNodeViewProps,
} from "@tiptap/react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { useAction } from "convex/react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@cvx/_generated/api";
import type { CustomFieldType } from "@cvx/schema";
import { useOrganization } from "@/components/org-context";
import { useSupabaseCustomFieldDefinitions } from "@/hooks/use-supabase-custom-fields";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  PATIENT_BUILTIN_FIELDS,
  formFieldTypeToCustomFieldType,
  slugifyFieldKey,
} from "@/lib/documents/patient-mappable-fields";
import {
  Type,
  AlignLeft,
  List,
  Calendar,
  CheckSquare,
  LayoutGrid,
  Users,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FormFieldType = "text" | "textarea" | "select" | "button_select" | "date" | "checkbox";
export type FilledBy = "employee" | "client";

export interface FormFieldAttrs {
  fieldId: string;
  fieldType: FormFieldType;
  label: string;
  options: string; // comma-separated for select type
  required: boolean;
  placeholder: string;
  filledBy: FilledBy;
  // Mapping to a patient record field: "" | "builtin:<col>" | "custom:<key>"
  patientField: string;
}

// ---------------------------------------------------------------------------
// Icon helper
// ---------------------------------------------------------------------------

const FIELD_TYPE_ICONS: Record<FormFieldType, typeof Type> = {
  text: Type,
  textarea: AlignLeft,
  select: List,
  button_select: LayoutGrid,
  date: Calendar,
  checkbox: CheckSquare,
};

function FormFieldIcon({ type }: { type: FormFieldType }) {
  const Icon = FIELD_TYPE_ICONS[type] ?? Type;
  return <Icon className="h-3 w-3" />;
}

// ---------------------------------------------------------------------------
// Patient field mapping
// ---------------------------------------------------------------------------

const NONE = "__none__";
const CREATE = "__create__";

function PatientFieldMapping({
  value,
  fieldLabel,
  fieldType,
  onChange,
}: {
  value: string;
  fieldLabel: string;
  fieldType: FormFieldType;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const orgId = String(organizationId);
  const defsQuery = useSupabaseCustomFieldDefinitions(orgId, "gabinetPatient");
  const ensureDefinition = useAction(api.customFields.ensureDefinition);
  const queryClient = useQueryClient();

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const customDefs = defsQuery.data ?? [];
  const knownValues = new Set<string>([
    ...PATIENT_BUILTIN_FIELDS.map((f) => `builtin:${f.key}`),
    ...customDefs.map((d) => `custom:${d.fieldKey}`),
  ]);

  const handleSelect = (v: string) => {
    if (v === CREATE) {
      setCreating(true);
      setNewName(fieldLabel || "");
      return;
    }
    onChange(v === NONE ? "" : v);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const fieldKey = slugifyFieldKey(name);
      await ensureDefinition({
        organizationId,
        entityType: "gabinetPatient",
        name,
        fieldKey,
        fieldType: formFieldTypeToCustomFieldType(fieldType) as CustomFieldType,
      });
      await queryClient.invalidateQueries({
        queryKey: supabaseKeys.customFieldDefinitions.list(orgId),
      });
      onChange(`custom:${fieldKey}`);
      setCreating(false);
      setNewName("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1">
      <Label className="text-xs">
        {t("formEditor.formField.mapToPatient", "Mapuj do kartoteki pacjenta")}
      </Label>
      {creating ? (
        <div className="space-y-1.5">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="h-8 text-sm"
            placeholder={t("formEditor.formField.newPatientFieldName", "Nazwa nowego pola")}
            autoFocus
          />
          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="h-7 flex-1 text-xs"
              onClick={handleCreate}
              disabled={busy || !newName.trim()}
            >
              {t("common.create", "Utwórz")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setCreating(false)}
              disabled={busy}
            >
              {t("common.cancel", "Anuluj")}
            </Button>
          </div>
        </div>
      ) : (
        <Select value={value ? value : NONE} onValueChange={handleSelect}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>
              {t("formEditor.formField.noMapping", "Brak — nie zapisuj do kartoteki")}
            </SelectItem>
            {/* Built-in patient fields */}
            {PATIENT_BUILTIN_FIELDS.map((f) => (
              <SelectItem key={f.key} value={`builtin:${f.key}`}>
                {f.label}
              </SelectItem>
            ))}
            {/* Existing custom fields */}
            {customDefs.map((d) => (
              <SelectItem key={d.fieldKey} value={`custom:${d.fieldKey}`}>
                {d.name}
              </SelectItem>
            ))}
            {/* Fallback for a dangling / not-yet-loaded value */}
            {value && !knownValues.has(value) && (
              <SelectItem value={value}>{value}</SelectItem>
            )}
            <SelectItem value={CREATE}>
              {t("formEditor.formField.createPatientField", "+ Utwórz nowe pole pacjenta")}
            </SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Config popover
// ---------------------------------------------------------------------------

function FormFieldConfig({
  attrs,
  onChange,
  onClose,
}: {
  attrs: FormFieldAttrs;
  onChange: (updated: Partial<FormFieldAttrs>) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-3">
      <div className="space-y-1">
        <Label className="text-xs">{t("formEditor.formField.labelLabel")}</Label>
        <Input
          value={attrs.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="h-8 text-sm"
          placeholder={t("formEditor.formField.labelPlaceholder")}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">{t("formEditor.formField.fieldIdLabel")}</Label>
        <Input
          value={attrs.fieldId}
          onChange={(e) => onChange({ fieldId: e.target.value })}
          className="h-8 font-mono text-xs"
          placeholder="field_id"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">{t("formEditor.formField.typeLabel")}</Label>
        <Select
          value={attrs.fieldType}
          onValueChange={(v) => onChange({ fieldType: v as FormFieldType })}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">{t("formEditor.formField.typeText")}</SelectItem>
            <SelectItem value="textarea">{t("formEditor.formField.typeTextarea")}</SelectItem>
            <SelectItem value="select">{t("common.select")}</SelectItem>
            <SelectItem value="button_select">{t("formEditor.formField.typeButtonSelect")}</SelectItem>
            <SelectItem value="date">{t("formEditor.formField.typeDate")}</SelectItem>
            <SelectItem value="checkbox">{t("formEditor.formField.typeCheckbox")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {(attrs.fieldType === "select" || attrs.fieldType === "button_select") && (
        <div className="space-y-1">
          <Label className="text-xs">{t("formEditor.formField.optionsLabel")}</Label>
          <Input
            value={attrs.options}
            onChange={(e) => onChange({ options: e.target.value })}
            className="h-8 text-sm"
            placeholder={t("formEditor.formField.optionsPlaceholder")}
          />
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs">{t("formEditor.formField.placeholderLabel")}</Label>
        <Input
          value={attrs.placeholder}
          onChange={(e) => onChange({ placeholder: e.target.value })}
          className="h-8 text-sm"
          placeholder={t("formEditor.formField.placeholderPlaceholder")}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">
          {t("formEditor.filledBy.label", "Wypełnia")}
        </Label>
        <Select
          value={attrs.filledBy ?? "client"}
          onValueChange={(v) => onChange({ filledBy: v as FilledBy })}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="client">
              {t("formEditor.filledBy.client", "Klient")}
            </SelectItem>
            <SelectItem value="employee">
              {t("formEditor.filledBy.employee", "Pracownik")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {(attrs.filledBy ?? "client") === "client" && (
        <PatientFieldMapping
          value={attrs.patientField ?? ""}
          fieldLabel={attrs.label}
          fieldType={attrs.fieldType}
          onChange={(patientField) => onChange({ patientField })}
        />
      )}

      <div className="flex items-center justify-between">
        <Label className="text-xs">{t("common.required")}</Label>
        <Switch
          checked={attrs.required}
          onCheckedChange={(v) => onChange({ required: v })}
        />
      </div>

      <Button size="sm" variant="outline" onClick={onClose} className="w-full">
        {t("formEditor.formField.done")}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// React NodeView
// ---------------------------------------------------------------------------

function FormFieldNodeView({ node, updateAttributes, selected }: ReactNodeViewProps) {
  const { t } = useTranslation();
  const [configOpen, setConfigOpen] = useState(false);
  const attrs = node.attrs as FormFieldAttrs;
  const isClient = attrs.filledBy === "client";

  return (
    <NodeViewWrapper as="span" className="inline">
      <Popover open={configOpen} onOpenChange={setConfigOpen}>
        <PopoverTrigger asChild>
          <span
            className={cn(
              "inline-flex cursor-pointer items-center gap-1 rounded border border-dashed px-2 py-0.5 text-xs transition-colors",
              isClient
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-orange-300 bg-orange-50 text-orange-700",
              selected && "ring-2 ring-primary",
            )}
          >
            <FormFieldIcon type={attrs.fieldType} />
            {attrs.label || attrs.fieldId || t("formEditor.formField.fieldFallback")}
            {attrs.required && <span className="text-red-500">*</span>}
            {isClient && <Users className="h-3 w-3 ml-0.5 opacity-60" />}
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-72" onOpenAutoFocus={(e) => e.preventDefault()}>
          <FormFieldConfig
            attrs={attrs}
            onChange={updateAttributes}
            onClose={() => setConfigOpen(false)}
          />
        </PopoverContent>
      </Popover>
    </NodeViewWrapper>
  );
}

// ---------------------------------------------------------------------------
// TipTap Node extension
// ---------------------------------------------------------------------------

export const FormFieldNode = Node.create({
  name: "formField",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      fieldId: { default: "" },
      fieldType: { default: "text" as FormFieldType },
      label: { default: "" },
      options: { default: "" },
      required: { default: false },
      placeholder: { default: "" },
      filledBy: { default: "client" as FilledBy },
      patientField: { default: "" },
    };
  },

  parseHTML() {
    return [{
      tag: "span[data-form-field]",
      getAttrs: (el) => {
        const dom = el as HTMLElement;
        return {
          filledBy: dom.getAttribute("data-filled-by") || "employee",
          patientField: dom.getAttribute("data-patient-field") || "",
        };
      },
    }];
  },

  renderHTML({ HTMLAttributes }) {
    const isClient = HTMLAttributes.filledBy === "client";
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-form-field": HTMLAttributes.fieldId,
        "data-field-type": HTMLAttributes.fieldType,
        "data-filled-by": HTMLAttributes.filledBy || "employee",
        "data-patient-field": HTMLAttributes.patientField || "",
        // No dark: variants — this HTML is always rendered inside a
        // white-paper document container (bg-white + [&_*]:!text-gray-900),
        // where dark-mode backgrounds would clash with the forced dark text.
        class: isClient
          ? "inline-flex items-center rounded border border-dashed border-blue-300 bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
          : "inline-flex items-center rounded border border-dashed border-orange-300 bg-orange-50 px-2 py-0.5 text-xs text-orange-700",
        contenteditable: "false",
      }),
      `[${HTMLAttributes.label || HTMLAttributes.fieldId || i18n.t("formEditor.formField.fieldFallback")}]`,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FormFieldNodeView);
  },
});

// ---------------------------------------------------------------------------
// Insertion helper
// ---------------------------------------------------------------------------

export function insertFormField(
  editor: Editor,
  attrs?: Partial<FormFieldAttrs>,
) {
  const fieldId =
    attrs?.fieldId || `field_${crypto.randomUUID().slice(0, 8)}`;
  editor
    .chain()
    .focus()
    .insertContent({
      type: "formField",
      attrs: { fieldId, fieldType: "text", label: i18n.t("formEditor.formField.newFieldLabel"), filledBy: "client", ...attrs },
    })
    .run();
}
