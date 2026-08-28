import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import { toast } from "sonner";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatActionError } from "@/lib/format-action-error";

export const Route = createFileRoute("/_app/_auth/admin/users")({
  component: AdminUsers,
});

function AdminUsers() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: viewer, isLoading: viewerLoading } = useQuery(
    convexQuery(api.app.getCurrentUser, {}),
  );

  const getIsPlatformAdmin = useAction(api.app.getIsPlatformAdmin);
  const { data: adminStatus, isLoading: adminLoading } = useQuery({
    queryKey: ["isPlatformAdmin"],
    queryFn: () => getIsPlatformAdmin({}),
  });

  const listAction = useAction(api.platformAdmins.list);
  const usersQuery = useQuery({
    queryKey: ["platformAdmins", "list"],
    queryFn: () => listAction({}),
    enabled: Boolean(adminStatus?.isPlatformAdmin),
  });

  const setRoleAction = useAction(api.platformAdmins.setRole);
  const setRoleMutation = useMutation({
    mutationFn: setRoleAction,
    onSuccess: () => {
      toast.success("Role updated");
      queryClient.invalidateQueries({ queryKey: ["platformAdmins", "list"] });
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

  if (viewerLoading || adminLoading) {
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
            <Link to="/dashboard" className="text-sm underline">
              Back to dashboard
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const allUsers = usersQuery.data ?? [];
  const needle = search.trim().toLowerCase();
  const users = needle
    ? allUsers.filter(
        (u) =>
          (u.name ?? "").toLowerCase().includes(needle) ||
          (u.email ?? "").toLowerCase().includes(needle),
      )
    : allUsers;

  const handleToggle = (userId: Id<"users">, current: boolean) => {
    setRoleMutation.mutate({ userId, isPlatformAdmin: !current });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Platform admin · Users</h1>
          <p className="text-sm text-muted-foreground">
            Toggle the platform-admin role. Cannot remove the last admin.
          </p>
        </div>
        <Link to="/admin" className="text-sm underline">
          ← Back
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All users ({allUsers.length})</CardTitle>
          <CardDescription>
            Platform admins (highlighted) can access /admin pages and configure
            global settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Szukaj po nazwie lub e-mailu…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
        </CardContent>
        <CardContent className="p-0">
          <div className="divide-y">
            {usersQuery.isLoading && (
              <div className="p-6 text-sm text-muted-foreground">Loading users…</div>
            )}
            {!usersQuery.isLoading && users.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground">No users found.</div>
            )}
            {users.map((u) => {
              const isSelf = u._id === viewer?._id;
              return (
                <div
                  key={u._id}
                  className="flex items-center justify-between gap-4 p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">
                        {u.name || u.email || "(no name)"}
                      </span>
                      {u.isPlatformAdmin && (
                        <Badge variant="default">Platform admin</Badge>
                      )}
                      {isSelf && <Badge variant="outline">You</Badge>}
                    </div>
                    {u.email && (
                      <div className="truncate text-xs text-muted-foreground">
                        {u.email}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      to="/admin/users/$userId"
                      params={{ userId: u._id }}
                      className="text-sm underline text-muted-foreground hover:text-foreground"
                    >
                      Szczegóły
                    </Link>
                    <Button
                      size="sm"
                      variant={u.isPlatformAdmin ? "outline" : "default"}
                      disabled={setRoleMutation.isPending}
                      onClick={() => handleToggle(u._id as Id<"users">, u.isPlatformAdmin)}
                    >
                      {u.isPlatformAdmin ? "Revoke admin" : "Grant admin"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
