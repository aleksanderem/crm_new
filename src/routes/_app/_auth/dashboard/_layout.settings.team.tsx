import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { MoreHorizontal, Send, XCircle, UserPlus, AlertTriangle, ArrowUpRight } from "@/lib/ez-icons";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/team"
)({
  component: TeamSettings,
});

const ROLES = ["admin", "member", "viewer"] as const;

function TeamSettings() {
  const { t, i18n } = useTranslation();
  const { organizationId } = useOrganization();

  const { data: members } = useQuery(
    convexQuery(api.organizations.getMembers, { organizationId })
  );

  const { data: invitations } = useQuery(
    convexQuery(api.invitations.listPending, { organizationId })
  );

  const { data: seatUsage } = useQuery(
    convexQuery(api.organizations.getSeatUsage, { organizationId })
  );

  const seatPercentage = seatUsage
    ? Math.round((seatUsage.currentSeats / seatUsage.seatLimit) * 100)
    : 0;
  const isNearLimit = seatPercentage >= 80 && seatUsage?.canAddMore;
  const isAtLimit = seatUsage ? !seatUsage.canAddMore : false;

  const updateRole = useMutation(api.organizations.updateMemberRole);
  const removeMember = useMutation(api.organizations.removeMember);
  const cancelInvitation = useMutation(api.invitations.cancel);
  const resendInvitation = useMutation(api.invitations.resend);
  const createInvitation = useMutation(api.invitations.create);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("member");
  const [isSending, setIsSending] = useState(false);

  const handleChangeRole = async (
    membershipId: Id<"teamMemberships">,
    role: string
  ) => {
    await updateRole({
      organizationId,
      membershipId,
      role: role as "admin" | "member" | "viewer" | "owner",
    });
  };

  const handleRemoveMember = async (membershipId: Id<"teamMemberships">) => {
    if (window.confirm(t("team.confirmRemove"))) {
      await removeMember({ organizationId, membershipId });
    }
  };

  const handleCancelInvitation = async (invitationId: Id<"invitations">) => {
    await cancelInvitation({ organizationId, invitationId });
  };

  const handleResendInvitation = async (invitationId: Id<"invitations">) => {
    await resendInvitation({ organizationId, invitationId });
  };

  const navigate = useNavigate();

  const handleSendInvitation = async () => {
    if (!inviteEmail.trim()) return;
    setIsSending(true);
    try {
      await createInvitation({
        organizationId,
        email: inviteEmail.trim(),
        role: inviteRole as "admin" | "member" | "viewer" | "owner",
      });
      setInviteEmail("");
      setInviteRole("member");
      setInviteOpen(false);
      toast.success(t("team.invitationSent"));
    } catch (e: unknown) {
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
      <PageHeader
        title={t("team.title")}
        description={t("team.description")}
      />

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
                  {!isOwner && (
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
                              member._id as Id<"teamMemberships">
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
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button size="sm" disabled={isAtLimit}>
                <UserPlus className="mr-2 h-4 w-4" variant="stroke" />
                {t("team.inviteMember")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("team.inviteDialog.title")}</DialogTitle>
                <DialogDescription>
                  {t("team.inviteDialog.description")}
                </DialogDescription>
              </DialogHeader>
              {seatUsage && (
                <p className="text-xs text-muted-foreground">
                  {t("team.remainingSeats", {
                    count: Math.max(0, seatUsage.seatLimit - seatUsage.currentSeats),
                  })}
                </p>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendInvitation();
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label>{t("team.inviteDialog.email")}</Label>
                  <Input
                    type="email"
                    placeholder={t("team.inviteDialog.emailPlaceholder")}
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("team.inviteDialog.role")}</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          <span className="capitalize">
                            {t(`team.roles.${role}`)}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={!inviteEmail.trim() || isSending}>
                    <Send className="mr-2 h-4 w-4" variant="stroke" />
                    {isSending
                      ? t("team.inviteDialog.sending")
                      : t("team.inviteDialog.send")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
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
                      {invitation.inviterName && (
                        <span>
                          {t("team.invitedBy")} {invitation.inviterName}
                          {" \u00B7 "}
                        </span>
                      )}
                      {t("team.sentDate")} {formatDate(invitation.createdAt)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="capitalize">
                    {t(`team.roles.${invitation.role}`)}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() =>
                      handleResendInvitation(
                        invitation._id as Id<"invitations">
                      )
                    }
                  >
                    <Send className="mr-1 h-4 w-4" variant="stroke" />
                    {t("team.resendInvitation")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-destructive hover:text-destructive"
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
              </div>
            ))
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t("team.noInvitations")}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
