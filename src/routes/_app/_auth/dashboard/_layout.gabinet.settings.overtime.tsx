import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useSupabaseGabinetOvertimeList } from "@/hooks/use-supabase-gabinet-overtime";
import { useSupabaseGabinetEmployeesList } from "@/hooks/use-supabase-gabinet-employees";
import { useSupabaseOrganizationMembers } from "@/hooks/use-supabase-organizations";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { SectionHeader } from "@untitled/app/section-headers/section-headers";
import { UntitledAlert } from "@/components/ui/untitled-alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Plus, Check, X, Trash2 } from "@/lib/ez-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";
import { PermissionGate, usePermission } from "@/hooks/use-permission";
import { Skeleton } from "@/components/ui/skeleton";

function OvertimePageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-10 w-full" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/settings/overtime"
)({
  component: () => (
    <PermissionGate feature="gabinet_settings" action="view" loadingFallback={<OvertimePageSkeleton />}>
      <OvertimePage />
    </PermissionGate>
  ),
});

function OvertimePage() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const { allowed: canManage } = usePermission("gabinet_settings", "edit");
  // @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
  const createOvertime = useAction(api.gabinet.overtime.createOvertime);
  // @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
  const approveOvertime = useAction(api.gabinet.overtime.approveOvertime);
  // @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
  const rejectOvertime = useAction(api.gabinet.overtime.rejectOvertime);
  // @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
  const deleteOvertime = useAction(api.gabinet.overtime.deleteOvertime);
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [date, setDate] = useState("");
  const [hours, setHours] = useState<string>("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<"approve" | "reject" | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: overtime } = useSupabaseGabinetOvertimeList(organizationId, {
    userId: undefined,
  });

  const filtered = statusFilter === "all"
    ? overtime
    : overtime?.filter((o) => o.status === statusFilter);

  const { data: employees } = useSupabaseGabinetEmployeesList(organizationId, { activeOnly: true });
  const { data: teamMembers } = useSupabaseOrganizationMembers(organizationId);

  const getEmployeeName = (userId: string) => {
    const member = teamMembers?.find((m) => m.userId === userId);
    return member?.user?.name ?? userId;
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "pending": return "outline";
      case "approved": return "default";
      case "rejected": return "destructive";
      default: return "secondary" as const;
    }
  };

  const handleCreate = async () => {
    if (!date || !hours || !selectedUserId) return;
    const hoursNum = parseFloat(hours);
    if (isNaN(hoursNum) || hoursNum <= 0) return;
    setSubmitting(true);
    try {
      await createOvertime({
        organizationId,
        userId: selectedUserId as any,
        date,
        hours: hoursNum,
        reason: reason || undefined,
      });
      toast.success(t("gabinet.overtime.created"));
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetOvertime.all });
      setDialogOpen(false);
      setSelectedUserId("");
      setDate("");
      setHours("");
      setReason("");
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.overtime.errors.createFailed",
          defaultValue: "Nie udało się zgłosić nadgodzin.",
        }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirm = async () => {
    if (!confirmId || !confirmAction) return;
    try {
      if (confirmAction === "approve") {
        await approveOvertime({ organizationId, overtimeId: confirmId });
        toast.success(t("gabinet.overtime.approved"));
      } else {
        await rejectOvertime({ organizationId, overtimeId: confirmId });
        toast.success(t("gabinet.overtime.rejected"));
      }
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetOvertime.all });
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.overtime.errors.statusChangeFailed",
          defaultValue: "Nie udało się zaktualizować statusu zgłoszenia.",
        }),
      );
    } finally {
      setConfirmId(null);
      setConfirmAction(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteOvertime({ organizationId, overtimeId: deleteId });
      toast.success(t("gabinet.overtime.deleted"));
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetOvertime.all });
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.overtime.errors.deleteFailed",
          defaultValue: "Nie udało się usunąć zgłoszenia.",
        }),
      );
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <>
      <div className="flex h-full w-full flex-col gap-6">
        <SectionHeader.Root className="pt-4">
          <SectionHeader.Group>
            <SectionHeader.Heading className="flex-1">
              {t("gabinet.overtime.title")}
            </SectionHeader.Heading>
            <SectionHeader.Actions>
              {canManage && (
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="mr-2 h-4 w-4" variant="stroke" />
                      {t("gabinet.overtime.logOvertime")}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>{t("gabinet.overtime.logOvertime")}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <Label>{t("gabinet.employees.selectUser")}</Label>
                        <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder={t("gabinet.appointments.selectEmployee")} />
                          </SelectTrigger>
                          <SelectContent>
                            {(employees ?? []).map((emp) => {
                              const member = teamMembers?.find((m: any) => m.userId === emp.userId);
                              return (
                                <SelectItem key={emp._id} value={emp.userId}>
                                  {member?.user?.name ?? emp.userId} — {t(`gabinet.employees.roles.${emp.role}`)}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label>{t("gabinet.overtime.date")}</Label>
                          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>{t("gabinet.overtime.hours")}</Label>
                          <Input
                            type="number"
                            min="0.5"
                            step="0.5"
                            placeholder={t("gabinet.overtime.hoursPlaceholder")}
                            value={hours}
                            onChange={(e) => setHours(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t("gabinet.overtime.reason")}</Label>
                        <Input
                          placeholder=""
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>
                          {t("common.cancel")}
                        </Button>
                        <Button
                          onClick={handleCreate}
                          disabled={submitting || !date || !hours || !selectedUserId}
                        >
                          {submitting ? t("common.saving") : t("gabinet.overtime.submit")}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </SectionHeader.Actions>
          </SectionHeader.Group>
          <UntitledAlert>{t("gabinet.overtime.description")}</UntitledAlert>
        </SectionHeader.Root>

        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder={t("gabinet.overtime.filterByStatus")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("gabinet.overtime.allStatuses")}</SelectItem>
              <SelectItem value="pending">{t("gabinet.overtime.pending")}</SelectItem>
              <SelectItem value="approved">{t("gabinet.overtime.approvedStatus")}</SelectItem>
              <SelectItem value="rejected">{t("gabinet.overtime.rejectedStatus")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg border">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50 text-xs font-medium text-muted-foreground">
                <th className="px-4 py-2 text-left">{t("gabinet.employees.employee")}</th>
                <th className="px-4 py-2 text-left">{t("gabinet.overtime.date")}</th>
                <th className="px-4 py-2 text-left">{t("gabinet.overtime.hours")}</th>
                <th className="px-4 py-2 text-left">{t("gabinet.overtime.reason")}</th>
                <th className="px-4 py-2 text-left">{t("gabinet.overtime.status")}</th>
                <th className="px-4 py-2 text-right">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {(filtered ?? []).map((entry) => (
                <tr key={entry._id} className="border-b last:border-b-0">
                  <td className="px-4 py-2 text-sm font-medium">{getEmployeeName(entry.userId)}</td>
                  <td className="px-4 py-2 text-sm">{entry.date}</td>
                  <td className="px-4 py-2 text-sm">{entry.hours}</td>
                  <td className="px-4 py-2 text-sm text-muted-foreground">{entry.reason ?? "—"}</td>
                  <td className="px-4 py-2">
                    <Badge variant={statusColor(entry.status)}>
                      {entry.status === "pending"
                        ? t("gabinet.overtime.pending")
                        : entry.status === "approved"
                          ? t("gabinet.overtime.approvedStatus")
                          : entry.status === "rejected"
                            ? t("gabinet.overtime.rejectedStatus")
                            : entry.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {canManage && (
                      <div className="flex justify-end gap-1">
                        {entry.status === "pending" && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { setConfirmId(entry._id); setConfirmAction("approve"); }}
                            >
                              <Check className="h-4 w-4 text-green-600" variant="stroke" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { setConfirmId(entry._id); setConfirmAction("reject"); }}
                            >
                              <X className="h-4 w-4 text-red-600" variant="stroke" />
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteId(entry._id)}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" variant="stroke" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {(!filtered || filtered.length === 0) && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    {t("gabinet.overtime.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AlertDialog
        open={!!confirmId}
        onOpenChange={(open) => {
          if (!open) { setConfirmId(null); setConfirmAction(null); }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "approve"
                ? t("gabinet.overtime.confirmApproveTitle")
                : t("gabinet.overtime.confirmRejectTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "approve"
                ? t("gabinet.overtime.confirmApproveDesc")
                : t("gabinet.overtime.confirmRejectDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className={confirmAction === "reject" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            >
              {confirmAction === "approve" ? t("gabinet.overtime.approve") : t("gabinet.overtime.reject")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deleteId}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("gabinet.overtime.confirmDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("gabinet.overtime.confirmDeleteDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("gabinet.overtime.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
