import { useState } from "react";
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
import { X, Plus } from "@/lib/ez-icons";
import type { CustomFieldType, EntityType } from "@cvx/schema";

interface CustomFieldDefinitionFormProps {
  entityType: EntityType;
  onSubmit: (data: {
    name: string;
    fieldKey: string;
    fieldType: CustomFieldType;
    options?: string[];
    isRequired: boolean;
    group?: string;
  }) => void;
  onCancel: () => void;
  initialData?: {
    name: string;
    fieldKey: string;
    fieldType: CustomFieldType;
    options?: string[];
    isRequired?: boolean;
    group?: string;
  };
}

const fieldTypes: { value: CustomFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Select" },
  { value: "multiSelect", label: "Multi-Select" },
  { value: "checkbox", label: "Checkbox" },
  { value: "url", label: "URL" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "file", label: "File" },
];

export function CustomFieldDefinitionForm({
  onSubmit,
  onCancel,
  initialData,
}: CustomFieldDefinitionFormProps) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [fieldType, setFieldType] = useState<CustomFieldType>(
    initialData?.fieldType ?? "text"
  );
  const [options, setOptions] = useState<string[]>(
    initialData?.options ?? []
  );
  const [newOption, setNewOption] = useState("");
  const [isRequired, setIsRequired] = useState(
    initialData?.isRequired ?? false
  );
  const [group, setGroup] = useState(initialData?.group ?? "");

  const needsOptions = fieldType === "select" || fieldType === "multiSelect";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const fieldKey =
      initialData?.fieldKey ??
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
    onSubmit({
      name,
      fieldKey,
      fieldType,
      options: needsOptions ? options : undefined,
      isRequired,
      group: group || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Field Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Company Size"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label>Field Type</Label>
        <Select value={fieldType} onValueChange={(val) => setFieldType(val as CustomFieldType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {fieldTypes.map((ft) => (
              <SelectItem key={ft.value} value={ft.value}>
                {ft.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {needsOptions && (
        <div className="space-y-1.5">
          <Label>Options</Label>
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="flex-1 text-sm">{opt}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() =>
                    setOptions(options.filter((_, idx) => idx !== i))
                  }
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Input
                value={newOption}
                onChange={(e) => setNewOption(e.target.value)}
                placeholder="Add option..."
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newOption.trim()) {
                    e.preventDefault();
                    setOptions([...options, newOption.trim()]);
                    setNewOption("");
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => {
                  if (newOption.trim()) {
                    setOptions([...options, newOption.trim()]);
                    setNewOption("");
                  }
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Group (optional)</Label>
        <Input
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          placeholder="e.g. Contact Info"
        />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          checked={isRequired}
          onCheckedChange={(v) => setIsRequired(!!v)}
        />
        <Label>Required field</Label>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!name.trim()}>
          {initialData ? "Update" : "Create"} Field
        </Button>
      </div>
    </form>
  );
}
