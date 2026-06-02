import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pencil, Trash2, Star, Activity, Loader2 } from "@/lib/ez-icons";
import { useOrganization } from "@/components/org-context";
import { formatActionError } from "@/lib/format-action-error";

type ProviderType = "google" | "microsoft" | "mailgun" | "resend";
type ProviderStatus = "active" | "inactive" | "error" | "pending_auth";

interface MailProvider {
  _id: string;
  name: string;
  providerType: ProviderType;
  fromEmail?: string;
  status: ProviderStatus;
  isDefault?: boolean;
  isShared?: boolean;
  capabilities?: {
    canSend: boolean;
    canReceive: boolean;
    canSync: boolean;
  };
}

interface MailProviderCardProps {
  provider: MailProvider;
  onEdit: (provider: MailProvider) => void;
  onSetDefault: (providerId: string) => void;
  onRemove: (providerId: string) => void;
}

const providerTypeColors: Record<ProviderType, string> = {
  google: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  microsoft: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  mailgun: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  resend: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
};

const statusVariant: Record<ProviderStatus, "default" | "destructive" | "secondary" | "outline"> = {
  active: "default",
  inactive: "secondary",
  error: "destructive",
  pending_auth: "outline",
};

export function MailProviderCard({
  provider,
  onEdit,
  onSetDefault,
  onRemove,
}: MailProviderCardProps) {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const testConnection = useAction(api.mailProviders.testConnection);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    try {
      const result = await testConnection({
        organizationId,
        providerId: provider._id as Id<"mailProviders">,
      });
      if (result.success) {
        toast.success(
          t("settings.mail.testSuccess", {
            defaultValue: "Połączenie działa poprawnie",
          }),
          {
            description: result.accountEmail,
          },
        );
      } else {
        toast.error(
          t("settings.mail.testFailed", {
            defaultValue: "Test połączenia nie powiódł się",
          }),
          {
            description: result.error,
          },
        );
      }
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "settings.mail.testFailed",
          defaultValue: "Test połączenia nie powiódł się",
        }),
      );
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <Card>
        <CardContent className="flex items-start justify-between py-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium">{provider.name}</p>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${providerTypeColors[provider.providerType]}`}
              >
                {t(`settings.mail.providerType.${provider.providerType}`)}
              </span>
              {provider.isDefault && (
                <Badge variant="default" className="text-xs">
                  {t("settings.mail.defaultProvider")}
                </Badge>
              )}
              {provider.isShared && (
                <Badge variant="secondary" className="text-xs">
                  {t("settings.mail.sharedProvider")}
                </Badge>
              )}
            </div>
            {provider.fromEmail && (
              <p className="text-xs text-muted-foreground">{provider.fromEmail}</p>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={statusVariant[provider.status]}>
                {t(`settings.mail.status.${provider.status}`)}
              </Badge>
              {provider.capabilities && (
                <div className="flex items-center gap-1">
                  {provider.capabilities.canSend && (
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {t("settings.mail.capabilities.send")}
                    </span>
                  )}
                  {provider.capabilities.canReceive && (
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {t("settings.mail.capabilities.receive")}
                    </span>
                  )}
                  {provider.capabilities.canSync && (
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {t("settings.mail.capabilities.sync")}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title={t("settings.mail.testConnection")}
              onClick={handleTest}
              disabled={testing}
            >
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin" variant="stroke" />
              ) : (
                <Activity className="h-4 w-4" variant="stroke" />
              )}
            </Button>
            {!provider.isDefault && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title={t("settings.mail.defaultProvider")}
                onClick={() => onSetDefault(provider._id)}
              >
                <Star className="h-4 w-4" variant="stroke" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onEdit(provider)}
            >
              <Pencil className="h-4 w-4" variant="stroke" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4" variant="stroke" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("common.actionCannotBeUndone")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onRemove(provider._id);
                setConfirmDelete(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
