import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Share2, X, Mail } from "@/lib/ez-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Id } from "@cvx/_generated/dataModel";

interface ShareDialogProps {
  resourceType: string;
  resourceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareDialog({
  resourceType,
  resourceId,
  open,
  onOpenChange,
}: ShareDialogProps) {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const [email, setEmail] = useState("");
  const [accessLevel, setAccessLevel] = useState<"viewer" | "editor">("viewer");
  const [isSending, setIsSending] = useState(false);

  const { data: sharingEnabled } = useQuery({
    ...convexQuery(api.permissions.getResourceSharingEnabled, {
      organizationId,
    }),
    enabled: open && !!organizationId,
  });

  const { data: invites } = useQuery({
    ...convexQuery(api.resourceInvites.listByResource, {
      organizationId,
      resourceType,
      resourceId,
    }),
    enabled: open && !!organizationId,
  });

  const createInvite = useMutation(api.resourceInvites.create);
  const revokeInvite = useMutation(api.resourceInvites.revoke);

  const handleSendInvite = async () => {
    if (!email.trim()) return;
    setIsSending(true);
    try {
      await createInvite({
        organizationId,
        email: email.trim(),
        resourceType,
        resourceId,
        accessLevel,
      });
      toast.success(
        t("share.inviteSent", "Invite sent to {{email}}", { email: email.trim() })
      );
      setEmail("");
      setAccessLevel("viewer");
    } catch (error) {
      toast.error(
        t("share.inviteError", "Failed to send invite")
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleRevoke = async (inviteId: Id<"resourceInvites">) => {
    try {
      await revokeInvite({ organizationId, inviteId });
      toast.success(t("share.inviteRevoked", "Invite revoked"));
    } catch {
      toast.error(t("share.revokeError", "Failed to revoke invite"));
    }
  };

  const statusVariant = (status: string) => {
    switch (status) {
      case "accepted":
        return "default" as const;
      case "pending":
        return "secondary" as const;
      case "revoked":
      case "expired":
        return "destructive" as const;
      default:
        return "outline" as const;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4" />
            {t("share.title", "Share")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "share.description",
              "Invite people to collaborate on this resource."
            )}
          </DialogDescription>
        </DialogHeader>

        {sharingEnabled === false ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            {t(
              "share.disabled",
              "Resource sharing is not enabled for this organization. Contact your administrator."
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Invite form */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder={t("share.emailPlaceholder", "Email address")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSendInvite();
                  }}
                />
              </div>
              <Select
                value={accessLevel}
                onValueChange={(v) => setAccessLevel(v as "viewer" | "editor")}
              >
                <SelectTrigger className="w-28" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">
                    {t("share.viewer", "Viewer")}
                  </SelectItem>
                  <SelectItem value="editor">
                    {t("share.editor", "Editor")}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={handleSendInvite}
                disabled={!email.trim() || isSending}
              >
                {t("share.sendInvite", "Invite")}
              </Button>
            </div>

            {/* Existing invites */}
            {invites && invites.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("share.currentInvites", "Current invites")}
                </p>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {invites.map((invite) => (
                    <div
                      key={invite._id}
                      className="flex items-center justify-between rounded-md border px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{invite.email}</p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className="text-[10px] capitalize"
                          >
                            {invite.accessLevel}
                          </Badge>
                          <Badge
                            variant={statusVariant(invite.status)}
                            className="text-[10px] capitalize"
                          >
                            {invite.status}
                          </Badge>
                        </div>
                      </div>
                      {invite.status !== "revoked" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => handleRevoke(invite._id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
