import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Trash2 } from "@/lib/ez-icons";
import { cn } from "@/lib/utils";
import { SourceFieldPicker } from "./source-field-picker";
import type {
  DataSourceInfo,
  FieldBinding,
} from "@/lib/document-data-sources";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "checkbox"
  | "currency"
  | "phone"
  | "email"
  | "pesel";

export interface FieldOption {
  label: string;
  value: string;
}

export interface FieldValidation {
  required?: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
}

export interface FieldConfigData {
  label: string;
  fieldKey: string;
  type: FieldType;
  group?: string;
  width: "full" | "half";
  defaultValue?: string;
  binding?: FieldBinding;
  validation?: FieldValidation;
  options?: FieldOption[];
}

export interface ExistingFieldData extends FieldConfigData {
  _id: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FIELD_TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: "text", label: "Tekst" },
  { value: "textarea", label: "Tekst wieloliniowy" },
  { value: "number", label: "Liczba" },
  { value: "date", label: "Data" },
  { value: "select", label: "Lista wyboru" },
  { value: "checkbox", label: "Checkbox" },
  { value: "currency", label: "Kwota" },
  { value: "phone", label: "Telefon" },
  { value: "email", label: "Email" },
  { value: "pesel", label: "PESEL" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "_")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function mapSourceTypeToFieldType(sourceType: string): FieldType {
  const mapping: Record<string, FieldType> = {
    text: "text",
    textarea: "textarea",
    number: "number",
    date: "date",
    select: "select",
    checkbox: "checkbox",
    currency: "currency",
    phone: "phone",
    email: "email",
    pesel: "pesel",
    string: "text",
  };
  return mapping[sourceType] ?? "text";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TemplateFieldConfigProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  field?: ExistingFieldData;
  sources: DataSourceInfo[];
  onSave: (fieldData: FieldConfigData) => void;
  existingKeys: string[];
}

