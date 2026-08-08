import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { formatActionError } from "@/lib/format-action-error";

export const Route = createFileRoute("/_app/_auth/admin/entitlements")({
  component: AdminEntitlements,
});

function AdminEntitlements() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const getIsPlatformAdmin = useAction(api.app.getIsPlatformAdmin);
  const { data: adminStatus, isLoading: adminLoading } = useQuery({
    queryKey: ["isPlatformAdmin"],
    queryFn: () => getIsPlatformAdmin({}),
  });

  const listAction = useAction(api.admin.entitlements.listOrgEntitlements);
  const listQuery = useQuery({
    queryKey: ["admin", "entitlements"],
    queryFn: () => listAction({}),
    enabled: Boolean(adminStatus?.isPlatformAdmin),
  });

  const setAction = useAction(api.admin.entitlements.setEntitlement);
  const setMutation = useMutation({
    mutationFn: setAction,
    onSuccess: () => {
      toast.success("Zaktualizowano dostęp");
      queryClient.invalidateQueries({ queryKey: ["admin", "entitlements"] });
    },
    onError: (e) =>
      toast.error(
        formatActionError(e, t, {
          key: "admin.entitlements.errors.setFailed",
          defaultValue: "Nie udało się zaktualizować dostępu do modułu.",
        }),
      ),
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

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Dostęp do modułów
        </h1>
        <p className="text-sm text-muted-foreground">
          Nadawaj i odbieraj moduły per organizacja. CRM jest bazowy (zawsze
          aktywny).
        </p>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organizacja</TableHead>
                <TableHead>Członkowie</TableHead>
                <TableHead>CRM</TableHead>
                <TableHead>Gabinet</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((org) => (
                <TableRow key={org.organizationId}>
                  <TableCell className="font-medium">{org.name}</TableCell>
                  <TableCell>{org.memberCount}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">Bazowy</Badge>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={org.gabinet === "active"}
                      disabled={setMutation.isPending}
                      onCheckedChange={(checked) => {
                        if (
                          !checked &&
                          !window.confirm(
                            `Odebrać Gabinet dla „${org.name}"? Odetnie to żywy moduł.`,
                          )
                        ) {
                          return;
                        }
                        setMutation.mutate({
                          organizationId: org.organizationId as never,
                          productId: "gabinet",
                          grant: checked,
                        });
                      }}
                      aria-label={`Gabinet dla ${org.name}`}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
