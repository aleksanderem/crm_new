import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { SectionHeader } from "@/components/application/section-headers/section-headers";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2 } from "@/lib/ez-icons";
import { Id } from "@cvx/_generated/dataModel";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/email"
)({
  component: EmailSettings,
});

function EmailSettings() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();

  const [showForm, setShowForm] = useState(false);
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const upsertAccount = useMutation(api.emailAccounts.upsert);
  const removeAccount = useMutation(api.emailAccounts.remove);

  const { data: accounts } = useQuery(
    convexQuery(api.emailAccounts.list, { organizationId })
  );

  const handleSave = async () => {
    if (!fromName.trim() || !fromEmail.trim()) return;
    setIsSubmitting(true);
    try {
      await upsertAccount({
        organizationId,
        fromName: fromName.trim(),
        fromEmail: fromEmail.trim(),
        isDefault,
      });
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (account: {
    fromName: string;
    fromEmail: string;
    isDefault?: boolean;
  }) => {
    setFromName(account.fromName);
    setFromEmail(account.fromEmail);
    setIsDefault(account.isDefault ?? false);
    setShowForm(true);
  };

  const handleDelete = (account: { _id: string; fromEmail: string }) => {
    setDeleteTarget({ id: account._id, name: account.fromEmail });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await removeAccount({
      organizationId,
      accountId: deleteTarget.id as Id<"emailAccounts">,
    });
    setDeleteTarget(null);
  };

  const resetForm = () => {
    setShowForm(false);
    setFromName("");
    setFromEmail("");
    setIsDefault(false);
  };

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <SectionHeader.Root className="pt-4">
        <SectionHeader.Group>
          <SectionHeader.Heading className="flex-1">
            {t("settings.email")}
          </SectionHeader.Heading>
          {!showForm && (
            <SectionHeader.Actions>
              <Button onClick={() => setShowForm(true)}>
                <Plus className="mr-2 h-4 w-4" variant="stroke" />
                {t("common.add")}
              </Button>
            </SectionHeader.Actions>
          )}
        </SectionHeader.Group>
        <Alert>
                  <AlertDescription>{t("inbox.description")}</AlertDescription>
                </Alert>
      </SectionHeader.Root>

      {/* Create/Edit form */}
      {showForm && (
        <Card>
          <CardContent className="py-4 space-y-4">
            <div className="space-y-1.5">
              <Label>{t("common.name")}</Label>
              <Input
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="John Doe"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.email")}</Label>
              <Input
                type="email"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                placeholder="john@company.com"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={isDefault}
                onCheckedChange={setIsDefault}
              />
              <Label>Default account</Label>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleSave}
                disabled={
                  !fromName.trim() || !fromEmail.trim() || isSubmitting
                }
              >
                {isSubmitting ? t("common.saving") : t("common.save")}
              </Button>
              <Button variant="outline" onClick={resetForm}>
                {t("common.cancel")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Accounts list */}
      <div className="space-y-2">
        {(!accounts || accounts.length === 0) && !showForm && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("inbox.empty")}
          </p>
        )}
        {accounts?.map((account) => (
          <Card key={account._id}>
            <CardContent className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium">{account.fromName}</p>
                <p className="text-xs text-muted-foreground">
                  {account.fromEmail}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {account.isDefault && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    Default
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleEdit(account)}
                >
                  <Pencil className="h-4 w-4" variant="stroke" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleDelete(account)}
                >
                  <Trash2 className="h-4 w-4" variant="stroke" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("common.confirmDeleteDescription", { name: deleteTarget?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
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
