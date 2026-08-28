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
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { formatActionError } from "@/lib/format-action-error";

export const Route = createFileRoute("/_app/_auth/admin/users/$userId")({
  component: AdminUserDetail,
});

function AdminUserDetail() {
  const { userId } = Route.useParams();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Admin gate
  const getIsPlatformAdmin = useAction(api.app.getIsPlatformAdmin);
  const { data: adminStatus, isLoading: adminLoading } = useQuery({
    queryKey: ["isPlatformAdmin"],
    queryFn: () => getIsPlatformAdmin({}),
  });

  // User detail query
  const detailAction = useAction(api.admin.users.getUserDetail);
  const detailQuery = useQuery({
    queryKey: ["admin", "users", userId],
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore -- TS2589: type instantiation depth in generated api types
    queryFn: () => detailAction({ userId }),
    enabled: Boolean(adminStatus?.isPlatformAdmin),
  });

  const detail = detailQuery.data;

  // Platform-admin toggle
  const setRoleAction = useAction(api.platformAdmins.setRole);
  const setRoleMutation = useMutation({
    mutationFn: setRoleAction,
    onSuccess: () => {
      toast.success("Rola zaktualizowana");
      void queryClient.invalidateQueries({ queryKey: ["admin", "users", userId] });
      void queryClient.invalidateQueries({ queryKey: ["platformAdmins", "list"] });
    },
    onError: (e: Error) => {
      toast.error(
        formatActionError(e, t, {
          key: "admin.users.errors.roleUpdateFailed",
          defaultValue: "Nie udało się zmienić roli użytkownika.",
        }),
      );
    },
  });

  // Suspend toggle
  const setSuspendedAction = useAction(api.admin.users.setUserSuspended);
  const setSuspendedMutation = useMutation({
    mutationFn: setSuspendedAction,
    onSuccess: () => {
      toast.success("Status zawieszenia zaktualizowany");
      void queryClient.invalidateQueries({ queryKey: ["admin", "users", userId] });
    },
    onError: (e: Error) => {
      toast.error(
        formatActionError(e, t, {
          key: "admin.users.errors.suspendFailed",
          defaultValue: "Nie udało się zmienić statusu zawieszenia.",
        }),
      );
    },
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

  if (detailQuery.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Ładowanie…</div>;
  }

  if (!detail) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <Card>
          <CardHeader>
            <CardTitle>Nie znaleziono użytkownika</CardTitle>
          </CardHeader>
          <CardContent>
            <Link to="/admin/users" className="text-sm underline">
              Wróć do listy użytkowników
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      {/* Back link */}
      <div>
        <Link
          to="/admin/users"
          className="text-sm text-muted-foreground underline hover:text-foreground"
        >
          ← Wróć do listy użytkowników
        </Link>
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {detail.name || detail.email || "(brak nazwy)"}
        </h1>
        <p className="text-sm text-muted-foreground">ID: {userId}</p>
      </div>

      {/* Profil */}
      <Card>
        <CardHeader>
          <CardTitle>Profil</CardTitle>
          <CardDescription>Dane konta użytkownika (tylko do odczytu).</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium text-muted-foreground">Imię i nazwisko</dt>
              <dd>{detail.name ?? <span className="text-muted-foreground">—</span>}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">E-mail</dt>
              <dd>{detail.email ?? <span className="text-muted-foreground">—</span>}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Nazwa użytkownika</dt>
              <dd>{detail.username ?? <span className="text-muted-foreground">—</span>}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Język</dt>
              <dd>{detail.language ?? <span className="text-muted-foreground">—</span>}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Motyw</dt>
              <dd>{detail.theme ?? <span className="text-muted-foreground">—</span>}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Strefa czasowa</dt>
              <dd>{detail.timezone ?? <span className="text-muted-foreground">—</span>}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Status */}
      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>Zarządzaj uprawnieniami i zawieszeniem konta.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="admin-switch">Administrator platformy</Label>
              <p className="text-xs text-muted-foreground">
                Dostęp do stron /admin i ustawień globalnych.
              </p>
            </div>
            <Switch
              id="admin-switch"
              checked={detail.isPlatformAdmin}
              disabled={setRoleMutation.isPending}
              onCheckedChange={(checked) =>
                setRoleMutation.mutate({
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  // @ts-ignore -- TS2589: type instantiation depth in generated api types
                  userId,
                  isPlatformAdmin: checked,
                })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="suspend-switch">Zawieszony</Label>
              <p className="text-xs text-muted-foreground">
                Zawieszony użytkownik nie może się zalogować.
              </p>
            </div>
            <Switch
              id="suspend-switch"
              checked={detail.isSuspended}
              disabled={setSuspendedMutation.isPending}
              onCheckedChange={(checked) =>
                setSuspendedMutation.mutate({
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  // @ts-ignore -- TS2589: type instantiation depth in generated api types
                  userId,
                  suspended: checked,
                })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Organizacje */}
      <Card>
        <CardHeader>
          <CardTitle>Organizacje</CardTitle>
          <CardDescription>
            {detail.memberships.length} członkostwo
            {detail.memberships.length !== 1 ? "w" : ""} w organizacjach.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organizacja</TableHead>
                <TableHead>Rola</TableHead>
                <TableHead>Dołączył(a)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.memberships.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="py-6 text-center text-sm text-muted-foreground"
                  >
                    Brak członkostw.
                  </TableCell>
                </TableRow>
              ) : (
                detail.memberships.map((m) => (
                  <TableRow key={m.organizationId}>
                    <TableCell className="font-medium">{m.organizationName}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{m.role}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {m.joinedAt
                        ? new Date(m.joinedAt).toLocaleDateString("pl-PL")
                        : "—"}
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
