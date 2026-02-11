import { CustomFieldRenderer } from "./custom-field-renderer";
import type { CustomFieldType } from "@cvx/schema";

interface FieldDefinition {
  _id: string;
  name: string;
  fieldKey: string;
  fieldType: CustomFieldType;
  options?: string[];
  isRequired?: boolean;
  group?: string;
}

interface CustomFieldFormSectionProps {
  definitions: FieldDefinition[];
  values: Record<string, unknown>;
  onChange: (fieldKey: string, value: unknown) => void;
  readonly?: boolean;
}

export function CustomFieldFormSection({
  definitions,
  values,
  onChange,
  readonly = false,
}: CustomFieldFormSectionProps) {
  if (definitions.length === 0) return null;

  // Group fields by group
  const grouped = definitions.reduce<Record<string, FieldDefinition[]>>(
    (acc, def) => {
      const group = def.group ?? "Custom Fields";
      if (!acc[group]) acc[group] = [];
      acc[group].push(def);
      return acc;
    },
    {}
  );

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([groupName, fields]) => (
        <div key={groupName} className="space-y-4">
          <h4 className="text-sm font-medium text-muted-foreground">
            {groupName}
          </h4>
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((def) => (
              <CustomFieldRenderer
                key={def._id}
                definition={def}
                value={values[def.fieldKey]}
                onChange={(val) => onChange(def.fieldKey, val)}
                readonly={readonly}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
