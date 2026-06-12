import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useSupabaseLostReasonsList } from "@/hooks/use-supabase-lost-reasons";
import { useSupabaseOrgSettings } from "@/hooks/use-supabase-organizations";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { SectionHeader } from "@untitled/app/section-headers/section-headers";
import { UntitledAlert } from "@/components/ui/untitled-alert";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2 } from "@/lib/ez-icons";
import { Id } from "@cvx/_generated/dataModel";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/lost-reasons"
)({
  component: LostReasonsSettings,
});

function LostReasonsSettings() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);

  const createReason = useAction(api.lostReasons.create);
  const updateReason = useAction(api.lostReasons.update);
  const removeReason = useAction(api.lostReasons.remove);
  const upsertSettings = useAction(api.orgSettings.upsert);

  const { data: reasons } = useSupabaseLostReasonsList(organizationId);

  const { data: orgSettings } = useSupabaseOrgSettings(organizationId);

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
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.lostReasons.list(organizationId) });
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "lostReasons.errors.createFailed",
          defaultValue: "Nie udało się dodać powodu utraty.",
        }),
      );
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
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.lostReasons.list(organizationId) });
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "lostReasons.errors.updateFailed",
          defaultValue: "Nie udało się zapisać powodu utraty.",
        }),
      );
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
    void queryClient.invalidateQueries({ queryKey: supabaseKeys.lostReasons.list(organizationId) });
  };

  const handleDelete = (reason: { _id: string; label: string }) => {
    setDeleteTarget({ id: reason._id, label: reason.label });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await removeReason({
      organizationId,
      reasonId: deleteTarget.id as Id<"lostReasons">,
    });
    setDeleteTarget(null);
    void queryClient.invalidateQueries({ queryKey: supabaseKeys.lostReasons.list(organizationId) });
  };

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <SectionHeader.Root className="pt-4">
        <SectionHeader.Group>
          <SectionHeader.Heading className="flex-1">
            {t('lostReasons.title')}
          </SectionHeader.Heading>
          <SectionHeader.Actions>
            <Button onClick={() => setShowCreateForm(true)}>
              <Plus className="mr-2 h-4 w-4" variant="stroke" />
              {t('lostReasons.addReason')}
            </Button>
          </SectionHeader.Actions>
        </SectionHeader.Group>
        <UntitledAlert>{t('lostReasons.description')}</UntitledAlert>
      </SectionHeader.Root>

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
                    <Pencil className="h-4 w-4" variant="stroke" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleDelete(reason)}
                  >
                    <Trash2 className="h-4 w-4" variant="stroke" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("common.confirmDeleteDescription", { name: deleteTarget?.label })}
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
