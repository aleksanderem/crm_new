import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Package, Plus, Loader2 } from "@/lib/ez-icons";
import { formatCurrencyPLN } from "@/lib/format-currency";
import { PackagePurchaseDrawer } from "./package-purchase-drawer";
import { PlateText } from "@/components/plate-text";

type PaymentMethod = "cash" | "card" | "transfer" | "other";

interface PatientPackagesCardProps {
  patientId: string;
  organizationId: Id<"organizations">;
}

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  completed: "secondary",
  expired: "destructive",
  cancelled: "outline",
};

export function PatientPackagesCard({ patientId, organizationId }: PatientPackagesCardProps) {
  const { t } = useTranslation();
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [detailUsageId, setDetailUsageId] = useState<string | null>(null);

  const getPatientPackagesAction = useAction(api.gabinet.packages.getPatientPackages);
  const { data: usages } = useQuery({
    queryKey: ["gabinet.packages.getPatientPackages", organizationId, patientId],
    queryFn: () =>
      getPatientPackagesAction({
        organizationId,
        patientId: patientId as string,
      }),
    enabled: !!organizationId && !!patientId,
  });

  const listActivePackages = useAction(api.gabinet.packages.listActive);
  const { data: allPackages } = useQuery({
    queryKey: ["gabinet.packages.listActive", organizationId],
    queryFn: () => listActivePackages({ organizationId }),
    enabled: !!organizationId,
  });

  const listActiveTreatments = useAction(api.gabinet.treatments.listActive);
  const { data: treatments } = useQuery({
    queryKey: ["gabinet.treatments.listActive", organizationId],
    queryFn: () => listActiveTreatments({ organizationId }),
    enabled: !!organizationId,
  });

  const treatmentMap = new Map(
    (treatments ?? []).map((tr) => [tr._id, tr.name])
  );

  const packageMap = new Map(
    (allPackages ?? []).map((p) => [p._id, p])
  );

  // Multi-session purchases ("pakiety"): anything bundling multiple sessions —
  // either several different treatments, or a multi-session sale of one treatment.
  // Single-session usages live in PatientTreatmentsCard.
  const items = (usages ?? []).filter((usage) => {
    if (usage.treatmentsUsed.length > 1) return true;
    const totalSessions = usage.treatmentsUsed.reduce(
      (sum, tu) => sum + tu.totalCount,
      0,
    );
    return totalSessions > 1;
  });

  const getExpiryColor = (expiresAt?: number) => {
    if (!expiresAt) return "text-muted-foreground";
    const daysLeft = Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 0) return "text-destructive";
    if (daysLeft <= 7) return "text-orange-500";
    return "text-muted-foreground";
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {t("gabinet.packages.patientPackages", "Packages")}
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-7" onClick={() => setPurchaseOpen(true)}>
              <Plus className="mr-1 h-[17px] w-[17px]" variant="stroke" />
              {t("gabinet.packages.addOrSell", "Dodaj/Sprzedaj")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Package className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">
                {t("gabinet.packages.noPatientPackages", "No packages purchased")}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((usage) => {
                const pkg = packageMap.get(usage.packageId);
                const pkgName = pkg?.name ?? t("common.unknown");

                return (
                  <div
                    key={usage._id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setDetailUsageId(String(usage._id))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setDetailUsageId(String(usage._id));
                      }
                    }}
                    className="rounded-lg border p-3 space-y-2 cursor-pointer hover:bg-muted/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium leading-tight">{pkgName}</span>
                      <Badge variant={statusColors[usage.status] ?? "secondary"} className="shrink-0">
                        {t(`gabinet.packages.status.${usage.status}`, usage.status)}
                      </Badge>
                    </div>

                    {usage.treatmentsUsed.map((tu) => {
                      const pct = tu.totalCount > 0 ? (tu.usedCount / tu.totalCount) * 100 : 0;
                      return (
                        <div key={String(tu.treatmentId)} className="space-y-1">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{treatmentMap.get(tu.treatmentId) ?? t("common.unknown")}</span>
                            <span>{tu.usedCount}/{tu.totalCount}</span>
                          </div>
                          <Progress value={pct} className="h-1.5" />
                        </div>
                      );
                    })}

                    {usage.expiresAt && (
                      <p className={`text-xs ${getExpiryColor(usage.expiresAt)}`}>
                        {t("gabinet.packages.expires", "Expires")}: {new Date(usage.expiresAt).toLocaleDateString("pl-PL")}
                      </p>
                    )}

                    <PackageInstallments
                      organizationId={organizationId}
                      packageUsageId={String(usage._id)}
                      currency={pkg?.currency ?? "PLN"}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <PackagePurchaseDrawer
        patientId={patientId}
        organizationId={organizationId}
        open={purchaseOpen}
        onOpenChange={setPurchaseOpen}
      />

      <PackageDetailDialog
        open={detailUsageId !== null}
        onOpenChange={(o) => !o && setDetailUsageId(null)}
        organizationId={organizationId}
        usage={items.find((u) => String(u._id) === detailUsageId) ?? null}
        pkg={
          detailUsageId
            ? packageMap.get(
                items.find((u) => String(u._id) === detailUsageId)?.packageId as Id<"gabinetTreatmentPackages">,
              ) ?? null
            : null
        }
        treatmentMap={treatmentMap}
      />
    </>
  );
}

interface PackageInstallmentsProps {
  organizationId: Id<"organizations">;
  packageUsageId: string;
  currency: string;
}

interface PaymentRow {
  _id: string;
  amount: number;
  currency: string;
  status: "pending" | "completed" | "refunded" | "cancelled";
  notes?: string | null;
  paidAt?: number | null;
}

function PackageInstallments({
  organizationId,
  packageUsageId,
  currency,
}: PackageInstallmentsProps) {
  const { t } = useTranslation();

  const listByPackageUsage = useAction(api.payments.listByPackageUsage);

  const queryKey = ["payments.listByPackageUsage", organizationId, packageUsageId];
  const { data: payments } = useQuery({
    queryKey,
    queryFn: () =>
      listByPackageUsage({
        organizationId,
        packageUsageId,
      }) as unknown as Promise<PaymentRow[]>,
    enabled: !!organizationId && !!packageUsageId,
  });

  const installments = (payments ?? []).filter((p) =>
    typeof p.notes === "string" && p.notes.includes("installment"),
  );

  if (installments.length === 0) return null;

  const paidCount = installments.filter((p) => p.status === "completed").length;
  const totalCount = installments.length;

  return (
    <div className="border-t pt-2 mt-2 space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">
          {t("gabinet.packages.installments", "Installments")}
        </span>
        <span className="text-muted-foreground">
          {paidCount}/{totalCount} {t("gabinet.packages.installmentsPaid", "paid")}
        </span>
      </div>
      <div className="space-y-1">
        {installments.map((payment, idx) => {
          const isPending = payment.status === "pending";
          return (
            <div
              key={payment._id}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="text-muted-foreground">
                {t("gabinet.packages.installmentIndex", "Installment {{n}}", {
                  n: idx + 1,
                })}
              </span>
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  {formatCurrencyPLN(payment.amount, payment.currency ?? currency)}
                </span>
                {isPending ? (
                  <InstallmentPayButton
                    organizationId={organizationId}
                    paymentId={payment._id}
                    amount={payment.amount}
                    currency={payment.currency ?? currency}
                    queryKey={queryKey}
                  />
                ) : (
                  <Badge
                    variant={
                      payment.status === "completed"
                        ? "secondary"
                        : payment.status === "refunded"
                          ? "destructive"
                          : "outline"
                    }
                    className="text-[10px] py-0 px-1.5"
                  >
                    {t(`gabinet.payments.status.${payment.status}`)}
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface InstallmentPayButtonProps {
  organizationId: Id<"organizations">;
  paymentId: string;
  amount: number;
  currency: string;
  queryKey: ReadonlyArray<unknown>;
}

function InstallmentPayButton({
  organizationId,
  paymentId,
  amount,
  currency,
  queryKey,
}: InstallmentPayButtonProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const markPaid = useAction(api.payments.markPaid);
  const splitMarkPaid = useAction(api.payments.splitMarkPaid);

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [splitPayment, setSplitPayment] = useState(false);
  const [firstMethod, setFirstMethod] = useState<PaymentMethod>("cash");
  const [secondMethod, setSecondMethod] = useState<PaymentMethod>("card");
  const [firstAmount, setFirstAmount] = useState<string>("");
  const [secondAmount, setSecondAmount] = useState<string>("");

  const resetForm = () => {
    setMethod("cash");
    setSplitPayment(false);
    setFirstMethod("cash");
    setSecondMethod("card");
    setFirstAmount("");
    setSecondAmount("");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm();
    setOpen(next);
  };

  const parsedFirst = Number.parseFloat(firstAmount) || 0;
  const parsedSecond = Number.parseFloat(secondAmount) || 0;
  const splitTotal = Math.round((parsedFirst + parsedSecond) * 100) / 100;
  const expectedTotal = Math.round(amount * 100) / 100;
  const splitMismatch = splitPayment && splitTotal !== expectedTotal;
  const splitMissingAmount = splitPayment && parsedFirst <= 0 && parsedSecond <= 0;
  const splitSameMethod = splitPayment && firstMethod === secondMethod;

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      if (splitPayment) {
        if (splitMissingAmount) {
          toast.error(
            t(
              "gabinet.packages.splitMissingAmount",
              "Enter at least one payment amount",
            ),
          );
          return;
        }
        if (splitMismatch) {
          toast.error(
            t(
              "gabinet.packages.splitMismatchError",
              "Split payment amounts must add up to the total price",
            ),
          );
          return;
        }
        if (splitSameMethod) {
          toast.error(
            t(
              "gabinet.packages.splitSameMethodError",
              "Pick two different payment methods",
            ),
          );
          return;
        }
        await splitMarkPaid({
          organizationId,
          paymentId,
          firstMethod,
          firstAmount: parsedFirst,
          secondMethod,
          secondAmount: parsedSecond,
        });
      } else {
        await markPaid({
          organizationId,
          paymentId,
          paymentMethod: method,
        });
      }
      toast.success(t("gabinet.payments.markedPaid"));
      await queryClient.invalidateQueries({ queryKey });
      setOpen(false);
      resetForm();
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("common.error");
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          {t("gabinet.payments.markPaid")}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">
            {t("gabinet.packages.paymentMethod", "Payment Method")}
          </Label>
          <Select
            value={method}
            onValueChange={(v) => setMethod(v as PaymentMethod)}
            disabled={splitPayment}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">{t("gabinet.packages.paymentMethods.cash", "Cash")}</SelectItem>
              <SelectItem value="card">{t("gabinet.packages.paymentMethods.card", "Card")}</SelectItem>
              <SelectItem value="transfer">{t("gabinet.packages.paymentMethods.transfer", "Transfer")}</SelectItem>
              <SelectItem value="other">{t("gabinet.packages.paymentMethods.other", "Other")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id={`split-installment-${paymentId}`}
            checked={splitPayment}
            onCheckedChange={(v) => setSplitPayment(v === true)}
          />
          <Label
            htmlFor={`split-installment-${paymentId}`}
            className="cursor-pointer text-xs font-normal"
          >
            {t("gabinet.packages.splitPayment", "Split payment")}
          </Label>
        </div>

        {splitPayment && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  {t("gabinet.packages.firstMethod", "First method")}
                </Label>
                <Select
                  value={firstMethod}
                  onValueChange={(v) => setFirstMethod(v as PaymentMethod)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">{t("gabinet.packages.paymentMethods.cash", "Cash")}</SelectItem>
                    <SelectItem value="card">{t("gabinet.packages.paymentMethods.card", "Card")}</SelectItem>
                    <SelectItem value="transfer">{t("gabinet.packages.paymentMethods.transfer", "Transfer")}</SelectItem>
                    <SelectItem value="other">{t("gabinet.packages.paymentMethods.other", "Other")}</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={firstAmount}
                  onChange={(e) => setFirstAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  {t("gabinet.packages.secondMethod", "Second method")}
                </Label>
                <Select
                  value={secondMethod}
                  onValueChange={(v) => setSecondMethod(v as PaymentMethod)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">{t("gabinet.packages.paymentMethods.cash", "Cash")}</SelectItem>
                    <SelectItem value="card">{t("gabinet.packages.paymentMethods.card", "Card")}</SelectItem>
                    <SelectItem value="transfer">{t("gabinet.packages.paymentMethods.transfer", "Transfer")}</SelectItem>
                    <SelectItem value="other">{t("gabinet.packages.paymentMethods.other", "Other")}</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={secondAmount}
                  onChange={(e) => setSecondAmount(e.target.value)}
                />
              </div>
            </div>
            <div
              className={`flex items-center justify-between text-xs ${
                splitMismatch || splitSameMethod
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}
            >
              <span>
                {t("gabinet.packages.splitSum", "Sum")}: {splitTotal.toFixed(2)} /{" "}
                {formatCurrencyPLN(expectedTotal, currency)}
              </span>
              {splitSameMethod ? (
                <span>
                  {t("gabinet.packages.splitSameMethod", "Methods must differ")}
                </span>
              ) : splitMismatch ? (
                <span>
                  {t("gabinet.packages.splitMismatch", "Must equal total")}
                </span>
              ) : null}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            size="sm"
            disabled={
              submitting ||
              (splitPayment && (splitMissingAmount || splitMismatch || splitSameMethod))
            }
            onClick={handleConfirm}
          >
            {submitting && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
            {t("common.confirm", "Confirm")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface PackageDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: Id<"organizations">;
  usage: {
    _id: string;
    packageId: Id<"gabinetTreatmentPackages">;
    purchasedAt: number;
    expiresAt?: number;
    status: string;
    paidAmount: number;
    paymentMethod?: string | null;
    treatmentsUsed: Array<{ treatmentId: Id<"gabinetTreatments">; usedCount: number; totalCount: number }>;
  } | null;
  pkg: {
    name: string;
    description?: string;
    totalPrice: number;
    currency?: string;
  } | null;
  treatmentMap: Map<Id<"gabinetTreatments">, string>;
}

function PackageDetailDialog({
  open,
  onOpenChange,
  organizationId,
  usage,
  pkg,
  treatmentMap,
}: PackageDetailDialogProps) {
  const { t } = useTranslation();

  const listByPackageUsage = useAction(api.payments.listByPackageUsage);
  const { data: payments } = useQuery({
    queryKey: ["payments.listByPackageUsage", organizationId, usage?._id ?? ""],
    queryFn: () =>
      listByPackageUsage({
        organizationId,
        packageUsageId: usage!._id,
      }) as unknown as Promise<PaymentRow[]>,
    enabled: !!organizationId && !!usage && open,
  });

  if (!usage) return null;

  const currency = pkg?.currency ?? "PLN";
  const totalPrice = pkg?.totalPrice ?? usage.paidAmount;

  const completedPayments = (payments ?? []).filter((p) => p.status === "completed");
  const paidSoFar = completedPayments.reduce((sum, p) => sum + p.amount, 0);
  const outstanding = Math.max(0, Math.round((totalPrice - paidSoFar) * 100) / 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="pr-6">
            <div className="flex items-start justify-between gap-2">
              <span>{pkg?.name ?? t("common.unknown")}</span>
              <Badge variant={statusColors[usage.status] ?? "secondary"} className="shrink-0">
                {t(`gabinet.packages.status.${usage.status}`, usage.status)}
              </Badge>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {pkg?.description && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t("gabinet.packages.description", "Description")}
              </p>
              <p className="text-sm whitespace-pre-wrap">
                <PlateText value={pkg.description} />
              </p>
            </div>
          )}

          <div className="rounded-md border p-3 space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t("gabinet.packages.totalPrice", "Total price")}
              </span>
              <span className="font-medium">
                {formatCurrencyPLN(totalPrice, currency)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t("gabinet.packages.paidAmount", "Paid")}
              </span>
              <span className="font-medium text-green-600">
                {formatCurrencyPLN(paidSoFar, currency)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm border-t pt-1.5">
              <span className="text-muted-foreground">
                {t("gabinet.packages.outstanding", "Outstanding")}
              </span>
              <span className={`font-semibold ${outstanding > 0 ? "text-orange-600" : ""}`}>
                {formatCurrencyPLN(outstanding, currency)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="space-y-0.5">
              <p className="text-muted-foreground">
                {t("gabinet.packages.purchasedAt", "Purchased")}
              </p>
              <p className="font-medium">
                {new Date(usage.purchasedAt).toLocaleDateString("pl-PL")}
              </p>
            </div>
            {usage.expiresAt && (
              <div className="space-y-0.5">
                <p className="text-muted-foreground">
                  {t("gabinet.packages.expires", "Expires")}
                </p>
                <p className="font-medium">
                  {new Date(usage.expiresAt).toLocaleDateString("pl-PL")}
                </p>
              </div>
            )}
          </div>

          {usage.treatmentsUsed.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t("gabinet.packages.treatments", "Treatments")}
              </p>
              <div className="space-y-2">
                {usage.treatmentsUsed.map((tu) => {
                  const pct = tu.totalCount > 0 ? (tu.usedCount / tu.totalCount) * 100 : 0;
                  return (
                    <div key={String(tu.treatmentId)} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span>{treatmentMap.get(tu.treatmentId) ?? t("common.unknown")}</span>
                        <span className="text-muted-foreground">
                          {tu.usedCount}/{tu.totalCount}
                        </span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t("gabinet.packages.paymentHistory", "Payment history")}
            </p>
            {(payments ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground py-1">
                {t("gabinet.packages.noPayments", "No payments recorded")}
              </p>
            ) : (
              <div className="space-y-1.5">
                {(payments ?? []).map((p) => (
                  <div
                    key={p._id}
                    className="flex items-start justify-between gap-2 rounded-md border p-2 text-xs"
                  >
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {formatCurrencyPLN(p.amount, p.currency ?? currency)}
                        </span>
                        <Badge
                          variant={
                            p.status === "completed"
                              ? "secondary"
                              : p.status === "pending"
                                ? "outline"
                                : p.status === "refunded"
                                  ? "destructive"
                                  : "outline"
                          }
                          className="text-[10px] py-0 px-1.5"
                        >
                          {t(`gabinet.payments.status.${p.status}`, p.status)}
                        </Badge>
                      </div>
                      {p.notes && (
                        <p className="text-muted-foreground break-words">{p.notes}</p>
                      )}
                    </div>
                    {p.paidAt && (
                      <span className="text-muted-foreground shrink-0">
                        {new Date(p.paidAt).toLocaleDateString("pl-PL")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
