import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useSupabaseGabinetLeavesList } from "@/hooks/use-supabase-gabinet-leaves";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { SectionHeader } from "@untitled/app/section-headers/section-headers";
import { UntitledAlert } from "@/components/ui/untitled-alert";
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
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";
import { PlateText } from "@/components/plate-text";
import { Plus } from "@/lib/ez-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";
import { Skeleton } from "@/components/ui/skeleton";

const LEAVE_TYPES = ["vacation", "sick", "personal", "training", "other"] as const;

function MyLeavesPageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-10 w-full" />
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/my-leaves"
)({
  component: MyLeavesPage,
});

function MyLeavesPage() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();

  // @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
  const { data: currentUser } = useQuery(convexQuery(api.app.getCurrentUser, {}));
  // @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
  const requestLeave = useAction(api.gabinet.scheduling.requestLeave);
  // @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
  const withdrawLeave = useAction(api.gabinet.scheduling.withdrawLeave);

  const { data: leaves, isLoading } = useSupabaseGabinetLeavesList(organizationId, {
    userId: currentUser?._id ? String(currentUser._id) : undefined,
    enabled: !!currentUser?._id,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [leaveType, setLeaveType] = useState<string>("vacation");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!startDate || !endDate) return;
    setSubmitting(true);
    try {
      await requestLeave({
        organizationId,
        type: leaveType as any,
        startDate,
        endDate,
        reason: reason || undefined,
      });
      toast.success(t("gabinet.leaves.created"));
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetLeaves.all });
      setDialogOpen(false);
      setLeaveType("vacation");
      setStartDate("");
      setEndDate("");
      setReason("");
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.leaves.errors.createFailed",
          defaultValue: "Nie udało się utworzyć wniosku urlopowego.",
        }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdraw = async (leaveId: string) => {
    setWithdrawingId(leaveId);
    try {
      await withdrawLeave({ organizationId, leaveId });
      toast.success(t("gabinet.leaves.withdrawn"));
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetLeaves.all });
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.leaves.errors.withdrawFailed",
          defaultValue: "Nie udało się wycofać wniosku urlopowego.",
        }),
      );
    } finally {
      setWithdrawingId(null);
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

  if (!currentUser) return <MyLeavesPageSkeleton />;

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <SectionHeader.Root className="pt-4">
        <SectionHeader.Group>
          <SectionHeader.Heading className="flex-1">
            {t("nav.gabinet.myLeaves")}
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
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>
                      {t("common.cancel")}
                    </Button>
                    <Button onClick={handleSubmit} disabled={submitting || !startDate || !endDate}>
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

      {isLoading ? (
        <MyLeavesPageSkeleton />
      ) : (
        <div className="rounded-lg border">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50 text-xs font-medium text-muted-foreground">
                <th className="px-4 py-2 text-left">{t("gabinet.leaves.type")}</th>
                <th className="px-4 py-2 text-left">{t("gabinet.leaves.startDate")}</th>
                <th className="px-4 py-2 text-left">{t("gabinet.leaves.endDate")}</th>
                <th className="px-4 py-2 text-left">{t("gabinet.leaves.reason")}</th>
                <th className="px-4 py-2 text-left">{t("gabinet.leaves.status")}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {(leaves ?? []).map((leave) => (
                <tr key={leave._id} className="border-b last:border-b-0">
                  <td className="px-4 py-2 text-sm">{t(`gabinet.leaves.types.${leave.type}`)}</td>
                  <td className="px-4 py-2 text-sm">{leave.startDate}</td>
                  <td className="px-4 py-2 text-sm">{leave.endDate}</td>
                  <td className="px-4 py-2 text-sm text-muted-foreground">
                    <PlateText value={leave.reason} fallback="—" />
                  </td>
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
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={withdrawingId === leave._id}
                        onClick={() => handleWithdraw(leave._id)}
                      >
                        {withdrawingId === leave._id ? t("common.saving") : t("gabinet.leaves.withdraw")}
                      </Button>
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
      )}
    </div>
  );
}
