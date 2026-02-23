import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMutation } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { Upload, FileText, X, Loader2 } from "@/lib/ez-icons";
import type { CustomFieldType } from "@cvx/schema";
import type { Id } from "@cvx/_generated/dataModel";

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

interface FileValue {
  storageId: string;
  fileName: string;
}

function isFileValue(val: unknown): val is FileValue {
  return (
    typeof val === "object" &&
    val !== null &&
    "storageId" in val &&
    "fileName" in val
  );
}

export function CustomFieldRenderer({
  definition,
  value,
  onChange,
  readonly = false,
}: CustomFieldRendererProps) {
  const { fieldType, name, options, isRequired } = definition;

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
          <Input
            type={fieldType === "email" ? "email" : fieldType === "url" ? "url" : fieldType === "phone" ? "tel" : "text"}
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
          <Input
            type="number"
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
          <Input
            type="date"
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
          <Select
            value={(value as string) ?? ""}
            onValueChange={(val) => onChange(val || null)}
            disabled={readonly}
            required={isRequired}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {options?.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

    case "file":
      return (
        <FileFieldRenderer
          name={name}
          isRequired={isRequired}
          value={value}
          onChange={onChange}
          readonly={readonly}
        />
      );

    default:
      return null;
  }
}

function FileFieldRenderer({
  name,
  isRequired,
  value,
  onChange,
  readonly,
}: {
  name: string;
  isRequired?: boolean;
  value: unknown;
  onChange: (value: unknown) => void;
  readonly: boolean;
}) {
  const { organizationId } = useOrganization();
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fileVal = isFileValue(value) ? value : null;

  const { data: fileUrl } = useQuery({
    ...convexQuery(api.documents.getFileUrl, {
      organizationId,
      storageId: (fileVal?.storageId ?? "") as Id<"_storage">,
    }),
    enabled: !!fileVal?.storageId,
  });

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const uploadUrl = await generateUploadUrl({ organizationId });
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await result.json();
      onChange({ storageId, fileName: file.name });
    } catch (err) {
      console.error("File upload failed:", err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-1.5">
      <Label>
        {name}
        {isRequired && <span className="text-destructive"> *</span>}
      </Label>
      {fileVal ? (
        <div className="flex items-center gap-2 rounded-md border px-3 py-2">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          {fileUrl ? (
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline truncate"
            >
              {fileVal.fileName}
            </a>
          ) : (
            <span className="text-sm truncate">{fileVal.fileName}</span>
          )}
          {!readonly && (
            <button
              type="button"
              className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => onChange(null)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ) : (
        <>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
            disabled={readonly || isUploading}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
            disabled={readonly || isUploading}
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Przesyłanie...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Wybierz plik
              </>
            )}
          </Button>
        </>
      )}
    </div>
  );
}
