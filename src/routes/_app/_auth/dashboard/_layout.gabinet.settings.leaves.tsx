import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";
import { Plus, Check, X } from "@/lib/ez-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/settings/leaves"
)({
  component: LeavesPage,
});

const LEAVE_TYPES = ["vacation", "sick", "personal", "training", "other"] as const;

function LeavesPage() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const createLeave = useMutation(api["gabinet/scheduling"].createLeave);
  const approveLeave = useMutation(api["gabinet/scheduling"].approveLeave);
  const rejectLeave = useMutation(api["gabinet/scheduling"].rejectLeave);

  const { data: leaves } = useQuery(
    convexQuery(api["gabinet/scheduling"].listLeaves, { organizationId })
  );

  const { data: employees } = useQuery(
    convexQuery(api["gabinet/employees"].listAll, { organizationId, activeOnly: true })
  );

  const { data: teamMembers } = useQuery(
    convexQuery(api.organizations.getMembers, { organizationId })
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [leaveType, setLeaveType] = useState<string>("vacation");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  const handleApprove = async (leaveId: any) => {
    try {
      await approveLeave({ organizationId, leaveId });
      toast.success(t("gabinet.leaves.approved"));
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleReject = async (leaveId: any) => {
    try {
      await rejectLeave({ organizationId, leaveId });
      toast.success(t("gabinet.leaves.rejected"));
    } catch (e: any) {
      toast.error(e.message);
    }
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
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <PageHeader title={t("gabinet.leaves.title")} description={t("gabinet.leaves.description")} />
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              {t("gabinet.leaves.requestLeave")}
            </Button>
          </DialogTrigger>
          <DialogContent>
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
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
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
      </div>

      <div className="rounded-lg border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50 text-xs font-medium text-muted-foreground">
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
                      <Button size="sm" variant="ghost" onClick={() => handleApprove(leave._id)}>
                        <Check className="h-4 w-4 text-green-600" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleReject(leave._id)}>
                        <X className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {(!leaves || leaves.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t("gabinet.leaves.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
