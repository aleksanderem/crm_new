import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Activity,
  Calendar,
  CreditCard,
  History,
  Package,
  Plus,
  Star,
} from "@/lib/ez-icons";
import { formatCurrencyPLN } from "@/lib/format-currency";
import { EmptyState } from "@/components/layout/empty-state";
import { ActivityFeed } from "@/components/crm/activity-feed";
import { activitiesToFeedEntries } from "@/components/crm/activity-feed-adapter";
import { appointmentStatusBadgeClass } from "@/lib/gabinet-appointment-status";
import { Link } from "@tanstack/react-router";

type HistoryAppointment = {
  _id: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  treatment?: { name?: string | null } | null;
};

type PackageUsageEntry = {
  _id: string;
  packageName?: string | null;
  status: string;
  totalUsed: number;
  totalCount: number;
  expiresAt?: number | null;
  treatmentsUsed: Array<{
    treatmentId: string;
    treatmentName?: string | null;
    usedCount?: number;
    totalCount?: number;
    variantId?: string;
  }>;
};

export function AppointmentHistoryTab({
  mergedTimeline,
  patientHistory,
  patientPackageUsage,
  loyaltyBalance,
  loyaltyTier,
  loyaltyTransactions,
  allPatientPayments,
  canEdit,
  onUseMultiple,
  formatDate,
  formatTime,
  language,
  t,
}: {
  mergedTimeline: unknown[];
  patientHistory: HistoryAppointment[];
  patientPackageUsage: PackageUsageEntry[];
  loyaltyBalance: number;
  loyaltyTier: string | null | undefined;
  loyaltyTransactions: Record<string, unknown>[] | null | undefined;
  allPatientPayments: Record<string, unknown>[] | null | undefined;
  canEdit: boolean;
  onUseMultiple: (pkg: PackageUsageEntry) => void;
  formatDate: (dateStr: string) => string;
  formatTime: (time: string) => string;
  language: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="px-6 py-3 border-b">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4" variant="stroke" />
            {t("detail.tabs.timeline", "Timeline")}
          </CardTitle>
          <CardDescription className="text-xs">
            {t(
              "gabinet.appointmentDetail.history.unifiedDescription",
              "Unified operational history for this appointment, including messages and workflow events.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 py-4">
          <ActivityFeed
            entries={activitiesToFeedEntries(mergedTimeline as any[], t)}
            maxHeight="400px"
          />
        </CardContent>
      </Card>

      {/* Past Appointments Timeline */}
      <Card>
        <CardHeader className="px-6 py-3 border-b">
          <CardTitle className="text-sm flex items-center gap-2">
            <History className="h-4 w-4" variant="stroke" />
            {t("gabinet.patients.appointmentHistory")}
          </CardTitle>
          <CardDescription className="text-xs">
            {t("gabinet.patients.lastAppointments", { count: 20 })}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 py-4">
          {patientHistory.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title={t("gabinet.patients.noHistory")}
              description={t("gabinet.patients.noHistoryDesc")}
            />
          ) : (
            <div className="relative">
              <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />
              <div className="space-y-4">
                {patientHistory.map((appt, index) => (
                  <div key={appt._id} className="relative flex gap-4">
                    <div className="relative z-10 flex items-center justify-center w-6 h-6 rounded-full bg-background border-2">
                      {index === 0 && (
                        <div className="w-2 h-2 rounded-full bg-primary" />
                      )}
                    </div>
                    <Link
                      to="/dashboard/gabinet/appointments/$appointmentId"
                      params={{ appointmentId: appt._id }}
                      className="flex-1 flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div>
                        <p className="font-medium">
                          {appt.treatment?.name ?? "-"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(appt.date)} &bull;{" "}
                          {formatTime(appt.startTime)} -{" "}
                          {formatTime(appt.endTime)}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={appointmentStatusBadgeClass(appt.status)}
                      >
                        {t(`gabinet.appointments.statuses.${appt.status}`)}
                      </Badge>
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Packages */}
      <Card>
        <CardHeader className="px-6 py-3 border-b">
          <CardTitle className="text-sm flex items-center gap-2">
            <Package className="h-4 w-4" variant="stroke" />
            {t("gabinet.packages.activePackages")}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 py-4">
          {patientPackageUsage.length === 0 ? (
            <EmptyState
              icon={Package}
              title={t("gabinet.packages.noActivePackages")}
              description={t("gabinet.packages.noActivePackagesDesc")}
            />
          ) : (
            <div className="space-y-3">
              {patientPackageUsage.map((pkg) => {
                const totals = {
                  used: pkg.totalUsed,
                  total: pkg.totalCount,
                };
                const progressPercent =
                  totals.total > 0
                    ? Math.min((totals.used / totals.total) * 100, 100)
                    : 0;
                const overallRemainingRatio =
                  totals.total > 0
                    ? (totals.total - totals.used) / totals.total
                    : 1;
                let overallBarColor = "bg-emerald-500";
                if (overallRemainingRatio <= 0)
                  overallBarColor = "bg-red-500";
                else if (overallRemainingRatio < 0.1)
                  overallBarColor = "bg-red-500";
                else if (overallRemainingRatio < 0.3)
                  overallBarColor = "bg-amber-500";

                return (
                  <div
                    key={pkg._id}
                    className="p-4 border rounded-lg space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium">
                        {pkg.packageName ?? t("gabinet.packages.package")}
                      </p>
                      <div className="flex items-center gap-2">
                        {pkg.status === "active" && canEdit && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onUseMultiple(pkg)}
                          >
                            <Plus
                              className="mr-1 h-3.5 w-3.5"
                              variant="stroke"
                            />
                            {t("gabinet.packages.useMultiple")}
                          </Button>
                        )}
                        <Badge
                          variant="outline"
                          className={
                            pkg.status === "active"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
                              : ""
                          }
                        >
                          {t(`gabinet.packages.status.${pkg.status}`)}
                        </Badge>
                      </div>
                    </div>

                    {/* Overall progress */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          {t("gabinet.packages.overallProgress")}
                        </span>
                        <span className="tabular-nums">
                          {t("gabinet.packages.completionPercent", {
                            percent: Math.round(progressPercent),
                          })}
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all rounded-full ${overallBarColor}`}
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </div>

                    {/* Per-treatment progress bars */}
                    {pkg.treatmentsUsed.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          {t("gabinet.packages.perTreatmentProgress")}
                        </p>
                        {pkg.treatmentsUsed.map((entry, index) => {
                          const usedCount = entry.usedCount ?? 0;
                          const totalCount = entry.totalCount ?? 0;
                          const remaining = totalCount - usedCount;
                          const pct =
                            totalCount > 0
                              ? Math.round((usedCount / totalCount) * 100)
                              : 0;
                          const remainingRatio =
                            totalCount > 0 ? remaining / totalCount : 1;
                          let barColor = "bg-emerald-500";
                          let statusLabel = t(
                            "gabinet.packages.plentyRemaining",
                          );
                          if (remainingRatio <= 0) {
                            barColor = "bg-red-500";
                            statusLabel = t("gabinet.packages.fullyUsed");
                          } else if (remainingRatio < 0.1) {
                            barColor = "bg-red-500";
                            statusLabel = t("gabinet.packages.almostExhausted");
                          } else if (remainingRatio < 0.3) {
                            barColor = "bg-amber-500";
                            statusLabel = t("gabinet.packages.runningLow");
                          }

                          return (
                            <div
                              key={`${pkg._id}-${entry.treatmentId ?? index}`}
                              className="space-y-1"
                            >
                              <div className="flex items-center justify-between text-xs">
                                <span className="truncate max-w-[50%]">
                                  {entry.treatmentName ??
                                    t("gabinet.treatments.treatment")}
                                </span>
                                <span className="text-muted-foreground tabular-nums">
                                  {usedCount} / {totalCount}
                                  <span className="ml-1.5 text-[10px]">
                                    ({statusLabel})
                                  </span>
                                </span>
                              </div>
                              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full transition-all rounded-full ${barColor}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {!!pkg.expiresAt && (
                      <p className="text-xs text-muted-foreground">
                        {t("gabinet.packages.expires")}:{" "}
                        {new Date(pkg.expiresAt).toLocaleDateString(language)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loyalty Summary */}
      <Card>
        <CardHeader className="px-6 py-3 border-b">
          <CardTitle className="text-sm flex items-center gap-2">
            <Star className="h-4 w-4" variant="stroke" />
            {t("gabinet.loyalty.loyaltyProgram")}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                {t("gabinet.loyalty.pointsBalance")}
              </p>
              <p className="text-3xl font-bold text-primary">
                {loyaltyBalance}
              </p>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                {t("gabinet.loyalty.currentTier")}
              </p>
              <Badge variant="outline" className="text-lg mt-2">
                {loyaltyTier
                  ? t(`gabinet.loyalty.tiers.${loyaltyTier}`)
                  : t("gabinet.loyalty.tiers.bronze")}
              </Badge>
            </div>
          </div>
          {loyaltyTransactions && loyaltyTransactions.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium mb-2">
                {t("gabinet.loyalty.recentTransactions")}
              </h4>
              <div className="space-y-2">
                {loyaltyTransactions
                  .slice(0, 5)
                  .map((tx) => (
                    <div
                      key={tx._id as string}
                      className="flex items-center justify-between p-2 border rounded"
                    >
                      <div>
                        <p className="text-sm">
                          {t(`gabinet.loyalty.txTypes.${tx.type}`)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(tx.createdAt as number).toLocaleDateString(
                            "pl-PL",
                          )}
                        </p>
                      </div>
                      <span
                        className={
                          (tx.points as number) > 0
                            ? "text-green-600 font-medium"
                            : "text-destructive font-medium"
                        }
                      >
                        {(tx.points as number) > 0 ? "+" : ""}
                        {tx.points as number}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment History */}
      <Card>
        <CardHeader className="px-6 py-3 border-b">
          <CardTitle className="text-sm flex items-center gap-2">
            <CreditCard className="h-4 w-4" variant="stroke" />
            {t("gabinet.payments.paymentHistory")}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 py-4">
          {allPatientPayments && allPatientPayments.length > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="text-center p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    {t("gabinet.payments.totalSpent")}
                  </p>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrencyPLN(
                      allPatientPayments
                        .filter((p) => p.status === "completed")
                        .reduce(
                          (sum, p) => sum + (p.amount as number),
                          0,
                        ),
                    )}
                  </p>
                </div>
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    {t("gabinet.payments.lastPayment")}
                  </p>
                  <p className="text-sm font-medium">
                    {allPatientPayments[0]
                      ? new Date(
                          (allPatientPayments[0] as Record<string, unknown>)
                            .createdAt as number,
                        ).toLocaleDateString(language)
                      : "-"}
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 text-sm font-medium">
                        {t("gabinet.payments.amount")}
                      </th>
                      <th className="text-left p-3 text-sm font-medium">
                        {t("gabinet.payments.method")}
                      </th>
                      <th className="text-left p-3 text-sm font-medium">
                        {t("common.date")}
                      </th>
                      <th className="text-left p-3 text-sm font-medium">
                        {t("common.status")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {allPatientPayments
                      .slice(0, 10)
                      .map((payment) => (
                        <tr
                          key={payment._id as string}
                          className="border-b last:border-0 hover:bg-muted/30"
                        >
                          <td className="p-3 font-medium">
                            {formatCurrencyPLN(
                              payment.amount as number,
                              (payment.currency as string) ?? "PLN",
                            )}
                          </td>
                          <td className="p-3">
                            <Badge variant="outline">
                              {t(
                                `gabinet.payments.methods.${payment.paymentMethod}`,
                              )}
                            </Badge>
                          </td>
                          <td className="p-3 text-sm text-muted-foreground">
                            {new Date(
                              payment.createdAt as number,
                            ).toLocaleDateString(language)}
                          </td>
                          <td className="p-3">
                            <Badge
                              variant={
                                payment.status === "completed"
                                  ? "default"
                                  : payment.status === "refunded"
                                    ? "destructive"
                                    : "secondary"
                              }
                            >
                              {t(
                                `gabinet.payments.status.${payment.status}`,
                              )}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <EmptyState
              icon={CreditCard}
              title={t("gabinet.payments.noPayments")}
              description={t("gabinet.payments.noPaymentsDesc")}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
