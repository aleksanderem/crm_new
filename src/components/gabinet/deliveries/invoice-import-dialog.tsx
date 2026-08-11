import { useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "convex/react";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, Plus, Loader2, ChevronUp, ChevronDown, Trash2 } from "@/lib/ez-icons";
import { cn } from "@/lib/utils";

interface InvoicePage {
  id: string;
  file: File;
  preview: string;  // blob URL for images, empty string for PDFs
  storageId: string | null;
  uploading: boolean;
  error: boolean;
}

export function InvoiceImportDialog({
  organizationId,
  open,
  onOpenChange,
  onSaved,
}: {
  organizationId: Id<"organizations">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const generateUploadUrl = useMutation(api.app.generateUploadUrl);
  // @ts-ignore — TS2589: deep type instantiation in Convex codegen
  const createFromInvoice = useAction(api.warehouseDeliveries.createDeliveryFromInvoice);

  const [pages, setPages] = useState<InvoicePage[]>([]);
  const [saving, setSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const cleanup = useCallback(() => {
    setPages((prev) => {
      prev.forEach((p) => { if (p.preview) URL.revokeObjectURL(p.preview); });
      return [];
    });
  }, []);

  const handleOpenChange = (o: boolean) => {
    if (!o && !saving) cleanup();
    onOpenChange(o);
  };

  const uploadPage = useCallback(
    async (pageId: string, file: File) => {
      try {
        const uploadUrl = await generateUploadUrl();
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!res.ok) throw new Error("Upload failed");
        const { storageId } = await res.json() as { storageId: string };
        setPages((prev) =>
          prev.map((p) => p.id === pageId ? { ...p, storageId, uploading: false } : p),
        );
      } catch {
        setPages((prev) =>
          prev.map((p) => p.id === pageId ? { ...p, uploading: false, error: true } : p),
        );
      }
    },
    [generateUploadUrl],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      const valid = files.filter(
        (f) => f.type === "application/pdf" || f.type.startsWith("image/"),
      );
      if (valid.length === 0) return;

      const newPages: InvoicePage[] = valid.map((file) => ({
        id: crypto.randomUUID(),
        file,
        preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
        storageId: null,
        uploading: true,
        error: false,
      }));

      setPages((prev) => [...prev, ...newPages]);
      newPages.forEach((p) => void uploadPage(p.id, p.file));
    },
    [uploadPage],
  );

  const removePage = (id: string) => {
    setPages((prev) => {
      const page = prev.find((p) => p.id === id);
      if (page?.preview) URL.revokeObjectURL(page.preview);
      return prev.filter((p) => p.id !== id);
    });
  };

  const moveUp = (id: string) => {
    setPages((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  };

  const moveDown = (id: string) => {
    setPages((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  };

  const handleSave = async () => {
    const readyPages = pages.filter((p) => p.storageId && !p.error);
    if (readyPages.length === 0) return;

    setSaving(true);
    try {
      await createFromInvoice({
        organizationId,
        pages: readyPages.map((p, idx) => ({
          storageId: p.storageId!,
          mimeType: p.file.type || "application/octet-stream",
          position: idx,
        })),
      });
      toast.success(
        t("gabinet.deliveries.invoiceImport.created", "Robocza dostawa z faktury utworzona."),
      );
      onSaved();
      onOpenChange(false);
      cleanup();
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.deliveries.invoiceImport.error",
          defaultValue: "Nie udało się utworzyć dostawy.",
        }),
      );
    } finally {
      setSaving(false);
    }
  };

  const isUploading = pages.some((p) => p.uploading);
  const hasErrors = pages.some((p) => p.error);
  const readyCount = pages.filter((p) => p.storageId && !p.error).length;
  const canSave = readyCount > 0 && !isUploading && !saving;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("gabinet.deliveries.invoiceImport.title", "Dodaj dostawę z faktury")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "gabinet.deliveries.invoiceImport.description",
              "Dodaj plik PDF lub zdjęcia faktury (kolejne strony). Po zapisaniu zostanie utworzona robocza dostawa powiązana z tym dokumentem.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Uploaded pages list */}
          {pages.length > 0 && (
            <div className="max-h-60 space-y-1.5 overflow-y-auto rounded-md border p-2">
              {pages.map((page, idx) => (
                <div
                  key={page.id}
                  className="flex items-center gap-2 rounded-md border bg-muted/30 p-2"
                >
                  {/* Thumbnail or PDF icon */}
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded">
                    {page.preview ? (
                      <img src={page.preview} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted">
                        <FileText className="h-5 w-5 text-muted-foreground" variant="stroke" />
                      </div>
                    )}
                  </div>

                  {/* Filename and upload status */}
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="truncate text-xs font-medium">{page.file.name}</p>
                    {page.uploading && (
                      <p className="flex items-center text-xs text-muted-foreground">
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" variant="stroke" />
                        {t("common.uploading", "Przesyłanie…")}
                      </p>
                    )}
                    {page.error && (
                      <p className="text-xs text-destructive">
                        {t("gabinet.deliveries.invoiceImport.uploadError", "Błąd przesyłania")}
                      </p>
                    )}
                  </div>

                  {/* Page number */}
                  <span className="w-5 text-center text-xs text-muted-foreground">
                    {idx + 1}
                  </span>

                  {/* Reorder buttons */}
                  <div className="flex shrink-0 flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => moveUp(page.id)}
                      disabled={idx === 0}
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors",
                        idx > 0
                          ? "hover:bg-muted hover:text-foreground"
                          : "cursor-default opacity-30",
                      )}
                      aria-label={t("gabinet.deliveries.invoiceImport.moveUp", "Przesuń wyżej")}
                    >
                      <ChevronUp className="h-3.5 w-3.5" variant="stroke" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveDown(page.id)}
                      disabled={idx === pages.length - 1}
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors",
                        idx < pages.length - 1
                          ? "hover:bg-muted hover:text-foreground"
                          : "cursor-default opacity-30",
                      )}
                      aria-label={t("gabinet.deliveries.invoiceImport.moveDown", "Przesuń niżej")}
                    >
                      <ChevronDown className="h-3.5 w-3.5" variant="stroke" />
                    </button>
                  </div>

                  {/* Delete button */}
                  <button
                    type="button"
                    onClick={() => removePage(page.id)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    aria-label={t("common.delete", "Usuń")}
                  >
                    <Trash2 className="h-3.5 w-3.5" variant="stroke" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Drop zone / add more files */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
            }}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragging(false);
              if (e.dataTransfer.files?.length) {
                addFiles(Array.from(e.dataTransfer.files));
              }
            }}
            data-dragging={isDragging || undefined}
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/50 data-[dragging=true]:border-primary/50 data-[dragging=true]:bg-accent/50"
          >
            <Plus className="h-5 w-5" variant="stroke" />
            <p>
              {pages.length === 0
                ? t(
                    "gabinet.deliveries.invoiceImport.dropHint",
                    "Kliknij lub przeciągnij plik PDF lub zdjęcia faktury",
                  )
                : t("gabinet.deliveries.invoiceImport.addMore", "Dodaj kolejne strony")}
            </p>
            <p className="text-xs">
              {t("gabinet.deliveries.invoiceImport.formats", "PDF, JPG, PNG, HEIC i inne formaty zdjęć")}
            </p>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) {
                  addFiles(Array.from(e.target.files));
                  e.target.value = "";
                }
              }}
            />
          </div>

          {hasErrors && (
            <p className="text-xs text-destructive">
              {t(
                "gabinet.deliveries.invoiceImport.hasErrors",
                "Niektóre pliki nie zostały przesłane poprawnie. Usuń je i spróbuj ponownie.",
              )}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={saving}
          >
            {t("common.cancel", "Anuluj")}
          </Button>
          <Button type="button" onClick={handleSave} disabled={!canSave}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" variant="stroke" />}
            {t("gabinet.deliveries.invoiceImport.save", "Utwórz dostawę")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
