import { useState, useEffect } from "react";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";
import {
  RichTextEditor,
} from "@/components/gabinet/rich-text-editor";
import { formatCurrencyPLN } from "@/lib/format-currency";
import type { Id } from "@cvx/_generated/dataModel";

export interface PackageUsageEntry {
  _id: string;
  status: string;
  packageName?: string | null;
  treatmentsUsed: Array<{
    treatmentId: string;
    variantId?: string;
    treatmentName?: string | null;
    usedCount?: number;
    totalCount?: number;
  }>;
}

export interface JunctionTreatment {
  treatmentId: string;
  priceAtBooking?: number | null;
}

export interface SettlementFormProps {
  organizationId: string;
  appointmentId: string;
  patientId: string;
  /** Junction treatment rows — used to compute the canonical amount due. */
  junctionTreatments: JunctionTreatment[];
  /** Fallback price for pre-junction (legacy single-treatment) appointments. */
  legacyTreatmentPrice?: number;
  /** Treatment catalog — used for price fallback when priceAtBooking is null. */
  treatmentsList?: Array<{ _id: string; price?: number }>;
  /** Existing payments against this appointment (for outstanding calculation). */
  payments: Array<Record<string, unknown>>;
  /** Patient's active package usages — filtered to those containing any visit treatment. */
  patientPackageUsage: PackageUsageEntry[];
  /** Called after a payment is successfully created. Should close the dialog and refetch. */
  onSuccess: () => void;
  /** Called when the user cancels. Should close the dialog. */
  onCancel: () => void;
}

const PAYMENT_METHODS = [
  "cash",
  "card",
  "transfer",
  "package",
  "gratis",
  "barter",
  "other",
] as const;

