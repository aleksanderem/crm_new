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
import { Plus, TrendingUp } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Doc } from "@cvx/_generated/dataModel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/leads/"
)({
  component: LeadsIndex,
});

type Lead = Doc<"leads">;

const statusColors: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  won: "bg-green-100 text-green-700",
  lost: "bg-red-100 text-red-700",
  archived: "bg-gray-100 text-gray-700",
};

const priorityColors: Record<string, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

const columns: ColumnDef<Lead>[] = [
  {
    accessorKey: "title",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Title" />
    ),
    cell: ({ getValue }) => (
      <span className="font-medium">{getValue() as string}</span>
    ),
  },
  {
    accessorKey: "value",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Value" />
    ),
    cell: ({ getValue }) => {
      const v = getValue() as number | undefined;
      return v ? formatCurrency(v) : "—";
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ getValue }) => {
      const status = getValue() as string;
      return (
        <Badge
          variant="secondary"
          className={cn("capitalize", statusColors[status])}
        >
          {status}
        </Badge>
      );
    },
    filterFn: (row, id, value) =>
      (value as string[]).includes(row.getValue(id)),
  },
  {
    accessorKey: "priority",
    header: "Priority",
    cell: ({ getValue }) => {
      const p = getValue() as string | undefined;
      return p ? (
        <Badge
          variant="secondary"
          className={cn("capitalize", priorityColors[p])}
        >
          {p}
        </Badge>
      ) : (
        "—"
      );
    },
    filterFn: (row, id, value) =>
      (value as string[]).includes(row.getValue(id)),
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

function LeadsIndex() {
  const { organizationId } = useOrganization();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery(
    convexQuery(api.leads.list, {
      organizationId,
      paginationOpts: { numItems: 100, cursor: null },
    })
  );

  const leads = data?.page ?? [];

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Track your deals and opportunities."
        actions={
          <Button onClick={() => navigate({ to: "/dashboard/leads/new" })}>
            <Plus className="mr-2 h-4 w-4" />
            Add Lead
          </Button>
        }
      />

      {!isLoading && leads.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="No leads yet"
          description="Create your first lead to start tracking opportunities."
          action={
            <Button
              onClick={() => navigate({ to: "/dashboard/leads/new" })}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Lead
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={leads}
          searchKey="title"
          searchPlaceholder="Search leads..."
          filterableColumns={[
            {
              id: "status",
              title: "Status",
              options: [
                { label: "Open", value: "open" },
                { label: "Won", value: "won" },
                { label: "Lost", value: "lost" },
                { label: "Archived", value: "archived" },
              ],
            },
            {
              id: "priority",
              title: "Priority",
              options: [
                { label: "Low", value: "low" },
                { label: "Medium", value: "medium" },
                { label: "High", value: "high" },
                { label: "Urgent", value: "urgent" },
              ],
            },
          ]}
          onRowClick={(row) =>
            navigate({ to: `/dashboard/leads/${row._id}` })
          }
        />
      )}
    </div>
  );
}
