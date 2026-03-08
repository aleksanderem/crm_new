import { useState, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";

import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { CrmDataTable } from "@/components/crm/enhanced-data-table";
import { Upload, FileSignature, FileText, FileCheck } from "@/lib/ez-icons";
import { DocumentFromTemplateDialog } from "@/components/documents/document-from-template-dialog";
import type { ColumnDef } from "@tanstack/react-table";
import type { Doc } from "@cvx/_generated/dataModel";
import { toast } from "sonner";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/documents/",
)({
  component: DocumentsIndex,
});

type DocumentInstance = Doc<"documentInstances">;
type DocumentStatus = DocumentInstance["status"];

const STATUS_VARIANT: Record<
  DocumentStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  draft: "secondary",
  pending_review: "outline",
  approved: "default",
  pending_signature: "outline",
  signed: "default",
  archived: "secondary",
};

const STATUS_LABEL: Record<DocumentStatus, string> = {
  draft: "Szkic",
  pending_review: "Oczekuje na przegląd",
  approved: "Zatwierdzony",
  pending_signature: "Oczekuje na podpis",
  signed: "Podpisany",
  archived: "Zarchiwizowany",
};

function DocumentsIndex() {
  const { organizationId } = useOrganization();
  const navigate = useNavigate();

  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  const { data: instances, isLoading } = useQuery(
    convexQuery(api.documentInstances.list, { organizationId }),
  );

  const allDocs = instances ?? [];

  const columns: ColumnDef<DocumentInstance, unknown>[] = useMemo(
    () => [
      {
        accessorKey: "title",
        size: 250,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Tytuł" />
        ),
        cell: ({ row }) => {
          const doc = row.original;
          const isFile = doc.type === "file";
          return (
            <div className="flex items-center gap-2">
              {isFile ? (
                <FileCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0">
                <span className="font-medium">{doc.title}</span>
                {isFile && doc.fileName && (
                  <p className="text-xs text-muted-foreground truncate">
                    {doc.fileName}
                  </p>
                )}
              </div>
            </div>
          );
        },
      },
      {
        id: "type",
        size: 120,
        header: "Typ",
        cell: ({ row }) => {
          const type = row.original.type ?? "template";
          return (
            <Badge variant="outline">
              {type === "file" ? "Plik" : "Z szablonu"}
            </Badge>
          );
        },
      },
      {
        accessorKey: "status",
        size: 160,
        header: "Status",
        cell: ({ row }) => {
          const status = row.original.status;
          return (
            <Badge variant={STATUS_VARIANT[status]}>
              {STATUS_LABEL[status]}
            </Badge>
          );
        },
        filterFn: (row, _id, value) =>
          (value as string[]).includes(row.original.status),
      },
      {
        accessorKey: "category",
        size: 130,
        header: "Kategoria",
        cell: ({ row }) => {
          const cat = row.original.category;
          return cat ? (
            <Badge variant="outline" className="capitalize">
              {cat}
            </Badge>
          ) : (
            "—"
          );
        },
      },
      {
        id: "signatures",
        size: 130,
        header: "Podpisy",
        cell: ({ row }) => {
          const sigs = row.original.signatures;
          if (!sigs.length) return "—";
          const signed = sigs.filter((s) => s.signatureData).length;
          return (
            <span className="text-sm">
              {signed}/{sigs.length}
            </span>
          );
        },
      },
      {
        accessorKey: "createdAt",
        size: 130,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Utworzono" />
        ),
        cell: ({ getValue }) =>
          new Date(getValue() as number).toLocaleDateString("pl-PL"),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dokumenty"
        description="Dokumenty z szablonów i przesłane pliki"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setUploadDialogOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Prześlij plik
            </Button>
            <Button
              variant="outline"
              onClick={() => setTemplateDialogOpen(true)}
            >
              <FileSignature className="mr-2 h-4 w-4" />Z szablonu
            </Button>
          </div>
        }
      />

      <CrmDataTable<DocumentInstance>
        columns={columns}
        data={allDocs}
        stickyFirstColumn
        frozenColumns={1}
        searchKey="title"
        searchPlaceholder="Szukaj dokumentów..."
        filterableColumns={[
          {
            id: "status",
            title: "Status",
            options: Object.entries(STATUS_LABEL).map(([value, label]) => ({
              value,
              label,
            })),
          },
        ]}
        isLoading={isLoading}
        onRowClick={(row) =>
          navigate({ to: `/dashboard/documents/instance/${row._id}` })
        }
      />

      <DocumentFromTemplateDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        organizationId={organizationId}
        module="crm"
        sources={{}}
        onComplete={(instanceId) => {
          navigate({ to: `/dashboard/documents/instance/${instanceId}` });
        }}
      />

      <UploadDocumentDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        organizationId={organizationId}
        onComplete={(instanceId) => {
          navigate({ to: `/dashboard/documents/instance/${instanceId}` });
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload document dialog
// ---------------------------------------------------------------------------

function UploadDocumentDialog({
  open,
  onOpenChange,
  organizationId,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: any;
  onComplete: (instanceId: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [file, setFile] = useState<globalThis.File | null>(null);
  const [uploading, setUploading] = useState(false);

  const generateUploadUrl = useMutation(
    api.documentInstances.generateUploadUrl,
  );
  const createFromFile = useMutation(api.documentInstances.createFromFile);

  const resetForm = () => {
    setTitle("");
    setCategory("");
    setFile(null);
  };

  const handleSubmit = async () => {
    if (!file || !title.trim()) return;
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl({ organizationId });
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await result.json();

      const instanceId = await createFromFile({
        organizationId,
        title: title.trim(),
        fileId: storageId,
        fileName: file.name,
        mimeType: file.type || undefined,
        fileSize: file.size || undefined,
        category: category || undefined,
        module: "crm",
      });

      resetForm();
      onOpenChange(false);
      onComplete(instanceId);
      toast.success("Dokument został przesłany");
    } catch (err: any) {
      toast.error(err.message ?? "Nie udało się przesłać dokumentu");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Prześlij dokument</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>
              Tytuł <span className="text-destructive">*</span>
            </Label>
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

          <div className="space-y-1.5">
            <Label>
              Plik <span className="text-destructive">*</span>
            </Label>
            <Input
              type="file"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !title.trim()) {
                  setTitle(f.name.replace(/\.[^.]+$/, ""));
                }
              }}
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={uploading}
          >
            Anuluj
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={uploading || !file || !title.trim()}
          >
            {uploading ? "Przesyłanie..." : "Prześlij"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
