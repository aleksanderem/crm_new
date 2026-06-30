import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import { useOrganization } from "@/components/org-context";
import { useSupabaseOrganizationMembers } from "@/hooks/use-supabase-organizations";
import { useSupabasePendingInvitations } from "@/hooks/use-supabase-invitations";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { SectionHeader } from "@untitled/app/section-headers/section-headers";
import { UntitledAlert } from "@/components/ui/untitled-alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/ui/button";
import {
  UserInvitationForm,
  type UserInvitationFormData,
} from "@/components/forms/user-invitation-form";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { MoreHorizontal, Send, XCircle, UserPlus, AlertTriangle, ArrowUpRight, CircleCheck } from "@/lib/ez-icons";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { useRole } from "@/hooks/use-permission";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/team"
)({
  component: TeamSettings,
});

const ROLES = ["admin", "member", "viewer"] as const;

function TeamSettings() {
  const { t, i18n } = useTranslation();
  const { organizationId } = useOrganization();
  const { role } = useRole();
  const isAdmin = role === "owner" || role === "admin";

  const queryClient = useQueryClient();

  const { data: members } = useSupabaseOrganizationMembers(organizationId);

  const { data: invitations } = useSupabasePendingInvitations(organizationId);

  // Seat usage stays on Convex — involves plan/subscription lookup logic
  const { data: seatUsage } = useQuery(
    // @ts-ignore — TS2589: convexQuery type instantiation too deep, runtime is correct
    convexQuery(api.organizations.getSeatUsage, { organizationId })
  ) as { data: { currentSeats: number; seatLimit: number; canAddMore: boolean } | undefined };

  const seatPercentage = seatUsage
    ? Math.round((seatUsage.currentSeats / seatUsage.seatLimit) * 100)
    : 0;
  const isNearLimit = seatPercentage >= 80 && seatUsage?.canAddMore;
  const isAtLimit = seatUsage ? !seatUsage.canAddMore : false;

  const updateRole = useAction(api.organizations.updateMemberRole);
  const updatePendingRole = useAction(api.invitations.updatePendingRole);
  const removeMember = useAction(api.organizations.removeMember);
  const cancelInvitation = useAction(api.invitations.cancel);
  const resendInvitation = useAction(api.invitations.resend);
  const createInvitation = useAction(api.invitations.create);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [resendingId, setResendingId] = useState<Id<"invitations"> | null>(null);
  const [cancellingId, setCancellingId] = useState<Id<"invitations"> | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ id: Id<"teamMemberships">; name: string } | null>(null);
  const [invitationSentPopup, setInvitationSentPopup] = useState<string | null>(null);

  useEffect(() => {
    if (!invitationSentPopup) return;
    const id = window.setTimeout(() => setInvitationSentPopup(null), 2000);
    return () => window.clearTimeout(id);
  }, [invitationSentPopup]);

  const handleChangeRole = async (
    membershipId: Id<"teamMemberships">,
    role: string
  ) => {
    await updateRole({
      organizationId,
      membershipId,
      role: role as "admin" | "member" | "viewer" | "owner",
    });
    void queryClient.invalidateQueries({ queryKey: supabaseKeys.teamMemberships.list(organizationId) });
  };

  const handleChangePendingRole = async (
    invitationId: Id<"invitations">,
    role: string,
  ) => {
    try {
      await updatePendingRole({
        organizationId,
        invitationId,
        role: role as "admin" | "member" | "viewer",
      });
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.invitations.list(organizationId) });
      toast.success(t("team.invitationRoleUpdated", { defaultValue: "Rola zaproszenia została zmieniona" }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(message);
    }
  };

  const handleRemoveMember = (membershipId: Id<"teamMemberships">, memberName: string) => {
    setRemoveTarget({ id: membershipId, name: memberName });
  };

  const confirmRemoveMember = async () => {
    if (!removeTarget) return;
    await removeMember({ organizationId, membershipId: removeTarget.id });
    void queryClient.invalidateQueries({ queryKey: supabaseKeys.teamMemberships.list(organizationId) });
    setRemoveTarget(null);
  };

  const handleCancelInvitation = async (invitationId: Id<"invitations">) => {
    if (cancellingId) return;
    setCancellingId(invitationId);
    try {
      await cancelInvitation({ organizationId, invitationId });
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.invitations.list(organizationId) });
      toast.success(t("team.invitationCancelled"));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(message);
    } finally {
      setCancellingId(null);
    }
  };

  const handleResendInvitation = async (invitationId: Id<"invitations">) => {
    if (resendingId) return;
    setResendingId(invitationId);
    try {
      await resendInvitation({ organizationId, invitationId });
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.invitations.list(organizationId) });
      toast.success(t("team.invitationResent"));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(message);
    } finally {
      setResendingId(null);
    }
  };

  const navigate = useNavigate();

  const handleSendInvitation = async (data: UserInvitationFormData) => {
    setIsSending(true);
    try {
      await createInvitation({
        organizationId,
        email: data.email,
        role: data.role as "admin" | "member" | "viewer" | "owner",
        module: data.module,
        moduleData: data.moduleData,
      });
      setInviteOpen(false);
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.invitations.list(organizationId) });
      setInvitationSentPopup(t("team.invitationSent"));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes("Seat limit reached")) {
        toast.error(t("settings.team.limitReached"), {
          action: {
            label: t("team.upgrade"),
            onClick: () => navigate({ to: "/dashboard/settings/billing" }),
          },
        });
      } else {
        toast.error(message);
      }
    } finally {
      setIsSending(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(i18n.language, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <SectionHeader.Root className="pt-4">
        <SectionHeader.Group>
          <SectionHeader.Heading className="flex-1">
            {t("team.title")}
          </SectionHeader.Heading>
        </SectionHeader.Group>
        <UntitledAlert>{t("team.description")}</UntitledAlert>
      </SectionHeader.Root>

      {/* Seat usage */}
      {seatUsage && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {t("settings.team.currentUsage")}
            </CardTitle>
            <CardDescription>
              {t("settings.team.usageCount", {
                current: seatUsage.currentSeats,
                limit: seatUsage.seatLimit,
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress
              value={seatPercentage}
              className={`h-2 ${isAtLimit ? "[&>div]:bg-destructive" : isNearLimit ? "[&>div]:bg-amber-500" : ""}`}
            />
            {isNearLimit && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" variant="stroke" />
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  {t("settings.team.nearLimitWarning")}
                </p>
              </div>
            )}
            {isAtLimit && (
              <div className="flex items-start justify-between gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                <p className="text-sm text-destructive">
                  {t("settings.team.limitReached")}
                </p>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/dashboard/settings/billing">
                    {t("team.upgrade")}
                    <ArrowUpRight className="ml-1 h-4 w-4" variant="stroke" />
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Members section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("team.members")}
            {members && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {t("team.memberCount", { count: members.length })}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {members?.map((member) => {
            const isOwner = member.role === "owner";
            const name = member.user?.name ?? member.user?.email ?? "Unknown";
            const initials = name[0].toUpperCase();

            return (
              <div
                key={member._id}
                className="flex items-center justify-between rounded-md px-2 py-2.5 hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    {member.user?.image && (
                      <AvatarImage src={member.user.image} alt={name} />
                    )}
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{name}</p>
                    {member.user?.email && (
                      <p className="text-xs text-muted-foreground">
                        {member.user.email}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="capitalize">
                    {t(`team.roles.${member.role}`)}
                  </Badge>
                  {member.joinedAt && (
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {t("team.joinedDate")} {formatDate(member.joinedAt)}
                    </span>
                  )}
                  {!isOwner && isAdmin && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" variant="stroke" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            {t("team.changeRole")}
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            {ROLES.map((role) => (
                              <DropdownMenuItem
                                key={role}
                                onClick={() =>
                                  handleChangeRole(
                                    member._id as Id<"teamMemberships">,
                                    role
                                  )
                                }
                                disabled={member.role === role}
                              >
                                <span className="capitalize">
                                  {t(`team.roles.${role}`)}
                                </span>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() =>
                            handleRemoveMember(
                              member._id as Id<"teamMemberships">,
                              name
                            )
                          }
                        >
                          {t("team.removeMember")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            );
          })}
          {(!members || members.length === 0) && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t("team.noMembers")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Pending invitations section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("team.invitations")}</CardTitle>
          {isAdmin && (
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
              <DialogTrigger asChild>
                <Button size="sm" disabled={isAtLimit}>
                  <UserPlus className="mr-2 h-4 w-4" variant="stroke" />
                  {t("team.inviteMember")}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{t("team.inviteDialog.title")}</DialogTitle>
                  <DialogDescription>
                    {t("team.inviteDialog.description")}
                  </DialogDescription>
                </DialogHeader>
                <UserInvitationForm
                  onSubmit={handleSendInvitation}
                  onCancel={() => setInviteOpen(false)}
                  isSubmitting={isSending}
                />
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent className="space-y-1">
          {invitations && invitations.length > 0 ? (
            invitations.map((invitation) => (
              <div
                key={invitation._id}
                className="flex items-center justify-between rounded-md px-2 py-2.5 hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      {invitation.email[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{invitation.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {invitation.invitedBy && (() => {
                        const inviter = members?.find((m) => m.userId === invitation.invitedBy);
                        const inviterName = inviter?.user?.name ?? null;
                        return inviterName ? (
                          <span>
                            {t("team.invitedBy")} {inviterName}
                            {" \u00B7 "}
                          </span>
                        ) : null;
                      })()}
                      {t("team.sentDate")} {formatDate(invitation.createdAt)}
                    </p>
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex items-center gap-2">
                    <Select
                      value={invitation.role}
                      onValueChange={(role) =>
                        handleChangePendingRole(
                          invitation._id as Id<"invitations">,
                          role,
                        )
                      }
                      disabled={resendingId === invitation._id || cancellingId === invitation._id}
                    >
                      <SelectTrigger className="h-8 w-32 capitalize">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((role) => (
                          <SelectItem key={role} value={role} className="capitalize">
                            {t(`team.roles.${role}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      disabled={resendingId === invitation._id || cancellingId === invitation._id}
                      onClick={() =>
                        handleResendInvitation(
                          invitation._id as Id<"invitations">
                        )
                      }
                    >
                      <Send className="mr-1 h-4 w-4" variant="stroke" />
                      {resendingId === invitation._id
                        ? t("team.inviteDialog.sending")
                        : t("team.resendInvitation")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-destructive hover:text-destructive"
                      disabled={resendingId === invitation._id || cancellingId === invitation._id}
                      onClick={() =>
                        handleCancelInvitation(
                          invitation._id as Id<"invitations">
                        )
                      }
                    >
                      <XCircle className="mr-1 h-4 w-4" variant="stroke" />
                      {t("team.cancelInvitation")}
                    </Button>
                  </div>
                )}
              </div>
            ))
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t("team.noInvitations")}
            </p>
          )}
        </CardContent>
      </Card>

      {invitationSentPopup && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center"
        >
          <div className="pointer-events-auto flex items-center gap-3 rounded-lg border bg-background px-6 py-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <CircleCheck className="h-5 w-5 text-green-600" variant="stroke" />
            <span className="text-sm font-medium">{invitationSentPopup}</span>
          </div>
        </div>
      )}

      <AlertDialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("common.confirmDeleteDescription", { name: removeTarget?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemoveMember}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