export function SettlementForm({
  organizationId,
  appointmentId,
  patientId,
  junctionTreatments,
  legacyTreatmentPrice,
  treatmentsList,
  payments,
  patientPackageUsage,
  onSuccess,
  onCancel,
}: SettlementFormProps) {
  const { t } = useTranslation();

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentUseBalance, setPaymentUseBalance] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [patientCreditBalance, setPatientCreditBalance] = useState<
    number | null
  >(null);
  const [paymentPackageId, setPaymentPackageId] = useState<string | null>(null);
  const [paymentPackageItems, setPaymentPackageItems] = useState<
    Array<{
      treatmentId: string;
      variantId?: string;
      treatmentName: string;
      remaining: number;
      qty: number;
    }>
  >([]);
  const [discountType, setDiscountType] = useState<"amount" | "percent">(
    "amount",
  );
  const [discountValue, setDiscountValue] = useState("");

  const createPayment = useAction(api.payments.create);
  const getPatientCreditAction = useAction(api.payments.getPatientCredit);
  const usePackageTreatmentsBatch = useAction(
    api.gabinet.packages.usePackageTreatmentsBatch,
  );

  // Fetch credit balance when the form mounts (dialog opens).
  useEffect(() => {
    if (!patientId) return;
    getPatientCreditAction({ organizationId, patientId })
      .then((credit: { balance: number }) => setPatientCreditBalance(credit.balance))
      .catch(() => setPatientCreditBalance(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, patientId]);

  // Amount due = sum of junction treatment prices (priceAtBooking ?? catalog),
  // with fallback to legacy single-treatment price for pre-junction appointments.
  const treatmentPrice =
    junctionTreatments.length > 0
      ? junctionTreatments.reduce((sum, jt) => {
          const tr = treatmentsList?.find((t) => t._id === jt.treatmentId);
          return sum + (jt.priceAtBooking ?? tr?.price ?? 0);
        }, 0)
      : (legacyTreatmentPrice ?? 0);

  // gratis / barter settle at the full treatment price; amount field is locked.
  const isFixedAmountMethod =
    paymentMethod === "gratis" || paymentMethod === "barter";

  const totalPaid = payments
    .filter((p) => p.status === "completed")
    .reduce(
      (sum, p) =>
        sum +
        ((p.amount as number | null) ?? 0) +
        ((p.creditApplied as number | null) ?? 0),
      0,
    );
  const outstanding = treatmentPrice - totalPaid;

  // Only show active packages that cover at least one treatment of this visit.
  const visitTreatmentIds = new Set(
    junctionTreatments.map((jt) => jt.treatmentId),
  );
  const eligiblePackages = patientPackageUsage.filter(
    (pkg) =>
      pkg.status === "active" &&
      (visitTreatmentIds.size === 0 ||
        pkg.treatmentsUsed.some((e) => visitTreatmentIds.has(e.treatmentId))),
  );

  const handleSubmit = async () => {
    const normalizedAmount = paymentAmount.replace(",", ".");
    if (!paymentAmount || isNaN(parseFloat(normalizedAmount))) {
      toast.error(t("gabinet.payments.amountRequired"));
      return;
    }

    const amount = parseFloat(normalizedAmount);
    const outstandingNow = Math.max(0, outstanding);
    const creditEarned =
      amount > outstandingNow + 0.005
        ? Math.round((amount - outstandingNow) * 100) / 100
        : 0;
    const balanceAvailable = patientCreditBalance ?? 0;
    const creditApplied =
      paymentUseBalance && balanceAvailable > 0
        ? Math.round(
            Math.min(balanceAvailable, Math.max(0, outstandingNow - amount)) *
              100,
          ) / 100
        : 0;

    setIsSubmitting(true);
    try {
      if (paymentMethod === "package" && paymentPackageId) {
        const pkgItems = paymentPackageItems
          .filter((it) => it.qty > 0)
          .map((it) => ({
            treatmentId: it.treatmentId,
            ...(it.variantId ? { variantId: it.variantId } : {}),
            quantity: it.qty,
          }));
        if (pkgItems.length > 0) {
          await usePackageTreatmentsBatch({
            organizationId,
            usageId: paymentPackageId,
            items: pkgItems,
            appointmentId,
          });
        }
      }

      await createPayment({
        organizationId,
        patientId: patientId as Id<"gabinetPatients">,
        appointmentId: appointmentId as Id<"gabinetAppointments">,
        amount,
        currency: "PLN",
        paymentMethod: paymentMethod as (typeof PAYMENT_METHODS)[number],
        notes: paymentNote || undefined,
        creditEarned: creditEarned > 0 ? creditEarned : undefined,
        creditApplied: creditApplied > 0 ? creditApplied : undefined,
      });

      toast.success(t("gabinet.payments.created"));
      onSuccess();
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("common.error");
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="space-y-4 py-4">
        {!isFixedAmountMethod && outstanding > 0 && (
          <div>
            <Label>{t("gabinet.payments.discount")}</Label>
            <div className="flex gap-2 mt-1">
              <Select
                value={discountType}
                onValueChange={(v) => {
                  setDiscountType(v as "amount" | "percent");
                  setDiscountValue("");
                }}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="amount">
                    {t("gabinet.payments.discountTypeAmount")}
                  </SelectItem>
                  <SelectItem value="percent">
                    {t("gabinet.payments.discountTypePercent")}
                  </SelectItem>
                </SelectContent>
              </Select>
              <div className="relative flex-1">
                <Input
                  type="text"
                  inputMode="decimal"
                  value={discountValue}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                      setDiscountValue(v);
                      const parsed = parseFloat(v.replace(",", ".")) || 0;
                      const disc =
                        discountType === "amount"
                          ? Math.min(parsed, outstanding)
                          : Math.round(
                              ((outstanding * Math.min(parsed, 100)) / 100) *
                                100,
                            ) / 100;
                      setPaymentAmount(
                        Math.max(0, outstanding - disc).toFixed(2),
                      );
                    }
                  }}
                  placeholder={discountType === "percent" ? "0" : "0.00"}
                  className={discountType === "percent" ? "pr-8" : ""}
                />
                {discountType === "percent" && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                    %
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        <div>
          <Label>{t("gabinet.payments.amount")}</Label>
          <Input
            type="text"
            inputMode="decimal"
            value={
              isFixedAmountMethod ? treatmentPrice.toFixed(2) : paymentAmount
            }
            disabled={isFixedAmountMethod}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                setPaymentAmount(v);
              }
            }}
            placeholder={outstanding > 0 ? outstanding.toFixed(2) : "0.00"}
          />
          {isFixedAmountMethod && (
            <p className="text-xs text-muted-foreground mt-1">
              {t("gabinet.payments.amountLockedToTreatment")}
            </p>
          )}
          {outstanding > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {t("gabinet.payments.outstanding")}:{" "}
              {formatCurrencyPLN(outstanding)}
            </p>
          )}
          {(() => {
            const parsed = parseFloat(paymentAmount.replace(",", "."));
            const overpay =
              Number.isFinite(parsed) && outstanding > 0
                ? Math.max(0, parsed - outstanding)
                : Number.isFinite(parsed) && outstanding <= 0
                  ? Math.max(0, parsed)
                  : 0;
            if (overpay <= 0) return null;
            return (
              <p className="text-xs text-emerald-600 mt-1">
                {t("gabinet.payments.overpaymentToCredit", {
                  amount: formatCurrencyPLN(overpay),
                })}
              </p>
            );
          })()}
        </div>

        {patientCreditBalance !== null && patientCreditBalance > 0 && (
          <div className="rounded-md border bg-emerald-50/50 p-2.5 dark:bg-emerald-950/20">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={paymentUseBalance}
                onChange={(e) => setPaymentUseBalance(e.target.checked)}
              />
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {t("gabinet.payments.useBalance", {
                    amount: formatCurrencyPLN(patientCreditBalance),
                  })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("gabinet.payments.useBalanceHint")}
                </p>
              </div>
            </label>
          </div>
        )}

        <div>
          <Label>{t("gabinet.payments.method")}</Label>
          <Select
            value={paymentMethod}
            onValueChange={(v) => {
              setPaymentMethod(v);
              if (v === "gratis" || v === "barter") {
                setPaymentAmount(treatmentPrice.toFixed(2));
              }
              if (v !== "package") {
                setPaymentPackageId(null);
                setPaymentPackageItems([]);
              }
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {t(`gabinet.payments.methods.${m}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {paymentMethod === "package" && (
          <div className="space-y-3 rounded-md border p-3">
            <div>
              <Label>{t("gabinet.packages.selectPackage")}</Label>
              {eligiblePackages.length === 0 ? (
                <p className="text-sm text-muted-foreground mt-1">
                  {t("gabinet.packages.noActivePackages")}
                </p>
              ) : (
                <Select
                  value={paymentPackageId ?? ""}
                  onValueChange={(pkgId) => {
                    setPaymentPackageId(pkgId);
                    const pkg = eligiblePackages.find((p) => p._id === pkgId);
                    setPaymentPackageItems(
                      (pkg?.treatmentsUsed ?? [])
                        .filter(
                          (e) => (e.usedCount ?? 0) < (e.totalCount ?? 0),
                        )
                        .map((e) => ({
                          treatmentId: e.treatmentId,
                          variantId: e.variantId,
                          treatmentName:
                            e.treatmentName ?? t("gabinet.packages.treatment"),
                          remaining: (e.totalCount ?? 0) - (e.usedCount ?? 0),
                          qty: 0,
                        })),
                    );
                  }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue
                      placeholder={t(
                        "gabinet.packages.selectPackagePlaceholder",
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {eligiblePackages.map((pkg) => (
                      <SelectItem key={pkg._id} value={pkg._id}>
                        {pkg.packageName ?? t("gabinet.packages.package")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            {paymentPackageId && (
              <div className="space-y-2">
                {paymentPackageItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("gabinet.packages.allTreatmentsExhausted")}
                  </p>
                ) : (
                  <>
                    <p className="text-xs font-medium text-muted-foreground">
                      {t("gabinet.packages.perTreatmentProgress")}
                    </p>
                    {paymentPackageItems.map((item, idx) => (
                      <div
                        key={item.treatmentId}
                        className="flex items-center gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {item.treatmentName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t("gabinet.packages.availableRemaining", {
                              remaining: item.remaining,
                            })}
                          </p>
                        </div>
                        <Input
                          type="number"
                          inputMode="numeric"
                          className="w-20"
                          min={0}
                          max={item.remaining}
                          value={item.qty}
                          onChange={(e) => {
                            const val = Math.max(
                              0,
                              Math.min(
                                item.remaining,
                                parseInt(e.target.value) || 0,
                              ),
                            );
                            setPaymentPackageItems((prev) =>
                              prev.map((it, i) =>
                                i === idx ? { ...it, qty: val } : it,
                              ),
                            );
                          }}
                        />
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <div>
          <Label>{t("common.notes")}</Label>
          <RichTextEditor
            value={paymentNote}
            onChange={(val) => setPaymentNote(val ?? "")}
            placeholder={t("gabinet.payments.notePlaceholder")}
            minHeight="80px"
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button onClick={() => void handleSubmit()} disabled={isSubmitting}>
          {isSubmitting
            ? t("common.processing")
            : t("gabinet.payments.create")}
        </Button>
      </DialogFooter>
    </>
  );
}
