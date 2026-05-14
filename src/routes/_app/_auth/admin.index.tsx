import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_app/_auth/admin/")({
  component: AdminIndex,
});

function AdminIndex() {
  const { data: user, isLoading } = useQuery(
    convexQuery(api.app.getCurrentUser, {}),
  );

  if (isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!user?.isPlatformAdmin) {
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

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Platform admin</h1>
        <p className="text-sm text-muted-foreground">
          Quera-level configuration. Distinct from per-gabinet settings.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link to="/admin/email-config" className="block">
          <Card className="h-full transition hover:border-foreground/20">
            <CardHeader>
              <CardTitle>Email configuration</CardTitle>
              <CardDescription>
                From / Reply-to addresses used on platform emails like
                invitations and password resets.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link to="/admin/users" className="block">
          <Card className="h-full transition hover:border-foreground/20">
            <CardHeader>
              <CardTitle>Platform administrators</CardTitle>
              <CardDescription>
                Grant or revoke platform admin role for users. Platform admins
                can access this section.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link to="/admin/errors" className="block">
          <Card className="h-full transition hover:border-foreground/20">
            <CardHeader>
              <CardTitle>Errors</CardTitle>
              <CardDescription>
                Live log of uncaught errors from the Convex backend and the
                frontend. Filter by source, expand stack traces.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  );
}
