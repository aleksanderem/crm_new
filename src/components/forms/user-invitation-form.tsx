import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Users } from "@/lib/ez-icons";

type OrgRole = "owner" | "admin" | "member";

const ROLES: { value: OrgRole; labelKey: string }[] = [
  { value: "admin", labelKey: "settings.team.roles.admin" },
  { value: "member", labelKey: "settings.team.roles.member" },
];

export interface UserInvitationFormData {
  email: string;
  role: OrgRole;
}

interface UserInvitationFormProps {
  onSubmit: (data: UserInvitationFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function UserInvitationForm({
  onSubmit,
  onCancel,
  isSubmitting = false,
}: UserInvitationFormProps) {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();

  const { data: members } = useQuery(
    convexQuery(api.organizations.getMembers, { organizationId })
  );

  const { data: pendingInvitations } = useQuery(
    convexQuery(api.invitations.listPending, { organizationId })
  );

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("member");
  const [emailError, setEmailError] = useState<string | null>(null);

  const memberCount = members?.length ?? 0;
  const pendingCount = pendingInvitations?.length ?? 0;
  const totalUsers = memberCount + pendingCount;

  // TODO: Get actual seat limit from subscription
  // For now, show a warning if approaching typical limits
  const SEAT_LIMIT = 10; // Placeholder - should come from subscription
  const isNearLimit = totalUsers >= SEAT_LIMIT - 2;
  const isAtLimit = totalUsers >= SEAT_LIMIT;

  const validateEmail = (value: string): boolean => {
    if (!value.trim()) {
      setEmailError(t("settings.team.emailRequired"));
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      setEmailError(t("settings.team.emailInvalid"));
      return false;
    }
    setEmailError(null);
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(email)) return;
    if (isAtLimit) return;

    onSubmit({
      email: email.trim().toLowerCase(),
      role,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Usage info */}
      <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
        <Users className="h-5 w-5 text-muted-foreground" />
        <div className="flex-1">
          <p className="text-sm font-medium">
            {t("settings.team.currentUsage")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("settings.team.usageCount", { current: totalUsers, limit: SEAT_LIMIT })}
            {pendingCount > 0 && (
              <span className="ml-1">
                ({pendingCount} {t("settings.team.pendingInvites")})
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Near limit warning */}
      {isNearLimit && !isAtLimit && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
          <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-400" />
          <p className="text-sm text-amber-800 dark:text-amber-200">
            {t("settings.team.nearLimitWarning")}
          </p>
        </div>
      )}

      {/* At limit error */}
      {isAtLimit && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
          <p className="text-sm text-destructive">
            {t("settings.team.limitReached")}
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>
          {t("settings.team.email")} <span className="text-destructive">*</span>
        </Label>
        <Input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (emailError) validateEmail(e.target.value);
          }}
          placeholder={t("settings.team.emailPlaceholder")}
          disabled={isAtLimit}
          required
        />
        {emailError && (
          <p className="text-xs text-destructive">{emailError}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>
          {t("settings.team.role")} <span className="text-destructive">*</span>
        </Label>
        <Select
          value={role}
          onValueChange={(v) => setRole(v as OrgRole)}
          disabled={isAtLimit}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {t(r.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {t("settings.team.roleHint")}
        </p>
      </div>

      <div className="rounded-lg border bg-muted/30 p-3">
        <p className="text-sm text-muted-foreground">
          {t("settings.team.invitationInfo")}
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button
          type="submit"
          disabled={!email.trim() || isAtLimit || isSubmitting}
        >
          {isSubmitting ? t("common.saving") : t("settings.team.sendInvite")}
        </Button>
      </div>
    </form>
  );
}
