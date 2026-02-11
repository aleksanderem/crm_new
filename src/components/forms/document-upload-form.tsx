import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload } from "lucide-react";
import type { DocumentCategory } from "@cvx/schema";

interface DocumentUploadFormProps {
  onSubmit: (data: {
    name: string;
    description?: string;
    category?: DocumentCategory;
    file?: File;
  }) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

const categoryOptions: DocumentCategory[] = [
  "proposal",
  "contract",
  "invoice",
  "presentation",
  "report",
  "other",
];

export function DocumentUploadForm({
  onSubmit,
  onCancel,
  isSubmitting = false,
}: DocumentUploadFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<DocumentCategory | "">("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const inputClasses =
    "h-9 w-full rounded-md border bg-transparent px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      description: description || undefined,
      category: category || undefined,
      file: file ?? undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4">
        <div className="space-y-1.5">
          <Label>
            Document Name <span className="text-destructive">*</span>
          </Label>
          <input
            className={inputClasses}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label>Category</Label>
          <select
            className={inputClasses}
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as DocumentCategory | "")
            }
          >
            <option value="">Select...</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </div>

        <div className="space-y-1.5">
          <Label>File</Label>
          <div
            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors hover:border-primary/50"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
            {file ? (
              <p className="text-sm">
                {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Click to upload a file
              </p>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setFile(f);
                if (!name) setName(f.name);
              }
            }}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!name.trim() || isSubmitting}>
          {isSubmitting ? "Uploading..." : "Upload Document"}
        </Button>
      </div>
    </form>
  );
}
