import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_app/_auth/admin/organizations")({
  component: AdminOrganizations,
});

function AdminOrganizations() {
  const [search, setSearch] = useState("");

  const getIsPlatformAdmin = useAction(api.app.getIsPlatformAdmin);
  const { data: adminStatus, isLoading: adminLoading } = useQuery({
    queryKey: ["isPlatformAdmin"],
    queryFn: () => getIsPlatformAdmin({}),
  });

  const listAction = useAction(api.admin.organizations.listOrganizations);
  const listQuery = useQuery({
    queryKey: ["admin", "organizations"],
    queryFn: () => listAction({}),
    enabled: Boolean(adminStatus?.isPlatformAdmin),
  });

  if (adminLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!adminStatus?.isPlatformAdmin) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <Card>
          <CardHeader>
            <CardTitle>403 — Platform admin required</CardTitle>
            <CardDescription>
              This page is only accessible to platform administrators.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/admin" className="text-sm underline">
              Back to admin
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const rows = listQuery.data ?? [];

  const filtered = search.trim()
    ? rows.filter(
        (r) =>
          r.name.toLowerCase().includes(search.toLowerCase()) ||
          (r.ownerEmail ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : rows;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Organizacje</h1>
        <p className="text-sm text-muted-foreground">
          Lista wszystkich organizacji na platformie. Kliknij „Szczegóły", aby
          zarządzać organizacją.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <Input
          placeholder="Szukaj po nazwie lub e-mailu właściciela…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <span className="text-sm text-muted-foreground">
          {filtered.length} organizacji
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nazwa</TableHead>
                <TableHead>Właściciel</TableHead>
                <TableHead>Członkowie</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>CRM</TableHead>
                <TableHead>Gabinet</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {listQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                    Ładowanie…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                    Brak organizacji.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((org) => (
                  <TableRow key={org.organizationId}>
                    <TableCell className="font-medium">{org.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {org.ownerEmail ?? "—"}
                    </TableCell>
                    <TableCell>{org.memberCount}</TableCell>
                    <TableCell>
                      {org.status === "active" ? (
                        <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                          Aktywna
                        </Badge>
                      ) : (
                        <Badge variant="destructive">Zawieszona</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {org.plan ?? "—"}
                    </TableCell>
                    <TableCell>
                      {org.crm === "active" ? (
                        <Badge variant="secondary">aktywny</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {org.gabinet === "active" ? (
                        <Badge variant="secondary">aktywny</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <a
                        href={`/admin/organizations/${org.organizationId}`}
                        className="text-sm underline"
                      >
                        Szczegóły
                      </a>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
