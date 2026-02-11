import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Doc } from "@cvx/_generated/dataModel";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/documents/"
)({
  component: DocumentsIndex,
});

type Document = Doc<"documents">;

function formatFileSize(bytes?: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const columns: ColumnDef<Document>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => (
      <div>
        <span className="font-medium">{row.original.name}</span>
        {row.original.description && (
          <p className="text-xs text-muted-foreground line-clamp-1">
            {row.original.description}
          </p>
        )}
      </div>
    ),
  },
  {
    accessorKey: "category",
    header: "Category",
    cell: ({ getValue }) => {
      const v = getValue() as string | undefined;
      return v ? (
        <Badge variant="outline" className="capitalize">
          {v}
        </Badge>
      ) : (
        "—"
      );
    },
    filterFn: (row, id, value) =>
      (value as string[]).includes(row.getValue(id)),
  },
  {
    accessorKey: "mimeType",
    header: "Type",
    cell: ({ getValue }) => {
      const v = getValue() as string | undefined;
      return (
        <span className="text-muted-foreground">{v?.split("/")[1] ?? "—"}</span>
      );
    },
  },
  {
    accessorKey: "fileSize",
    header: "Size",
    cell: ({ getValue }) => formatFileSize(getValue() as number | undefined),
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Uploaded" />
    ),
    cell: ({ getValue }) =>
      new Date(getValue() as number).toLocaleDateString(),
  },
];

function DocumentsIndex() {
  const { organizationId } = useOrganization();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery(
    convexQuery(api.documents.list, {
      organizationId,
      paginationOpts: { numItems: 100, cursor: null },
    })
  );

  const documents = data?.page ?? [];

  return (
    <div>
      <PageHeader
        title="Documents"
        description="Store and organize your files."
        actions={
          <Button
            onClick={() => navigate({ to: "/dashboard/documents/new" })}
          >
            <Plus className="mr-2 h-4 w-4" />
            Upload Document
          </Button>
        }
      />

      {!isLoading && documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents yet"
          description="Upload your first document to start organizing your files."
          action={
            <Button
              onClick={() => navigate({ to: "/dashboard/documents/new" })}
            >
              <Plus className="mr-2 h-4 w-4" />
              Upload Document
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={documents}
          searchKey="name"
          searchPlaceholder="Search documents..."
          filterableColumns={[
            {
              id: "category",
              title: "Category",
              options: [
                { label: "Proposal", value: "proposal" },
                { label: "Contract", value: "contract" },
                { label: "Invoice", value: "invoice" },
                { label: "Presentation", value: "presentation" },
                { label: "Report", value: "report" },
                { label: "Other", value: "other" },
              ],
            },
          ]}
          onRowClick={(row) =>
            navigate({ to: `/dashboard/documents/${row._id}` })
          }
        />
      )}
    </div>
  );
}
