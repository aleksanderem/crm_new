import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { useAction } from "convex/react";
import { convexQuery, useConvexAuth } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { Users, AlertCircle, CheckCircle2, XCircle } from "@/lib/ez-icons";

export const Route = createFileRoute("/_app/invite/$token")({
  component: InviteAcceptPage,
});

function InviteAcceptPage() {
  const { t } = useTranslation();
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();

  const { data: inviteData, isLoading: inviteLoading } = useQuery(
    convexQuery(api.invitations.getByToken, { token })
  );

  const { data: currentUser } = useQuery({
    ...convexQuery(api.app.getCurrentUser, {}),
    enabled: isAuthenticated,
  });

  const queryClient = useQueryClient();
  const acceptInvitation = useAction(api.invitations.accept);
  const declineInvitation = useAction(api.invitations.decline);

  const [isAccepting, setIsAccepting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const [result, setResult] = useState<"accepted" | "declined" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const isLoading = authLoading || inviteLoading;

  const handleAccept = async () => {
    setIsAccepting(true);
    setActionError(null);
    try {
      const organizationId = await acceptInvitation({ token });
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.teamMemberships.list(organizationId) });
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetEmployees.list(organizationId) });
      setResult("accepted");
      setTimeout(() => {
        navigate({ to: "/dashboard" });
      }, 1500);
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : t("invite.acceptError", { defaultValue: "Coś poszło nie tak. Spróbuj ponownie." })
      );
      setIsAccepting(false);
    }
  };

  const handleDecline = async () => {
    setIsDeclining(true);
    setActionError(null);
    try {
      await declineInvitation({ token });
      setResult("declined");
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : t("invite.declineError", { defaultValue: "Coś poszło nie tak. Spróbuj ponownie." })
      );
      setIsDeclining(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-4 pt-6">
            <Skeleton className="mx-auto h-12 w-12 rounded-full" />
            <Skeleton className="mx-auto h-6 w-48" />
            <Skeleton className="mx-auto h-4 w-64" />
            <Skeleton className="mx-auto h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Invitation not found
  if (!inviteData) {
    return (
      <CenteredCard>
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground" />
          <p className="text-lg font-medium">{t("invite.notFound")}</p>
        </div>
      </CenteredCard>
    );
  }

  const { invitation, orgName, inviterName } = inviteData;

  // Expired or already used
  if (
    invitation.status !== "pending" ||
    invitation.expiresAt < Date.now()
  ) {
    const message =
      invitation.status !== "pending"
        ? t("invite.alreadyUsed")
        : t("invite.expired");
    return (
      <CenteredCard>
        <div className="flex flex-col items-center gap-3 text-center">
          <XCircle className="h-12 w-12 text-muted-foreground" />
          <p className="text-lg font-medium">{message}</p>
        </div>
      </CenteredCard>
    );
  }

  // Not logged in — redirect to /login with the invite context so we can
  // pre-fill email, skip the choose-method screen, and come back here after
  // OTP verification (which transparently creates a new account if needed).
  if (!isAuthenticated) {
    return (
      <CenteredCard>
        <div className="flex flex-col items-center gap-4 text-center">
          <Users className="h-12 w-12 text-primary" />
          <div className="space-y-1">
            <p className="text-lg font-medium">
              {t("invite.joinOrgTitle", { defaultValue: "Dołącz do {{orgName}}", orgName: orgName ?? "" })}
            </p>
            <p className="text-sm text-muted-foreground">
              {inviterName
                ? t("invite.invitedBy", {
                    defaultValue: "Zaproszenie od {{inviterName}}",
                    inviterName,
                  })
                : t("invite.youHaveBeenInvited", { defaultValue: "Zostałeś zaproszony" })}
            </p>
            <p className="text-xs text-muted-foreground pt-2">
              {t("invite.continueHint", {
                defaultValue:
                  "Wyślemy jednorazowy kod na {{email}}. Jeśli nie masz jeszcze konta, utworzymy je automatycznie.",
                email: invitation.email,
              })}
            </p>
          </div>
          <Button asChild className="w-full">
            <Link
              to="/login"
              search={{ inviteToken: token, email: invitation.email }}
            >
              {t("invite.continueButton", { defaultValue: "Kontynuuj" })}
            </Link>
          </Button>
        </div>
      </CenteredCard>
    );
  }

  // Email mismatch
  if (currentUser && currentUser.email !== invitation.email) {
    return (
      <CenteredCard>
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <p className="text-lg font-medium">{t("invite.emailMismatch")}</p>
        </div>
      </CenteredCard>
    );
  }

  // Accepted state
  if (result === "accepted") {
    return (
      <CenteredCard>
        <div className="flex flex-col items-center gap-3 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-500" />
          <p className="text-lg font-medium">
            {t("invite.accepted", { orgName: orgName ?? "" })}
          </p>
        </div>
      </CenteredCard>
    );
  }

  // Declined state
  if (result === "declined") {
    return (
      <CenteredCard>
        <div className="flex flex-col items-center gap-3 text-center">
          <XCircle className="h-12 w-12 text-muted-foreground" />
          <p className="text-lg font-medium">{t("invite.declined")}</p>
        </div>
      </CenteredCard>
    );
  }

  // Ready to accept/decline
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl">{t("invite.title")}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("invite.description", { orgName: orgName ?? "" })}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 rounded-lg border p-4">
            {inviterName && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {t("invite.invitedBy", { name: inviterName })}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t("invite.role", { role: "" })}
              </span>
              <Badge variant="outline" className="capitalize">
                {invitation.role}
              </Badge>
            </div>
          </div>

          {actionError && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleDecline}
              disabled={isDeclining || isAccepting}
            >
              {t("invite.decline")}
            </Button>
            <Button
              className="flex-1"
              onClick={handleAccept}
              disabled={isAccepting || isDeclining}
            >
              {isAccepting ? t("invite.accepting") : t("invite.accept")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">{children}</CardContent>
      </Card>
    </div>
  );
}
