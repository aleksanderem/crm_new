import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/settings/leave-balances"
)({
  component: LeaveBalancesPage,
});

function LeaveBalancesPage() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const adjustBalance = useMutation(api.gabinet.leaveTypes.adjustBalance);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<{
    balanceId: string;
    employeeName: string;
    leaveTypeName: string;
    totalDays: number;
    usedDays: number;
  } | null>(null);
  const [adjustTotal, setAdjustTotal] = useState(0);
  const [adjustUsed, setAdjustUsed] = useState(0);
  const [adjusting, setAdjusting] = useState(false);

  const openAdjustDialog = (
    balanceId: string,
    employeeName: string,
    leaveTypeName: string,
    totalDays: number,
    usedDays: number
  ) => {
    setAdjustTarget({ balanceId, employeeName, leaveTypeName, totalDays, usedDays });
    setAdjustTotal(totalDays);
    setAdjustUsed(usedDays);
    setAdjustDialogOpen(true);
  };

  const handleAdjust = async () => {
    if (!adjustTarget) return;
    setAdjusting(true);
    try {
      await adjustBalance({
        organizationId,
        balanceId: adjustTarget.balanceId as any,
        totalDays: adjustTotal,
        usedDays: adjustUsed,
      });
      toast.success(t("gabinet.leaveBalances.adjusted"));
      setAdjustDialogOpen(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAdjusting(false);
    }
  };

  const { data: employees } = useQuery(
    convexQuery(api.gabinet.employees.listAll, { organizationId, activeOnly: true })
  );

  const { data: leaveTypes } = useQuery(
    convexQuery(api.gabinet.leaveTypes.list, { organizationId, activeOnly: true })
  );

  const { data: balances } = useQuery(
    convexQuery(api.gabinet.leaveTypes.getAllBalances, { organizationId, year })
  );

  const { data: members } = useQuery(
    convexQuery(api.organizations.getMembers, { organizationId })
  );

  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    members?.forEach((m) => {
      if (m.user) map.set(m.userId, m.user.name || m.user.email || "?");
    });
    return map;
  }, [members]);

  const leaveTypeMap = useMemo(() => {
    const map = new Map<string, { name: string; color?: string }>();
    leaveTypes?.forEach((lt) => map.set(lt._id, { name: lt.name, color: lt.color }));
    return map;
  }, [leaveTypes]);

  // Group balances by employee
  const balancesByEmployee = useMemo(() => {
    const map = new Map<string, Array<NonNullable<typeof balances>[number]>>();
    balances?.forEach((b) => {
      const list = map.get(b.employeeId) ?? [];
      list.push(b);
      map.set(b.employeeId, list);
    });
    return map;
  }, [balances]);

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <PageHeader
        title={t("gabinet.leaveBalances.title")}
        description={t("gabinet.leaveBalances.description")}
        actions={
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {!employees?.length && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {t("gabinet.employees.empty")}
        </div>
      )}

      <div className="space-y-4">
        {employees?.map((emp) => {
          const empBalances = balancesByEmployee.get(emp._id) ?? [];
          const userName = userMap.get(emp.userId) ?? t("common.unknown");

          return (
            <Card key={emp._id}>
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-semibold">{userName}</CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                {empBalances.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("gabinet.leaveBalances.noBalances")}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {empBalances.map((bal) => {
                      const lt = leaveTypeMap.get(bal.leaveTypeId);
                      const remaining = bal.totalDays - bal.usedDays;
                      const pct = bal.totalDays > 0 ? (bal.usedDays / bal.totalDays) * 100 : 0;

                      return (
                        <div key={bal._id} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              {lt?.color && (
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ backgroundColor: lt.color }}
                                />
                              )}
                              <span className="font-medium">{lt?.name ?? "?"}</span>
                            </div>
                            <span className="text-muted-foreground">
                              {bal.usedDays} / {bal.totalDays} {t("gabinet.leaveBalances.days")}
                              {" · "}
                              <span className={remaining <= 0 ? "text-red-500" : "text-green-500"}>
                                {remaining} {t("gabinet.leaveBalances.remaining")}
                              </span>
                            </span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-muted">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${Math.min(pct, 100)}%`,
                                backgroundColor: pct >= 100 ? "#ef4444" : (lt?.color ?? "#3b82f6"),
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