export function TemplateFieldConfig({
  open,
  onOpenChange,
  field,
  sources,
  onSave,
  existingKeys,
}: TemplateFieldConfigProps) {
  const isEdit = !!field;

  // ---- Form state ----
  const [label, setLabel] = useState("");
  const [fieldKey, setFieldKey] = useState("");
  const [keyManuallyEdited, setKeyManuallyEdited] = useState(false);
  const [type, setType] = useState<FieldType>("text");
  const [group, setGroup] = useState("");
  const [width, setWidth] = useState<"full" | "half">("full");
  const [bindingMode, setBindingMode] = useState<"manual" | "bound">("manual");
  const [defaultValue, setDefaultValue] = useState("");
  const [binding, setBinding] = useState<FieldBinding | null>(null);
  const [validationRequired, setValidationRequired] = useState(false);
  const [validationMin, setValidationMin] = useState("");
  const [validationMax, setValidationMax] = useState("");
  const [validationMinLength, setValidationMinLength] = useState("");
  const [validationMaxLength, setValidationMaxLength] = useState("");
  const [options, setOptions] = useState<FieldOption[]>([]);

  // ---- Reset form when dialog opens ----
  useEffect(() => {
    if (!open) return;
    if (field) {
      setLabel(field.label);
      setFieldKey(field.fieldKey);
      setKeyManuallyEdited(true);
      setType(field.type);
      setGroup(field.group ?? "");
      setWidth(field.width);
      setBindingMode(field.binding ? "bound" : "manual");
      setDefaultValue(field.defaultValue ?? "");
      setBinding(field.binding ?? null);
      setValidationRequired(field.validation?.required ?? false);
      setValidationMin(field.validation?.min?.toString() ?? "");
      setValidationMax(field.validation?.max?.toString() ?? "");
      setValidationMinLength(field.validation?.minLength?.toString() ?? "");
      setValidationMaxLength(field.validation?.maxLength?.toString() ?? "");
      setOptions(field.options ?? []);
    } else {
      setLabel("");
      setFieldKey("");
      setKeyManuallyEdited(false);
      setType("text");
      setGroup("");
      setWidth("full");
      setBindingMode("manual");
      setDefaultValue("");
      setBinding(null);
      setValidationRequired(false);
      setValidationMin("");
      setValidationMax("");
      setValidationMinLength("");
      setValidationMaxLength("");
      setOptions([]);
    }
  }, [open, field]);

  // ---- Auto-generate key from label ----
  useEffect(() => {
    if (!keyManuallyEdited && label) {
      setFieldKey(slugify(label));
    }
  }, [label, keyManuallyEdited]);

  // ---- When binding is selected, auto-fill label and type ----
  const handleBindingChange = useCallback(
    (newBinding: FieldBinding | null) => {
      setBinding(newBinding);
      if (newBinding) {
        const src = sources.find((s) => s.key === newBinding.source);
        const fld = src?.fields.find((f) => f.key === newBinding.field);
        if (fld) {
          if (!label || !keyManuallyEdited) {
            setLabel(fld.label);
            setFieldKey(slugify(fld.label));
          }
          setType(mapSourceTypeToFieldType(fld.type));
        }
      }
    },
    [sources, label, keyManuallyEdited],
  );

  // ---- Validation ----
  const keyError = useMemo(() => {
    if (!fieldKey) return "Klucz pola jest wymagany";
    if (!/^[a-z][a-z0-9_]*$/.test(fieldKey))
      return "Klucz moze zawierac tylko male litery, cyfry i podkreslenia";
    const keysToCheck = isEdit
      ? existingKeys.filter((k) => k !== field?.fieldKey)
      : existingKeys;
    if (keysToCheck.includes(fieldKey))
      return "Klucz juz istnieje w tym szablonie";
    return null;
  }, [fieldKey, existingKeys, isEdit, field?.fieldKey]);

  const canSave = label.trim() !== "" && fieldKey.trim() !== "" && !keyError;

  // ---- Save handler ----
  function handleSave() {
    if (!canSave) return;

    const validation: FieldValidation = {};
    if (validationRequired) validation.required = true;
    if (type === "number" || type === "currency") {
      if (validationMin) validation.min = Number(validationMin);
      if (validationMax) validation.max = Number(validationMax);
    }
    if (type === "text" || type === "textarea") {
      if (validationMinLength) validation.minLength = Number(validationMinLength);
      if (validationMaxLength) validation.maxLength = Number(validationMaxLength);
    }

    const data: FieldConfigData = {
      label: label.trim(),
      fieldKey,
      type,
      width,
    };

    if (group.trim()) data.group = group.trim();
    if (bindingMode === "manual" && defaultValue.trim()) {
      data.defaultValue = defaultValue.trim();
    }
    if (bindingMode === "bound" && binding) {
      data.binding = binding;
    }
    if (Object.keys(validation).length > 0) {
      data.validation = validation;
    }
    if (type === "select" && options.length > 0) {
      data.options = options.filter((o) => o.value.trim() !== "");
    }

    onSave(data);
  }

  // ---- Options editor helpers ----
  function addOption() {
    setOptions((prev) => [...prev, { label: "", value: "" }]);
  }

  function updateOption(index: number, patch: Partial<FieldOption>) {
    setOptions((prev) =>
      prev.map((o, i) => (i === index ? { ...o, ...patch } : o)),
    );
  }

  function removeOption(index: number) {
    setOptions((prev) => prev.filter((_, i) => i !== index));
  }

  // ---- Render ----
  const showNumericValidation = type === "number" || type === "currency";
  const showLengthValidation = type === "text" || type === "textarea";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edytuj pole" : "Dodaj pole"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Zmien konfiguracje pola szablonu."
              : "Skonfiguruj nowe pole szablonu dokumentu."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* ---- Label ---- */}
          <div className="space-y-1.5">
            <Label htmlFor="field-label">
              Etykieta <span className="text-destructive">*</span>
            </Label>
            <Input
              id="field-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="np. Imie i nazwisko"
            />
          </div>

          {/* ---- Field key ---- */}
          <div className="space-y-1.5">
            <Label htmlFor="field-key">
              Klucz pola <span className="text-destructive">*</span>
            </Label>
            <Input
              id="field-key"
              value={fieldKey}
              onChange={(e) => {
                setFieldKey(e.target.value);
                setKeyManuallyEdited(true);
              }}
              placeholder="np. imie_i_nazwisko"
              className={cn(keyError && fieldKey && "border-destructive")}
            />
            {keyError && fieldKey && (
              <p className="text-xs text-destructive">{keyError}</p>
            )}
          </div>

          {/* ---- Type ---- */}
          <div className="space-y-1.5">
            <Label>Typ pola</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as FieldType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ---- Group ---- */}
          <div className="space-y-1.5">
            <Label htmlFor="field-group">Grupa</Label>
            <Input
              id="field-group"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              placeholder="np. Dane klienta"
            />
          </div>

          {/* ---- Width ---- */}
          <div className="space-y-1.5">
            <Label>Szerokosc</Label>
            <RadioGroup
              value={width}
              onValueChange={(v) => setWidth(v as "full" | "half")}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="full" id="width-full" />
                <Label htmlFor="width-full" className="font-normal">
                  Pelna
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="half" id="width-half" />
                <Label htmlFor="width-half" className="font-normal">
                  Polowa
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* ---- Data source section ---- */}
          <fieldset className="space-y-3 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">
              Zrodlo danych
            </legend>

            <RadioGroup
              value={bindingMode}
              onValueChange={(v) =>
                setBindingMode(v as "manual" | "bound")
              }
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="manual" id="mode-manual" />
                <Label htmlFor="mode-manual" className="font-normal">
                  Pole reczne
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="bound" id="mode-bound" />
                <Label htmlFor="mode-bound" className="font-normal">
                  Powiazane ze zrodlem
                </Label>
              </div>
            </RadioGroup>

            {bindingMode === "manual" && (
              <div className="space-y-1.5">
                <Label htmlFor="field-default" className="text-xs">
                  Wartosc domyslna
                </Label>
                <Input
                  id="field-default"
                  value={defaultValue}
                  onChange={(e) => setDefaultValue(e.target.value)}
                  placeholder="Opcjonalna wartosc domyslna"
                />
              </div>
            )}

            {bindingMode === "bound" && (
              <SourceFieldPicker
                sources={sources}
                value={binding}
                onChange={handleBindingChange}
              />
            )}
          </fieldset>

          {/* ---- Validation section ---- */}
          <fieldset className="space-y-3 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">Walidacja</legend>

            <div className="flex items-center gap-2">
              <Checkbox
                id="val-required"
                checked={validationRequired}
                onCheckedChange={(v) => setValidationRequired(v === true)}
              />
              <Label htmlFor="val-required" className="font-normal">
                Wymagane
              </Label>
            </div>

            {showNumericValidation && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="val-min" className="text-xs">
                    Minimum
                  </Label>
                  <Input
                    id="val-min"
                    type="number"
                    value={validationMin}
                    onChange={(e) => setValidationMin(e.target.value)}
                    placeholder="Min"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="val-max" className="text-xs">
                    Maksimum
                  </Label>
                  <Input
                    id="val-max"
                    type="number"
                    value={validationMax}
                    onChange={(e) => setValidationMax(e.target.value)}
                    placeholder="Max"
                  />
                </div>
              </div>
            )}

            {showLengthValidation && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="val-minlen" className="text-xs">
                    Min. dlugosci
                  </Label>
                  <Input
                    id="val-minlen"
                    type="number"
                    value={validationMinLength}
                    onChange={(e) => setValidationMinLength(e.target.value)}
                    placeholder="Min"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="val-maxlen" className="text-xs">
                    Max. dlugosci
                  </Label>
                  <Input
                    id="val-maxlen"
                    type="number"
                    value={validationMaxLength}
                    onChange={(e) => setValidationMaxLength(e.target.value)}
                    placeholder="Max"
                  />
                </div>
              </div>
            )}
          </fieldset>

          {/* ---- Options editor (for type=select) ---- */}
          {type === "select" && (
            <fieldset className="space-y-3 rounded-md border p-3">
              <legend className="px-1 text-sm font-medium">
                Opcje listy wyboru
              </legend>

              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={opt.label}
                    onChange={(e) =>
                      updateOption(idx, { label: e.target.value })
                    }
                    placeholder="Etykieta"
                    className="flex-1"
                  />
                  <Input
                    value={opt.value}
                    onChange={(e) =>
                      updateOption(idx, { value: e.target.value })
                    }
                    placeholder="Wartosc"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeOption(idx)}
                    className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addOption}
              >
                <Plus className="mr-1 h-4 w-4" />
                Dodaj opcje
              </Button>
            </fieldset>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Anuluj
          </Button>
          <Button type="button" onClick={handleSave} disabled={!canSave}>
            {isEdit ? "Zapisz zmiany" : "Dodaj pole"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
