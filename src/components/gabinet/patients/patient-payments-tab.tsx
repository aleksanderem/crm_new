import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  WalletIcon,
  CreditCard,
  Plus,
  Minus,
  RefreshCw,
  Pencil,
} from "@/lib/ez-icons";
import { formatCurrencyPLN } from "@/lib/format-currency";
import type { MappedGabinetAppointment } from "@/lib/supabase/mappers/gabinet/appointments";

type PaymentRowType =
  | "payment"
  | "overpayment"
  | "credit_applied"
  | "credit_refund"
  | "cancelled"
  | "refunded";

type Payment = {
  _id: string;
  status: string;
  kind?: string;
  amount: number;
  currency?: string;
  paymentMethod: string;
  createdAt: number;
  creditEarned?: number | null;
  creditApplied?: number | null;
  appointmentId?: string;
  packageUsageId?: string;
  notes?: string;
  discountAmount?: number | null;
  discountPercent?: number | null;
};

type PackageUsage = { _id: string; packageId: string };
type TreatmentPackage = { _id: string; name: string };

const TYPE_LABEL_KEY: Record<PaymentRowType, string> = {
  payment: "gabinet.payments.types.payment",
  overpayment: "gabinet.payments.types.overpayment",
  credit_applied: "gabinet.payments.types.creditApplied",
  credit_refund: "gabinet.payments.types.creditRefund",
  cancelled: "gabinet.payments.types.cancelled",
  refunded: "gabinet.payments.types.refunded",
};

const TYPE_BADGE_CLASS: Record<PaymentRowType, string> = {
  payment: "",
  overpayment:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300",
  credit_applied:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300",
  credit_refund:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300",
  cancelled:
    "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800/60 dark:bg-gray-950/40 dark:text-gray-300",
  refunded:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300",
};

function classifyPayment(p: Payment): PaymentRowType {
  const earned = p.creditEarned ?? 0;
  const applied = p.creditApplied ?? 0;
  if (p.kind === "credit_refund") return "credit_refund";
  if (p.status === "cancelled") return "cancelled";
  if (p.status === "refunded") return "refunded";
  if (earned > 0) return "overpayment";
  if (applied > 0) return "credit_applied";
  return "payment";
}

