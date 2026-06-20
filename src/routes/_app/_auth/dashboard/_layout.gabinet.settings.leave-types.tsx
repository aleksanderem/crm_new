import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useSupabaseGabinetLeaveTypesList } from "@/hooks/use-supabase-gabinet-leave-types";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { SectionHeader } from "@untitled/app/section-headers/section-headers";
import { UntitledAlert } from "@/components/ui/untitled-alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil } from "@/lib/ez-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Id } from "@cvx/_generated/dataModel";
import { formatActionError } from "@/lib/format-action-error";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/settings/leave-types"
)({
  component: LeaveTypesSettings,
});

function LeaveTypesSettings() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const createLeaveType = useAction(api.gabinet.leaveTypes.create);
  const updateLeaveType = useAction(api.gabinet.leaveTypes.update);
  const removeLeaveType = useAction(api.gabinet.leaveTypes.remove);
  const initAllBalances = useAction(api.gabinet.leaveTypes.initializeAllBalances);

  const queryClient = useQueryClient();

  const { data: leaveTypes } = useSupabaseGabinetLeaveTypesList(organizationId);

  const editing = editingId ? leaveTypes?.find((lt) => lt._id === editingId) : null;
  const currentYear = new Date().getFullYear();

  const handleInitBalances = async () => {
    try {
      const result = await initAllBalances({ organizationId, year: currentYear });
      toast.success(t("gabinet.leaveTypes.balancesInitialized", { count: result.created }));
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.leaveTypes.errors.initBalancesFailed",
          defaultValue: "Nie udało się zainicjalizować sald urlopowych.",
        }),
      );
    }
  };

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <SectionHeader.Root className="pt-4">
        <SectionHeader.Group>
          <SectionHeader.Heading className="flex-1">
            {t("gabinet.leaveTypes.title")}
          </SectionHeader.Heading>
          <SectionHeader.Actions>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleInitBalances}>
                {t("gabinet.leaveTypes.initBalances", { year: currentYear })}
              </Button>
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="mr-2 h-4 w-4" variant="stroke" />
                {t("gabinet.leaveTypes.add")}
              </Button>
            </div>
          </SectionHeader.Actions>
        </SectionHeader.Group>
        <UntitledAlert>{t("gabinet.leaveTypes.description")}</UntitledAlert>
      </SectionHeader.Root>

      {!leaveTypes?.length && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {t("gabinet.leaveTypes.empty")}
        </div>
      )}

      <div className="space-y-2">
        {leaveTypes?.map((lt) => (
          <Card key={lt._id} className={!lt.isActive ? "opacity-50" : ""}>
            <CardContent className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                {lt.color && (
                  <span
                    className="h-4 w-4 rounded-full shrink-0"
                    style={{ backgroundColor: lt.color }}
                  />
                )}
                <div>
                  <p className="text-sm font-medium">{lt.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {lt.annualQuotaDays != null
                      ? t("gabinet.leaveTypes.quotaDays", { count: lt.annualQuotaDays })
                      : t("gabinet.leaveTypes.unlimited")}
                    {" · "}
                    {lt.isPaid ? t("gabinet.leaveTypes.paid") : t("gabinet.leaveTypes.unpaid")}
                  </p>
                </div>
                {lt.requiresApproval && (
                  <Badge variant="secondary">{t("gabinet.leaveTypes.requiresApproval")}</Badge>
                )}
                {!lt.isActive && (
                  <Badge variant="outline">{t("common.inactive")}</Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setEditingId(lt._id)}
              >
                <Pencil className="h-4 w-4" variant="stroke" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create Dialog */}
      <LeaveTypeDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={async (data) => {
          await createLeaveType({ organizationId, ...data });
          toast.success(t("common.created"));
          void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetLeaveTypes.list(organizationId) });
          setShowCreate(false);
        }}
        t={t}
      />

      {/* Edit Dialog */}
      {editing && (
        <LeaveTypeDialog
          open={!!editingId}
          onClose={() => setEditingId(null)}
          initial={editing}
          onSubmit={async (data) => {
            await updateLeaveType({ organizationId, leaveTypeId: editingId! as Id<"gabinetLeaveTypes">, ...data });
            toast.success(t("common.saved"));
            void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetLeaveTypes.list(organizationId) });
            setEditingId(null);
          }}
          onDelete={async () => {
            setDeleteDialogOpen(true);
          }}
          t={t}
        />
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("common.confirmDeleteDescription", { name: editing?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!editingId) return;
                await removeLeaveType({ organizationId, leaveTypeId: editingId as Id<"gabinetLeaveTypes"> });
                toast.success(t("common.deleted"));
                void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetLeaveTypes.list(organizationId) });
                setDeleteDialogOpen(false);
                setEditingId(null);
              }}
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

