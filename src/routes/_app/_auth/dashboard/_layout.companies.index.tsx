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
import { Plus, Building2 } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Doc } from "@cvx/_generated/dataModel";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/companies/"
)({
  component: CompaniesIndex,
});

type Company = Doc<"companies">;

const columns: ColumnDef<Company>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => (
      <div>
        <span className="font-medium">{row.original.name}</span>
        {row.original.domain && (
          <p className="text-xs text-muted-foreground">
            {row.original.domain}
          </p>
        )}
      </div>
    ),
  },
  {
    accessorKey: "industry",
    header: "Industry",
    cell: ({ getValue }) => {
      const v = getValue() as string | undefined;
      return v ? <Badge variant="outline">{v}</Badge> : "—";
    },
  },
  {
    accessorKey: "size",
    header: "Size",
    cell: ({ getValue }) => (getValue() as string) ?? "—",
  },
  {
    accessorKey: "phone",
    header: "Phone",
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{(getValue() as string) ?? "—"}</span>
    ),
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created" />
    ),
    cell: ({ getValue }) =>
      new Date(getValue() as number).toLocaleDateString(),
  },
];

function CompaniesIndex() {
  const { organizationId } = useOrganization();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery(
    convexQuery(api.companies.list, {
      organizationId,
      paginationOpts: { numItems: 100, cursor: null },
    })
  );

  const companies = data?.page ?? [];

  return (
    <div>
      <PageHeader
        title="Companies"
        description="Manage the companies you work with."
        actions={
          <Button
            onClick={() => navigate({ to: "/dashboard/companies/new" })}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Company
          </Button>
        }
      />

      {!isLoading && companies.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No companies yet"
          description="Add your first company to start tracking accounts."
          action={
            <Button
              onClick={() => navigate({ to: "/dashboard/companies/new" })}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Company
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={companies}
          searchKey="name"
          searchPlaceholder="Search companies..."
          filterableColumns={[
            {
              id: "industry",
              title: "Industry",
              options: [
                ...new Set(
                  companies
                    .map((c) => c.industry)
                    .filter(Boolean) as string[]
                ),
              ].map((i) => ({ label: i, value: i })),
            },
          ]}
          onRowClick={(row) =>
            navigate({ to: `/dashboard/companies/${row._id}` })
          }
        />
      )}
    </div>
  );
}