export function PatientPaymentsTab({
  patientPayments,
  patientCredit,
  patientAppointments,
  patientPackageUsage,
  treatmentPackages,
  getApptTreatmentDisplay,
  canCreatePayment,
  canRefundCredit,
  canCancelPayment,
  openAddPaymentDialog,
  openRefundDialog,
  openEditPaymentDialog,
  openCancelDialog,
  navigate,
  t,
}: {
  patientPayments: Payment[] | undefined;
  patientCredit: { balance: number } | null | undefined;
  patientAppointments: MappedGabinetAppointment[] | undefined;
  patientPackageUsage: PackageUsage[] | undefined;
  treatmentPackages: TreatmentPackage[] | undefined;
  getApptTreatmentDisplay: (apt?: MappedGabinetAppointment | null) => string | undefined;
  canCreatePayment: boolean;
  canRefundCredit: boolean;
  canCancelPayment: boolean;
  openAddPaymentDialog: () => void;
  openRefundDialog: () => void;
  openEditPaymentDialog: (payment: {
    _id: string;
    amount: number;
    paymentMethod: string;
    notes?: string;
    appointmentId?: string;
    discountAmount?: number | null;
    discountPercent?: number | null;
  }) => void;
  openCancelDialog: (paymentId: string) => void;
  navigate: (opts: { to: string; params?: Record<string, string> }) => void;
  t: (key: string, opts?: Record<string, unknown> | string) => string;
}) {
  const completedPayments = (patientPayments ?? []).filter(
    (p) => p.status === "completed" && p.kind !== "credit_refund",
  );
  const totalSpent = completedPayments.reduce(
    (sum, p) => sum + (p.amount ?? 0),
    0,
  );
  const pendingPayments = (patientPayments ?? []).filter(
    (p) => p.status === "pending",
  );
  const outstanding = pendingPayments.reduce(
    (sum, p) => sum + (p.amount ?? 0),
    0,
  );
  const balance = patientCredit?.balance ?? 0;

  const getPaymentForLabel = (payment: Payment): string => {
    if (payment.appointmentId) {
      const apt = patientAppointments?.find(
        (a) => a._id === payment.appointmentId,
      );
      const treatmentName = getApptTreatmentDisplay(apt);
      if (treatmentName) return treatmentName;
    }
    if (payment.packageUsageId) {
      const usage = patientPackageUsage?.find(
        (u) => u._id === payment.packageUsageId,
      );
      const pkgName = usage
        ? treatmentPackages?.find((p) => p._id === usage.packageId)?.name
        : undefined;
      if (pkgName) return pkgName;
    }
    if (payment.notes) return payment.notes;
    return "—";
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <WalletIcon className="h-4 w-4 text-emerald-600" variant="stroke" />
              <div>
                <p className="text-sm text-muted-foreground">
                  {t("gabinet.payments.credit.available")}
                </p>
                <p className="text-2xl font-bold tabular-nums">
                  {formatCurrencyPLN(balance)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CreditCard className="h-4 w-4 text-green-600" variant="stroke" />
              <div>
                <p className="text-sm text-muted-foreground">
                  {t("gabinet.payments.totalSpent")}
                </p>
                <p className="text-2xl font-bold">{formatCurrencyPLN(totalSpent)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CreditCard className="h-4 w-4 text-amber-600" variant="stroke" />
              <div>
                <p className="text-sm text-muted-foreground">
                  {t("gabinet.payments.outstanding")}
                </p>
                <p className="text-2xl font-bold">{formatCurrencyPLN(outstanding)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-2">
              {canCreatePayment && (
                <Button size="sm" onClick={openAddPaymentDialog} className="w-full">
                  <Plus className="mr-1 h-4 w-4" variant="stroke" />
                  {t("gabinet.payments.addPayment")}
                </Button>
              )}
              {balance > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={openRefundDialog}
                  className="w-full"
                >
                  <RefreshCw className="mr-1 h-4 w-4" variant="stroke" />
                  {t("gabinet.payments.credit.refundCredit")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" variant="stroke" />
            {t("gabinet.payments.paymentHistory")}
          </h3>
          {!patientPayments || patientPayments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CreditCard className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                {t("gabinet.payments.noPayments")}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 text-sm font-medium">
                      {t("common.date")}
                    </th>
                    <th className="text-left p-3 text-sm font-medium">
                      {t("gabinet.payments.type")}
                    </th>
                    <th className="text-left p-3 text-sm font-medium">
                      {t("gabinet.payments.for")}
                    </th>
                    <th className="text-left p-3 text-sm font-medium">
                      {t("gabinet.payments.method")}
                    </th>
                    <th className="text-right p-3 text-sm font-medium">
                      {t("gabinet.payments.amount")}
                    </th>
                    <th className="text-right p-3 text-sm font-medium">
                      {t("gabinet.payments.balanceDelta")}
                    </th>
                    <th className="text-right p-3 text-sm font-medium">
                      {t("common.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...patientPayments]
                    .sort((a, b) => b.createdAt - a.createdAt)
                    .map((payment) => {
                      const type = classifyPayment(payment);
                      const earned = payment.creditEarned ?? 0;
                      const applied = payment.creditApplied ?? 0;
                      const balanceDelta = earned - applied;
                      const isCancellable =
                        canCancelPayment &&
                        (payment.status === "completed" ||
                          payment.status === "pending");
                      const isEditable =
                        payment.status === "completed" ||
                        payment.status === "pending";
                      return (
                        <tr
                          key={payment._id}
                          className={`border-b last:border-0 hover:bg-muted/30 ${
                            payment.appointmentId ? "cursor-pointer" : ""
                          }`}
                          onClick={() => {
                            if (payment.appointmentId) {
                              navigate({
                                to: "/dashboard/gabinet/appointments/$appointmentId",
                                params: {
                                  appointmentId: payment.appointmentId,
                                },
                              });
                            }
                          }}
                        >
                          <td className="p-3 text-sm text-muted-foreground whitespace-nowrap">
                            {new Date(payment.createdAt).toLocaleDateString("pl-PL")}
                          </td>
                          <td className="p-3">
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${TYPE_BADGE_CLASS[type]}`}
                            >
                              {t(TYPE_LABEL_KEY[type])}
                            </Badge>
                          </td>
                          <td className="p-3 text-sm">
                            <div
                              className="max-w-[220px] truncate"
                              title={getPaymentForLabel(payment)}
                            >
                              {getPaymentForLabel(payment)}
                            </div>
                          </td>
                          <td className="p-3">
                            <Badge variant="outline">
                              {t(`gabinet.payments.methods.${payment.paymentMethod}`)}
                            </Badge>
                          </td>
                          <td className="p-3 text-right font-medium tabular-nums">
                            {formatCurrencyPLN(
                              payment.amount,
                              payment.currency ?? "PLN",
                            )}
                          </td>
                          <td
                            className={`p-3 text-right font-semibold tabular-nums ${
                              balanceDelta > 0
                                ? "text-emerald-600"
                                : balanceDelta < 0
                                  ? "text-red-600"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {balanceDelta === 0
                              ? "—"
                              : `${balanceDelta > 0 ? "+" : "−"}${formatCurrencyPLN(Math.abs(balanceDelta))}`}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex justify-end gap-1">
                              {isEditable && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  aria-label={t("common.edit")}
                                  title={t("gabinet.payments.editPayment")}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditPaymentDialog({
                                      _id: payment._id,
                                      amount: payment.amount,
                                      paymentMethod: payment.paymentMethod,
                                      notes: payment.notes,
                                      appointmentId: payment.appointmentId,
                                      discountAmount: payment.discountAmount,
                                      discountPercent: payment.discountPercent,
                                    });
                                  }}
                                >
                                  <Pencil className="h-4 w-4" variant="stroke" />
                                </Button>
                              )}
                              {isCancellable && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive"
                                  aria-label={t("common.cancel")}
                                  title={t("gabinet.payments.cancelPayment")}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openCancelDialog(payment._id);
                                  }}
                                >
                                  <Minus className="h-4 w-4" variant="stroke" />
                                </Button>
                              )}
                            </div>
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
    </div>
  );
}