function LeaveTypeDialog({
  open,
  onClose,
  initial,
  onSubmit,
  onDelete,
  t,
}: {
  open: boolean;
  onClose: () => void;
  initial?: {
    name: string;
    color?: string;
    isPaid: boolean;
    annualQuotaDays?: number;
    requiresApproval: boolean;
    isActive: boolean;
  };
  onSubmit: (data: {
    name: string;
    color?: string;
    isPaid: boolean;
    annualQuotaDays?: number;
    requiresApproval: boolean;
    isActive?: boolean;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
  t: any;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? "#10b981");
  const [isPaid, setIsPaid] = useState(initial?.isPaid ?? true);
  const [quota, setQuota] = useState(initial?.annualQuotaDays?.toString() ?? "");
  const [requiresApproval, setRequiresApproval] = useState(initial?.requiresApproval ?? true);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        color: color || undefined,
        isPaid,
        annualQuotaDays: quota ? parseInt(quota, 10) : undefined,
        requiresApproval,
        ...(initial ? { isActive } : {}),
      });
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.leaveTypes.errors.saveFailed",
          defaultValue: "Nie udało się zapisać typu urlopu.",
        }),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {initial ? t("gabinet.leaveTypes.edit") : t("gabinet.leaveTypes.add")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t("common.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>{t("gabinet.employees.color")}</Label>
            <input
              type="color"
              className="h-9 w-16 cursor-pointer rounded border bg-transparent"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("gabinet.leaveTypes.annualQuota")}</Label>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={quota}
              onChange={(e) => setQuota(e.target.value)}
              placeholder={t("gabinet.leaveTypes.unlimitedPlaceholder")}
            />
          </div>

          <label className="-mx-3 flex min-h-11 select-none items-center gap-3 rounded-md px-3 py-2.5 text-sm cursor-pointer transition-colors hover:bg-accent/40 active:bg-accent">
            <Checkbox
              checked={isPaid}
              onCheckedChange={(checked) => setIsPaid(checked as boolean)}
            />
            {t("gabinet.leaveTypes.paid")}
          </label>

          <label className="-mx-3 flex min-h-11 select-none items-center gap-3 rounded-md px-3 py-2.5 text-sm cursor-pointer transition-colors hover:bg-accent/40 active:bg-accent">
            <Checkbox
              checked={requiresApproval}
              onCheckedChange={(checked) => setRequiresApproval(checked as boolean)}
            />
            {t("gabinet.leaveTypes.requiresApproval")}
          </label>

          {initial && (
            <label className="-mx-3 flex min-h-11 select-none items-center gap-3 rounded-md px-3 py-2.5 text-sm cursor-pointer transition-colors hover:bg-accent/40 active:bg-accent">
              <Checkbox
                checked={isActive}
                onCheckedChange={(checked) => setIsActive(checked as boolean)}
              />
              {t("common.active")}
            </label>
          )}
        </div>

        <DialogFooter className="flex gap-2">
          {onDelete && (
            <Button variant="destructive" onClick={onDelete} className="mr-auto">
              {t("common.delete")}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || saving}>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
