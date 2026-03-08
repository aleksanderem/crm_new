import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Doc } from "@cvx/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type DocumentInstance = Doc<"documentInstances">;

interface DocumentEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instance: DocumentInstance;
}

export function DocumentEditDialog({
  open,
  onOpenChange,
  instance,
}: DocumentEditDialogProps) {
  const [title, setTitle] = useState(instance.title);
  const [category, setCategory] = useState(instance.category ?? "");
  const [file, setFile] = useState<globalThis.File | null>(null);
  const [saving, setSaving] = useState(false);

  const updateDraft = useMutation(api.documentInstances.updateDraft);
  const generateUploadUrl = useMutation(api.documentInstances.generateUploadUrl);

  const isFile = instance.type === "file";

  // Reset form when instance changes
  useEffect(() => {
    setTitle(instance.title);
    setCategory(instance.category ?? "");
    setFile(null);
  }, [instance._id, instance.title, instance.category]);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const args: Record<string, any> = { id: instance._id };

      if (title.trim() !== instance.title) {
        args.title = title.trim();
      }
      if (category !== (instance.category ?? "")) {
        args.category = category || undefined;
      }

      // Handle file replacement
      if (isFile && file) {
        const uploadUrl = await generateUploadUrl({
          organizationId: instance.organizationId,
        });
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        const { storageId } = await result.json();
        args.fileId = storageId;
        args.fileName = file.name;
        args.mimeType = file.type || undefined;
        args.fileSize = file.size || undefined;
      }

      await updateDraft(args);
      toast.success("Dokument został zaktualizowany");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message ?? "Nie udało się zapisać zmian");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edytuj dokument</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Tytuł</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nazwa dokumentu"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Kategoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz kategorię" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contract">Umowa</SelectItem>
                <SelectItem value="invoice">Faktura</SelectItem>
                <SelectItem value="proposal">Oferta</SelectItem>
                <SelectItem value="report">Raport</SelectItem>
                <SelectItem value="other">Inne</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isFile && (
            <div className="space-y-1.5">
              <Label>Zastąp plik</Label>
              {instance.fileName && (
                <p className="text-xs text-muted-foreground">
                  Aktualny: {instance.fileName}
                </p>
              )}
              <Input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file && (
                <p className="text-xs text-muted-foreground">
                  Nowy: {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Anuluj
          </Button>
          <Button onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? "Zapisywanie..." : "Zapisz"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
