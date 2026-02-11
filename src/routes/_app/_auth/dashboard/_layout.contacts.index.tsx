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
import { Plus, Users } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Doc } from "@cvx/_generated/dataModel";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/contacts/"
)({
  component: ContactsIndex,
});

type Contact = Doc<"contacts">;

const columns: ColumnDef<Contact>[] = [
  {
    accessorKey: "firstName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <Avatar className="h-7 w-7">
          <AvatarFallback className="text-xs">
            {row.original.firstName[0]}
            {row.original.lastName?.[0] ?? ""}
          </AvatarFallback>
        </Avatar>
        <span>
          {row.original.firstName} {row.original.lastName ?? ""}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "email",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Email" />
    ),
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{(getValue() as string) ?? "—"}</span>
    ),
  },
  {
    accessorKey: "phone",
    header: "Phone",
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{(getValue() as string) ?? "—"}</span>
    ),
  },
  {
    accessorKey: "title",
    header: "Title",
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

function ContactsIndex() {
  const { organizationId } = useOrganization();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery(
    convexQuery(api.contacts.list, {
      organizationId,
      paginationOpts: { numItems: 100, cursor: null },
    })
  );

  const contacts = data?.page ?? [];

  return (
    <div>
      <PageHeader
        title="Contacts"
        description="Manage your contacts and relationships."
        actions={
          <Button onClick={() => navigate({ to: "/dashboard/contacts/new" })}>
            <Plus className="mr-2 h-4 w-4" />
            Add Contact
          </Button>
        }
      />

      {!isLoading && contacts.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No contacts yet"
          description="Add your first contact to start building relationships."
          action={
            <Button
              onClick={() => navigate({ to: "/dashboard/contacts/new" })}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Contact
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={contacts}
          searchKey="firstName"
          searchPlaceholder="Search contacts..."
          onRowClick={(row) =>
            navigate({ to: `/dashboard/contacts/${row._id}` })
          }
        />
      )}
    </div>
  );
}
