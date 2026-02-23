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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2 } from "@/lib/ez-icons";
import { Id } from "@cvx/_generated/dataModel";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/lost-reasons"
)({
  component: LostReasonsSettings,
});

function LostReasonsSettings() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createReason = useMutation(api.lostReasons.create);
  const updateReason = useMutation(api.lostReasons.update);
  const removeReason = useMutation(api.lostReasons.remove);
  const upsertSettings = useMutation(api.orgSettings.upsert);

  const { data: reasons } = useQuery(
    convexQuery(api.lostReasons.list, { organizationId })
  );

  const { data: orgSettings } = useQuery(
    convexQuery(api.orgSettings.get, { organizationId })
  );

  const sortedReasons = reasons
    ? [...reasons].sort((a, b) => a.order - b.order)
    : [];

  const handleCreate = async () => {
    if (!newLabel.trim()) return;
    setIsSubmitting(true);
    try {
      await createReason({ organizationId, label: newLabel.trim() });
      setNewLabel("");
      setShowCreateForm(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (reasonId: string) => {
    if (!editLabel.trim()) return;
    setIsSubmitting(true);
    try {
      await updateReason({
        organizationId,
        reasonId: reasonId as Id<"lostReasons">,
        label: editLabel.trim(),
      });
      setEditingId(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (reasonId: string, isActive: boolean) => {
    await updateReason({
      organizationId,
      reasonId: reasonId as Id<"lostReasons">,
      isActive,
    });
  };

  const handleDelete = async (reasonId: string) => {
    if (window.confirm(t('lostReasons.confirmDelete'))) {
      await removeReason({
        organizationId,
        reasonId: reasonId as Id<"lostReasons">,
      });
    }
  };

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <PageHeader
        title={t('lostReasons.title')}
        description={t('lostReasons.description')}
        actions={
          <Button onClick={() => setShowCreateForm(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t('lostReasons.addReason')}
          </Button>
        }
      />

      {/* Org-level toggles */}
      <Card>
        <CardContent className="flex flex-col gap-4 py-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="lostReasonRequired" className="text-sm">
              {t('lostReasons.reasonRequired')}
            </Label>
            <Switch
              id="lostReasonRequired"
              checked={orgSettings?.lostReasonRequired ?? false}
              onCheckedChange={(checked) =>
                upsertSettings({ organizationId, lostReasonRequired: checked })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="allowCustomLostReason" className="text-sm">
              {t('lostReasons.allowCustom')}
            </Label>
            <Switch
              id="allowCustomLostReason"
              checked={orgSettings?.allowCustomLostReason ?? false}
              onCheckedChange={(checked) =>
                upsertSettings({ organizationId, allowCustomLostReason: checked })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Create form */}
      {showCreateForm && (
        <Card>
          <CardContent className="py-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreate();
              }}
              className="flex items-center gap-2"
            >
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder={t('lostReasons.title')}
                autoFocus
                required
              />
              <Button type="submit" size="sm" disabled={!newLabel.trim() || isSubmitting}>
                {isSubmitting ? t('common.saving') : t('common.create')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowCreateForm(false);
                  setNewLabel("");
                }}
              >
                {t('common.cancel')}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Reasons list */}
      <div className="space-y-2">
        {sortedReasons.length === 0 && !showCreateForm && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t('lostReasons.emptyReasons')}
          </p>
        )}
        {sortedReasons.map((reason) => {
          if (editingId === reason._id) {
            return (
              <Card key={reason._id}>
                <CardContent className="py-3">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleUpdate(reason._id);
                    }}
                    className="flex items-center gap-2"
                  >
                    <Input
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      autoFocus
                      required
                    />
                    <Button type="submit" size="sm" disabled={!editLabel.trim() || isSubmitting}>
                      {isSubmitting ? t('common.saving') : t('common.save')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingId(null)}
                    >
                      {t('common.cancel')}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            );
          }

          return (
            <Card key={reason._id}>
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <p className="text-sm font-medium">{reason.label}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={reason.isActive}
                    onCheckedChange={(checked) =>
                      handleToggleActive(reason._id, checked)
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      setEditingId(reason._id);
                      setEditLabel(reason.label);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleDelete(reason._id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
