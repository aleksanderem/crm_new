import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { useMutation } from "@tanstack/react-query";
import { api } from "@cvx/_generated/api";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_app/_auth/admin/email-config")({
  component: AdminEmailConfig,
});

function AdminEmailConfig() {
  const { data: user, isLoading: userLoading } = useQuery(
    convexQuery(api.app.getCurrentUser, {}),
  );
  const { data: settings, isLoading: settingsLoading } = useQuery(
    convexQuery(api.platformSettings.get, {}),
  );

  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [replyTo, setReplyTo] = useState("");

  // Sync local form state when settings load / change
  useEffect(() => {
    if (settings) {
      setFromName(settings.invitationFromName ?? "");
      setFromEmail(settings.invitationFromEmail ?? "");
      setReplyTo(settings.invitationReplyToEmail ?? "");
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: useConvexMutation(api.platformSettings.set),
    onSuccess: () => {
      toast.success("Platform email settings saved");
    },
    onError: (e: Error) => {
      toast.error(e.message || "Failed to save settings");
    },
  });

  if (userLoading) {
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

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({
      invitationFromName: fromName.trim() || undefined,
      invitationFromEmail: fromEmail.trim() || undefined,
      invitationReplyToEmail: replyTo.trim() || undefined,
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Platform admin · Email</h1>
        <p className="text-sm text-muted-foreground">
          Global email configuration used by platform-level messages (invitations,
          password resets) — separate from per-gabinet mail providers.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invitation email</CardTitle>
          <CardDescription>
            From and reply-to addresses on team-invite emails. Leave blank to fall
            back to the <code>AUTH_EMAIL</code> environment value.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fromName">From name</Label>
              <Input
                id="fromName"
                placeholder="Quera"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                disabled={settingsLoading || saveMutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fromEmail">From email</Label>
              <Input
                id="fromEmail"
                type="email"
                placeholder="noreply@quera.helloalex.pl"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                disabled={settingsLoading || saveMutation.isPending}
              />
              <p className="text-xs text-muted-foreground">
                Both name and email must be set together for the override to
                apply.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="replyTo">Reply-to (optional)</Label>
              <Input
                id="replyTo"
                type="email"
                placeholder="support@quera.helloalex.pl"
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
                disabled={settingsLoading || saveMutation.isPending}
              />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : "Save"}
              </Button>
              {settings?.updatedAt && (
                <span className="text-xs text-muted-foreground">
                  Last updated {new Date(settings.updatedAt).toLocaleString()}
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
