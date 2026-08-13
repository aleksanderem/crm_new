import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CreditCard, DollarSign, Info, Package, Plus } from "@/lib/ez-icons";
import { formatCurrencyPLN } from "@/lib/format-currency";
import { EmptyState } from "@/components/layout/empty-state";

type PackageUsageEntry = {
  _id: string;
  packageName?: string | null;
};

export function AppointmentPaymentsTab({
  appointment,
  payments,
  treatmentPrice,
  totalPaid,
  outstanding,
  linkedPackageUsage,
  canCreatePayment,
  canEditPayment,
  canRefundPayment,
  canGenerateReceipt,
  generatingReceiptFor,
  onAddPayment,
  onMarkPaid,
  onRefundPayment,
  onDownloadReceipt,
  language,
  t,
}: {
  appointment: Record<string, unknown>;
  payments: Record<string, unknown>[];
  treatmentPrice: number;
  totalPaid: number;
  outstanding: number;
  linkedPackageUsage: PackageUsageEntry | null;
  canCreatePayment: boolean;
  canEditPayment: boolean;
  canRefundPayment: boolean;
  canGenerateReceipt: boolean;
  generatingReceiptFor: string | null;
  onAddPayment: () => void;
  onMarkPaid: (paymentId: string) => void;
  onRefundPayment: (paymentId: string) => void;
  onDownloadReceipt: (paymentId: string) => void;
  language: string;
  t: (key: string, opts?: Record<string, unknown> | string) => string;
}) {
  return (
    <div className="space-y-4">
      {/* Payment Summary Card */}
      <Card>
        <CardHeader className="px-6 py-3 border-b">
          <CardTitle className="text-sm flex items-center gap-2">
            <DollarSign className="h-4 w-4" variant="stroke" />
            {t("gabinet.payments.summary")}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                {t("gabinet.payments.treatmentPrice")}
              </p>
              <p className="text-2xl font-bold">
                {formatCurrencyPLN(treatmentPrice)}
              </p>
            </div>
            <div className="text-center p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
              <p className="text-sm text-muted-foreground">
                {t("gabinet.payments.totalPaid")}
              </p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrencyPLN(totalPaid)}
              </p>
            </div>
            <div
              className={`text-center p-4 rounded-lg ${outstanding > 0 ? "bg-orange-50 dark:bg-orange-950/20" : "bg-muted/50"}`}
            >
              <p className="text-sm text-muted-foreground">
                {t("gabinet.payments.outstanding")}
              </p>
              <p
                className={`text-2xl font-bold ${outstanding > 0 ? "text-orange-600" : "text-green-600"}`}
              >
                {formatCurrencyPLN(outstanding)}
              </p>
            </div>
          </div>
          {(appointment.prepaymentRequired as boolean | undefined) &&
            (appointment.prepaymentAmount as number | undefined) && (
              <div className="mt-4 p-3 border rounded-lg bg-blue-50 dark:bg-blue-950/20">
                <div className="flex items-center gap-2 text-blue-600">
                  <Info className="h-4 w-4" variant="stroke" />
                  <span className="font-medium">
                    {t("gabinet.appointments.prepaymentRequired")}
                  </span>
                </div>
                <p className="text-sm mt-1">
                  {t("gabinet.appointments.prepaymentAmount")}:{" "}
                  {formatCurrencyPLN(appointment.prepaymentAmount as number)}
                </p>
              </div>
            )}
        </CardContent>
      </Card>

      {/* Payments Table */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 px-6 py-3 border-b">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <CreditCard className="h-4 w-4" variant="stroke" />
              {t("gabinet.payments.payments")}
            </CardTitle>
            <CardDescription className="text-xs">
              {t("gabinet.payments.linkedToAppointment")}
            </CardDescription>
          </div>
          {canCreatePayment && (
            <Button size="sm" variant="outline" onClick={onAddPayment}>
              <Plus className="mr-2 h-4 w-4" variant="stroke" />
              {t("gabinet.payments.addPayment")}
            </Button>
          )}
        </CardHeader>
        <CardContent className="px-6 py-4">
          {payments.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title={t("gabinet.payments.noPayments")}
              description={t("gabinet.payments.noPaymentsDesc")}
              action={
                canCreatePayment ? (
                  <Button onClick={onAddPayment}>
                    <Plus className="mr-2 h-4 w-4" variant="stroke" />
                    {t("gabinet.payments.addFirst")}
                  </Button>
                ) : undefined
              }
            />
          ) : (
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
                    <th className="text-right p-3 text-sm font-medium">
                      {t("common.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => {
                    const creditEarned =
                      (payment.creditEarned as number | null | undefined) ?? 0;
                    const creditApplied =
                      (payment.creditApplied as number | null | undefined) ?? 0;
                    const isCreditRefund =
                      (payment.kind as string | null | undefined) ===
                      "credit_refund";
                    const currency = (payment.currency as string) ?? "PLN";
                    const creditBadges: Array<{
                      key: string;
                      label: string;
                      className: string;
                    }> = [];
                    if (isCreditRefund) {
                      creditBadges.push({
                        key: "refund",
                        label: t("gabinet.payments.credit.refund"),
                        className:
                          "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300",
                      });
                    } else {
                      if (creditEarned > 0) {
                        creditBadges.push({
                          key: "earned",
                          label: `${t("gabinet.payments.credit.earned")}: +${formatCurrencyPLN(creditEarned, currency)}`,
                          className:
                            "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300",
                        });
                      }
                      if (creditApplied > 0) {
                        creditBadges.push({
                          key: "applied",
                          label: `${t("gabinet.payments.credit.applied")}: −${formatCurrencyPLN(creditApplied, currency)}`,
                          className:
                            "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300",
                        });
                      }
                    }
                    return (
                      <tr
                        key={payment._id as string}
                        className="border-b last:border-0 hover:bg-muted/30"
                      >
                        <td className="p-3">
                          <p className="font-medium">
                            {formatCurrencyPLN(
                              payment.amount as number,
                              currency,
                            )}
                          </p>
                          {creditBadges.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {creditBadges.map((badge) => (
                                <Badge
                                  key={badge.key}
                                  variant="outline"
                                  className={`text-[10px] font-normal ${badge.className}`}
                                >
                                  {badge.label}
                                </Badge>
                              ))}
                            </div>
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
                        <td className="p-3 text-right">
                          {payment.status === "pending" && canEditPayment && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                onMarkPaid(payment._id as string)
                              }
                            >
                              {t("gabinet.payments.markPaid")}
                            </Button>
                          )}
                          {payment.status === "completed" &&
                            canRefundPayment && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() =>
                                  onRefundPayment(payment._id as string)
                                }
                              >
                                {t("gabinet.payments.refund")}
                              </Button>
                            )}
                          {payment.status === "completed" &&
                            canGenerateReceipt && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={
                                  generatingReceiptFor ===
                                  (payment._id as string)
                                }
                                onClick={() =>
                                  onDownloadReceipt(payment._id as string)
                                }
                              >
                                {generatingReceiptFor ===
                                (payment._id as string)
                                  ? t("gabinet.receipts.generating")
                                  : t("gabinet.receipts.download")}
                              </Button>
                            )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Package Usage Card (if applicable) */}
      {(appointment.packageUsageId as string | undefined) && (
        <Card>
          <CardHeader className="px-6 py-3 border-b">
            <CardTitle className="text-sm flex items-center gap-2">
              <Package className="h-4 w-4" variant="stroke" />
              {t("gabinet.packages.packageUsage")}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-6 py-4 space-y-1">
            {linkedPackageUsage?.packageName && (
              <p className="text-sm font-medium">
                {linkedPackageUsage.packageName}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              {t("gabinet.packages.usedInThisAppointment")}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
