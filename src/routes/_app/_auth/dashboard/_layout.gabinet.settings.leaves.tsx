import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useSupabaseGabinetEmployeesList } from "@/hooks/use-supabase-gabinet-employees";
import { useSupabaseGabinetLeavesList } from "@/hooks/use-supabase-gabinet-leaves";
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
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";
import { Id } from "@cvx/_generated/dataModel";
import { Plus, Check, X } from "@/lib/ez-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

type LeavesNudgeFilter = "pending";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/settings/leaves"
)({
  component: LeavesPage,
  validateSearch: (
    search: Record<string, unknown>,
  ): { nudge?: LeavesNudgeFilter } => ({
    nudge:
      search.nudge === "pending"
        ? (search.nudge as LeavesNudgeFilter)
        : undefined,
  }),
});

const LEAVE_TYPES = ["vacation", "sick", "personal", "training", "other"] as const;

function LeavesPage() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const { nudge: nudgeFilter } = useSearch({ from: Route.id });
  const routeNavigate = useNavigate();
  // @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
  const createLeave = useAction(api.gabinet.scheduling.createLeave);
  // @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
  const approveLeave = useAction(api.gabinet.scheduling.approveLeave);
  // @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
  const rejectLeave = useAction(api.gabinet.scheduling.rejectLeave);
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>(
    nudgeFilter === "pending" ? "pending" : "all",
  );

  // Fetch leaves from Supabase
  const { data: leaves } = useSupabaseGabinetLeavesList(organizationId, {
    status: statusFilter !== "all" ? statusFilter : undefined,
  });

  const { data: employees } = useSupabaseGabinetEmployeesList(organizationId, { activeOnly: true });

  const { data: teamMembers } = useSupabaseOrganizationMembers(organizationId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [leaveType, setLeaveType] = useState<string>("vacation");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [confirmLeaveId, setConfirmLeaveId] = useState<Id<"gabinetLeaves"> | null>(null);
  const [confirmAction, setConfirmAction] = useState<"approve" | "reject" | null>(null);

  const handleCreate = async () => {
    if (!startDate || !endDate || !selectedUserId) return;
    setSubmitting(true);
    try {
      await createLeave({
        organizationId,
        userId: selectedUserId as any,
        type: leaveType as any,
        startDate,
        endDate,
        reason: reason || undefined,
      });
      toast.success(t("gabinet.leaves.created"));
      // Invalidate Supabase leaves cache after Convex mutation
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetLeaves.all });
      setDialogOpen(false);
      setSelectedUserId("");
      setStartDate("");
      setEndDate("");
      setReason("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = (leaveId: Id<"gabinetLeaves">) => {
    setConfirmLeaveId(leaveId);
    setConfirmAction("approve");
  };

  const handleReject = (leaveId: Id<"gabinetLeaves">) => {
    setConfirmLeaveId(leaveId);
    setConfirmAction("reject");
  };

  const handleConfirm = async () => {
    if (!confirmLeaveId || !confirmAction) return;
    try {
      if (confirmAction === "approve") {
        await approveLeave({ organizationId, leaveId: confirmLeaveId });
        toast.success(t("gabinet.leaves.approved"));
      } else {
        await rejectLeave({ organizationId, leaveId: confirmLeaveId });
        toast.success(t("gabinet.leaves.rejected"));
      }
      // Invalidate Supabase leaves cache after status change
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetLeaves.all });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setConfirmLeaveId(null);
      setConfirmAction(null);
    }
  };

  const getEmployeeName = (userId: string) => {
    const member = teamMembers?.find((m) => m.userId === userId);
    return member?.user?.name ?? userId;
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "pending": return "outline";
      case "approved": return "default";
      case "rejected": return "destructive";
      default: return "secondary" as any;
    }
  };

  return (
    <>
      <div className="flex h-full w-full flex-col gap-6">
        <SectionHeader.Root className="pt-4">
          <SectionHeader.Group>
            <SectionHeader.Heading className="flex-1">
              {t("gabinet.leaves.title")}
            </SectionHeader.Heading>
            <SectionHeader.Actions>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" variant="stroke" />
                    {t("gabinet.leaves.requestLeave")}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>{t("gabinet.leaves.requestLeave")}</DialogTitle>
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
                    <div className="space-y-1.5">
                      <Label>{t("gabinet.leaves.type")}</Label>
                      <Select value={leaveType} onValueChange={setLeaveType}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LEAVE_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {t(`gabinet.leaves.types.${type}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>{t("gabinet.leaves.startDate")}</Label>
                        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t("gabinet.leaves.endDate")}</Label>
                        <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t("gabinet.leaves.reason")}</Label>
                      <RichTextEditor value={reason} onChange={(val) => setReason(val ?? "")} minHeight="80px" />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("common.cancel")}</Button>
                      <Button onClick={handleCreate} disabled={submitting || !startDate || !endDate || !selectedUserId}>
                        {submitting ? t("common.saving") : t("gabinet.leaves.submit")}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </SectionHeader.Actions>
          </SectionHeader.Group>
          <UntitledAlert>{t("gabinet.leaves.description")}</UntitledAlert>
        </SectionHeader.Root>

        {nudgeFilter === "pending" && (
          <div className="flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            <span>
              {t("gabinet.leaves.nudgeFilter.pending", {
                defaultValue:
                  "Pokazywane są wnioski urlopowe oczekujące na zatwierdzenie.",
              })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => {
                setStatusFilter("all");
                routeNavigate({
                  to: "/dashboard/gabinet/settings/leaves",
                  search: { nudge: undefined },
                });
              }}
            >
              <X className="h-3.5 w-3.5" variant="stroke" />
              {t("common.clearFilters")}
            </Button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder={t("gabinet.leaves.filterByStatus")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("gabinet.leaves.allStatuses")}</SelectItem>
              <SelectItem value="pending">{t("gabinet.leaves.pending")}</SelectItem>
              <SelectItem value="approved">{t("gabinet.leaves.approvedStatus")}</SelectItem>
              <SelectItem value="rejected">{t("gabinet.leaves.rejectedStatus")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg border">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50 text-xs font-medium text-muted-foreground">
                <th className="px-4 py-2 text-left">{t("gabinet.employees.employee")}</th>
                <th className="px-4 py-2 text-left">{t("gabinet.leaves.type")}</th>
                <th className="px-4 py-2 text-left">{t("gabinet.leaves.startDate")}</th>
                <th className="px-4 py-2 text-left">{t("gabinet.leaves.endDate")}</th>
                <th className="px-4 py-2 text-left">{t("gabinet.leaves.reason")}</th>
                <th className="px-4 py-2 text-left">{t("gabinet.leaves.status")}</th>
                <th className="px-4 py-2 text-right">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {(leaves ?? []).map((leave) => (
                <tr key={leave._id} className="border-b last:border-b-0">
                  <td className="px-4 py-2 text-sm font-medium">{getEmployeeName(leave.userId)}</td>
                  <td className="px-4 py-2 text-sm">{t(`gabinet.leaves.types.${leave.type}`)}</td>
                  <td className="px-4 py-2 text-sm">{leave.startDate}</td>
                  <td className="px-4 py-2 text-sm">{leave.endDate}</td>
                  <td className="px-4 py-2 text-sm text-muted-foreground">{leave.reason ?? "—"}</td>
                  <td className="px-4 py-2">
                    <Badge variant={statusColor(leave.status)}>
                      {leave.status === "pending" ? t("gabinet.leaves.pending") :
                       leave.status === "approved" ? t("gabinet.leaves.approvedStatus") :
                       leave.status === "rejected" ? t("gabinet.leaves.rejectedStatus") :
                       leave.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {leave.status === "pending" && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => handleApprove(leave._id as Id<"gabinetLeaves">)}>
                          <Check className="h-4 w-4 text-green-600" variant="stroke" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleReject(leave._id as Id<"gabinetLeaves">)}>
                          <X className="h-4 w-4 text-red-600" variant="stroke" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {(!leaves || leaves.length === 0) && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    {t("gabinet.leaves.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AlertDialog
        open={!!confirmLeaveId}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmLeaveId(null);
            setConfirmAction(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "approve"
                ? t("gabinet.leaves.confirmApproveTitle")
                : t("gabinet.leaves.confirmRejectTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "approve"
                ? t("gabinet.leaves.confirmApproveDesc")
                : t("gabinet.leaves.confirmRejectDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className={confirmAction === "reject" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            >
              {confirmAction === "approve" ? t("gabinet.leaves.approve") : t("gabinet.leaves.reject")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
