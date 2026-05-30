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
import {
  Type,
  AlignLeft,
  List,
  Calendar,
  CheckSquare,
  Users,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FormFieldType = "text" | "textarea" | "select" | "date" | "checkbox";
export type FilledBy = "employee" | "client";

export interface FormFieldAttrs {
  fieldId: string;
  fieldType: FormFieldType;
  label: string;
  options: string; // comma-separated for select type
  required: boolean;
  placeholder: string;
  filledBy: FilledBy;
}

// ---------------------------------------------------------------------------
// Icon helper
// ---------------------------------------------------------------------------

const FIELD_TYPE_ICONS: Record<FormFieldType, typeof Type> = {
  text: Type,
  textarea: AlignLeft,
  select: List,
  date: Calendar,
  checkbox: CheckSquare,
};

function FormFieldIcon({ type }: { type: FormFieldType }) {
  const Icon = FIELD_TYPE_ICONS[type] ?? Type;
  return <Icon className="h-3 w-3" />;
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
        <Label className="text-xs">Label</Label>
        <Input
          value={attrs.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="h-8 text-sm"
          placeholder="Field label..."
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Field ID</Label>
        <Input
          value={attrs.fieldId}
          onChange={(e) => onChange({ fieldId: e.target.value })}
          className="h-8 font-mono text-xs"
          placeholder="field_id"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Type</Label>
        <Select
          value={attrs.fieldType}
          onValueChange={(v) => onChange({ fieldType: v as FormFieldType })}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">Text</SelectItem>
            <SelectItem value="textarea">Textarea</SelectItem>
            <SelectItem value="select">Select</SelectItem>
            <SelectItem value="date">Date</SelectItem>
            <SelectItem value="checkbox">Checkbox</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {attrs.fieldType === "select" && (
        <div className="space-y-1">
          <Label className="text-xs">Options (comma-separated)</Label>
          <Input
            value={attrs.options}
            onChange={(e) => onChange({ options: e.target.value })}
            className="h-8 text-sm"
            placeholder="Option A, Option B, Option C"
          />
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs">Placeholder</Label>
        <Input
          value={attrs.placeholder}
          onChange={(e) => onChange({ placeholder: e.target.value })}
          className="h-8 text-sm"
          placeholder="Enter value..."
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

      <div className="flex items-center justify-between">
        <Label className="text-xs">Required</Label>
        <Switch
          checked={attrs.required}
          onCheckedChange={(v) => onChange({ required: v })}
        />
      </div>

      <Button size="sm" variant="outline" onClick={onClose} className="w-full">
        Done
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// React NodeView
// ---------------------------------------------------------------------------

function FormFieldNodeView({ node, updateAttributes, selected }: ReactNodeViewProps) {
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
            {attrs.label || attrs.fieldId || "Field"}
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
    };
  },

  parseHTML() {
    return [{
      tag: "span[data-form-field]",
      getAttrs: (el) => {
        const dom = el as HTMLElement;
        return {
          filledBy: dom.getAttribute("data-filled-by") || "employee",
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
        class: isClient
          ? "inline-flex items-center rounded border border-dashed border-blue-300 bg-blue-50 px-2 py-0.5 text-xs text-blue-700 dark:border-blue-600 dark:bg-blue-950 dark:text-blue-300"
          : "inline-flex items-center rounded border border-dashed border-orange-300 bg-orange-50 px-2 py-0.5 text-xs text-orange-700 dark:border-orange-600 dark:bg-orange-950 dark:text-orange-300",
        contenteditable: "false",
      }),
      `[${HTMLAttributes.label || HTMLAttributes.fieldId || "Field"}]`,
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
      attrs: { fieldId, fieldType: "text", label: "New field", filledBy: "client", ...attrs },
    })
    .run();
}
