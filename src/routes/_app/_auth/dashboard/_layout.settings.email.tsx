import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2 } from "lucide-react";
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

  const handleDelete = async (accountId: string) => {
    if (window.confirm(t("common.confirm"))) {
      await removeAccount({
        organizationId,
        accountId: accountId as Id<"emailAccounts">,
      });
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setFromName("");
    setFromEmail("");
    setIsDefault(false);
  };

  const inputClasses =
    "h-9 w-full rounded-md border bg-transparent px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <PageHeader
        title={t("settings.email")}
        description={t("inbox.description")}
        actions={
          !showForm ? (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t("common.add")}
            </Button>
          ) : undefined
        }
      />

      {/* Create/Edit form */}
      {showForm && (
        <Card>
          <CardContent className="py-4 space-y-4">
            <div className="space-y-1.5">
              <Label>{t("common.name")}</Label>
              <input
                className={inputClasses}
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="John Doe"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.email")}</Label>
              <input
                className={inputClasses}
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
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleDelete(account._id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
