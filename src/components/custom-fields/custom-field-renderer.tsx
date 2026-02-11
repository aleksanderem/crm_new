import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { CustomFieldType } from "@cvx/schema";

interface FieldDefinition {
  _id: string;
  name: string;
  fieldKey: string;
  fieldType: CustomFieldType;
  options?: string[];
  isRequired?: boolean;
}

interface CustomFieldRendererProps {
  definition: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  readonly?: boolean;
}

export function CustomFieldRenderer({
  definition,
  value,
  onChange,
  readonly = false,
}: CustomFieldRendererProps) {
  const { fieldType, name, options, isRequired } = definition;

  const inputClasses =
    "h-9 w-full rounded-md border bg-transparent px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50";

  switch (fieldType) {
    case "text":
    case "url":
    case "email":
    case "phone":
      return (
        <div className="space-y-1.5">
          <Label>
            {name}
            {isRequired && <span className="text-destructive"> *</span>}
          </Label>
          <input
            type={fieldType === "email" ? "email" : fieldType === "url" ? "url" : fieldType === "phone" ? "tel" : "text"}
            className={inputClasses}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={readonly}
            required={isRequired}
          />
        </div>
      );

    case "number":
      return (
        <div className="space-y-1.5">
          <Label>
            {name}
            {isRequired && <span className="text-destructive"> *</span>}
          </Label>
          <input
            type="number"
            className={inputClasses}
            value={(value as number) ?? ""}
            onChange={(e) =>
              onChange(e.target.value ? Number(e.target.value) : null)
            }
            disabled={readonly}
            required={isRequired}
          />
        </div>
      );

    case "date":
      return (
        <div className="space-y-1.5">
          <Label>
            {name}
            {isRequired && <span className="text-destructive"> *</span>}
          </Label>
          <input
            type="date"
            className={inputClasses}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={readonly}
            required={isRequired}
          />
        </div>
      );

    case "checkbox":
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            checked={!!value}
            onCheckedChange={(checked) => onChange(checked)}
            disabled={readonly}
          />
          <Label>{name}</Label>
        </div>
      );

    case "select":
      return (
        <div className="space-y-1.5">
          <Label>
            {name}
            {isRequired && <span className="text-destructive"> *</span>}
          </Label>
          <select
            className={inputClasses}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            disabled={readonly}
            required={isRequired}
          >
            <option value="">Select...</option>
            {options?.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      );

    case "multiSelect": {
      const selected = (value as string[]) ?? [];
      return (
        <div className="space-y-1.5">
          <Label>
            {name}
            {isRequired && <span className="text-destructive"> *</span>}
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {options?.map((opt) => {
              const isSelected = selected.includes(opt);
              return (
                <Badge
                  key={opt}
                  variant={isSelected ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => {
                    if (readonly) return;
                    onChange(
                      isSelected
                        ? selected.filter((s) => s !== opt)
                        : [...selected, opt]
                    );
                  }}
                >
                  {opt}
                </Badge>
              );
            })}
          </div>
        </div>
      );
    }

    default:
      return null;
  }
}
