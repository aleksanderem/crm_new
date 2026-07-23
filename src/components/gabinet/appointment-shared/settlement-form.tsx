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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";
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
  treatmentId: string | null;
  priceAtBooking?: number | null;
}

export interface SettlementFormProps {
  organizationId: Id<"organizations">;
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
  /** Called before payment creation — use to auto-save unsaved form fields. */
  onBeforeSubmit?: () => Promise<void>;
  /** If true, shows a "mark visit as completed" checkbox before the footer. */
  showMarkCompleted?: boolean;
  /** Called after all payments are created when the mark-completed checkbox is checked. */
  onMarkCompleted?: () => Promise<void>;
  /** Rendered in the footer row before the action buttons. */
  extraFooterContent?: React.ReactNode;
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

// Real money-flow methods (Płatność). "package" is NOT here — redeeming a
// pre-purchased pass/package is a settlement, picked in the Rozliczenie
// section, not a payment method.
const PAY_METHODS = PAYMENT_METHODS.filter((m) => m !== "package");

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
  onBeforeSubmit,
  showMarkCompleted,
  onMarkCompleted,
  extraFooterContent,
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

  // Split payment state
  const [splitPayment, setSplitPayment] = useState(false);
  const [firstSplitMethod, setFirstSplitMethod] =
    useState<(typeof PAYMENT_METHODS)[number]>("cash");
  const [secondSplitMethod, setSecondSplitMethod] =
    useState<(typeof PAYMENT_METHODS)[number]>("card");
  const [firstSplitAmount, setFirstSplitAmount] = useState("");
  const [secondSplitAmount, setSecondSplitAmount] = useState("");
  const [firstSplitPackageId, setFirstSplitPackageId] = useState<string | null>(
    null,
  );
  const [firstSplitPackageItems, setFirstSplitPackageItems] = useState<
    Array<{
      treatmentId: string;
      variantId?: string;
      treatmentName: string;
      remaining: number;
      qty: number;
    }>
  >([]);
  const [secondSplitPackageId, setSecondSplitPackageId] = useState<
    string | null
  >(null);
  const [secondSplitPackageItems, setSecondSplitPackageItems] = useState<
    Array<{
      treatmentId: string;
      variantId?: string;
      treatmentName: string;
      remaining: number;
      qty: number;
    }>
  >([]);

  // Mark completed state
  const [markCompleted, setMarkCompleted] = useState(
    showMarkCompleted ?? false,
  );

  const createPayment = useAction(api.payments.create);
  const getPatientCreditAction = useAction(api.payments.getPatientCredit);
  const usePackageTreatmentsBatch = useAction(
    api.gabinet.packages.usePackageTreatmentsBatch,
  );

  // Fetch credit balance when the form mounts (dialog opens).
  useEffect(() => {
    if (!patientId) return;
    getPatientCreditAction({ organizationId, patientId })
      .then((credit: { balance: number }) =>
        setPatientCreditBalance(credit.balance),
      )
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
    junctionTreatments
      .filter((jt) => jt.treatmentId != null)
      .map((jt) => jt.treatmentId!),
  );
  const eligiblePackages = patientPackageUsage.filter(
    (pkg) =>
      pkg.status === "active" &&
      (visitTreatmentIds.size === 0 ||
        pkg.treatmentsUsed.some((e) => visitTreatmentIds.has(e.treatmentId))),
  );

  // Package redemption is quantity-only: the package was paid for up front, so
  // no amount is entered. The ledger row's amount is derived from the redeemed
  // quantities (qty × price of that treatment on this visit), capped at the
  // outstanding balance so the visit's "due" math stays consistent.
  const unitPriceFor = (treatmentId: string) => {
    const jt = junctionTreatments.find((j) => j.treatmentId === treatmentId);
    if (jt?.priceAtBooking != null) return jt.priceAtBooking;
    return treatmentsList?.find((t) => t._id === treatmentId)?.price ?? 0;
  };
  const packageSettleAmount =
    paymentMethod === "package"
      ? Math.min(
          Math.max(0, outstanding),
          Math.round(
            paymentPackageItems.reduce(
              (s, it) => s + it.qty * unitPriceFor(it.treatmentId),
              0,
            ) * 100,
          ) / 100,
        )
      : 0;

  // gratis / barter lock the amount in split rows too (mirrors non-split behavior).
  const isFirstSplitFixed =
    firstSplitMethod === "gratis" || firstSplitMethod === "barter";
  const isSecondSplitFixed =
    secondSplitMethod === "gratis" || secondSplitMethod === "barter";

  // Split payment derived values
  const parsedFirstSplit = isFirstSplitFixed
    ? treatmentPrice
    : parseFloat(firstSplitAmount.replace(",", ".")) || 0;
  const parsedSecondSplit = isSecondSplitFixed
    ? treatmentPrice
    : parseFloat(secondSplitAmount.replace(",", ".")) || 0;
  const splitTotal =
    Math.round((parsedFirstSplit + parsedSecondSplit) * 100) / 100;
  const balanceAvailable = patientCreditBalance ?? 0;
  // In split mode, credit fills the full outstanding gap; amounts cover the rest.
  const splitCreditApplied =
    splitPayment && paymentUseBalance && balanceAvailable > 0
      ? Math.min(balanceAvailable, Math.max(0, outstanding))
      : 0;
  const splitExpectedTotal =
    Math.round(Math.max(0, outstanding - splitCreditApplied) * 100) / 100;
  const splitMismatch = splitPayment && splitTotal < splitExpectedTotal - 0.005;
  const splitMissingAmount =
    splitPayment &&
    splitExpectedTotal > 0 &&
    parsedFirstSplit <= 0 &&
    parsedSecondSplit <= 0;
  const splitSameMethod =
    splitPayment &&
    parsedFirstSplit > 0 &&
    parsedSecondSplit > 0 &&
    firstSplitMethod === secondSplitMethod;
  const splitOverpayment = splitPayment
    ? Math.max(0, splitTotal - splitExpectedTotal)
    : 0;

  const handleSubmit = async () => {
    if (splitPayment) {
      if (splitMissingAmount) {
        toast.error(
          t(
            "gabinet.packages.splitMissingAmount",
            "Podaj kwotę co najmniej jednej metody płatności",
          ),
        );
        return;
      }
      if (splitMismatch) {
        toast.error(
          t(
            "gabinet.packages.splitUnderpaidError",
            "Suma rozdzielonych płatności jest niższa niż kwota do zapłaty",
          ),
        );
        return;
      }
      if (splitSameMethod) {
        toast.error(
          t(
            "gabinet.packages.splitSameMethodError",
            "Wybierz dwie różne metody płatności",
          ),
        );
        return;
      }
    } else if (paymentMethod === "package") {
      // Quantity-only settlement — the package was already paid for.
      if (!paymentPackageId) {
        toast.error(
          t(
            "gabinet.packages.selectPackageRequired",
            "Wybierz pakiet do rozliczenia",
          ),
        );
        return;
      }
      if (!paymentPackageItems.some((it) => it.qty > 0)) {
        toast.error(
          t(
            "gabinet.packages.selectQuantityRequired",
            "Podaj ilość zabiegów do rozliczenia z pakietu",
          ),
        );
        return;
      }
    } else {
      const normalizedAmount = paymentAmount.replace(",", ".");
      if (!paymentAmount || isNaN(parseFloat(normalizedAmount))) {
        toast.error(t("gabinet.payments.amountRequired"));
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (onBeforeSubmit) {
        await onBeforeSubmit();
      }

      if (splitPayment) {
        const parts: Array<{
          method: (typeof PAYMENT_METHODS)[number];
          amount: number;
        }> = [];
        if (parsedFirstSplit > 0)
          parts.push({ method: firstSplitMethod, amount: parsedFirstSplit });
        if (parsedSecondSplit > 0)
          parts.push({ method: secondSplitMethod, amount: parsedSecondSplit });

        if (parts.length === 0 && splitCreditApplied > 0) {
          // Credit covers the whole visit: record a credit-only ledger row.
          await createPayment({
            organizationId,
            patientId: patientId as Id<"gabinetPatients">,
            appointmentId: appointmentId as Id<"gabinetAppointments">,
            amount: 0,
            currency: "PLN",
            paymentMethod: firstSplitMethod,
            notes: paymentNote || undefined,
            creditApplied: splitCreditApplied,
          });
        } else {
          // Distribute outstanding across split rows; credit attaches to first row.
          let remainingExpected = splitExpectedTotal;
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const splitPackageId =
              i === 0 ? firstSplitPackageId : secondSplitPackageId;
            const splitPackageItems =
              i === 0 ? firstSplitPackageItems : secondSplitPackageItems;
            if (part.method === "package" && splitPackageId) {
              const pkgItems = splitPackageItems
                .filter((it) => it.qty > 0)
                .map((it) => ({
                  treatmentId: it.treatmentId,
                  ...(it.variantId ? { variantId: it.variantId } : {}),
                  quantity: it.qty,
                }));
              if (pkgItems.length > 0) {
                await usePackageTreatmentsBatch({
                  organizationId,
                  usageId: splitPackageId,
                  items: pkgItems,
                  appointmentId,
                });
              }
            }
            const splitNote = `split: ${part.method}`;
            const combinedNote = paymentNote
              ? `${paymentNote} (${splitNote})`
              : splitNote;
            const absorbedOutstanding = Math.min(
              part.amount,
              remainingExpected,
            );
            const rowCreditEarned =
              Math.round((part.amount - absorbedOutstanding) * 100) / 100;
            remainingExpected =
              Math.round((remainingExpected - absorbedOutstanding) * 100) / 100;
            await createPayment({
              organizationId,
              patientId: patientId as Id<"gabinetPatients">,
              appointmentId: appointmentId as Id<"gabinetAppointments">,
              amount: part.amount,
              currency: "PLN",
              paymentMethod: part.method,
              notes: combinedNote,
              ...(i === 0 && splitCreditApplied > 0
                ? { creditApplied: splitCreditApplied }
                : {}),
              ...(rowCreditEarned > 0 ? { creditEarned: rowCreditEarned } : {}),
            });
          }
        }
      } else {
        // Package redemption derives the ledger amount from quantities; other
        // methods use the user-entered amount.
        const normalizedAmount = paymentAmount.replace(",", ".");
        const amount =
          paymentMethod === "package"
            ? packageSettleAmount
            : parseFloat(normalizedAmount);
        const outstandingNow = Math.max(0, outstanding);
        const creditEarned =
          amount > outstandingNow + 0.005
            ? Math.round((amount - outstandingNow) * 100) / 100
            : 0;
        const creditApplied =
          paymentUseBalance && balanceAvailable > 0
            ? Math.round(
                Math.min(
                  balanceAvailable,
                  Math.max(0, outstandingNow - amount),
                ) * 100,
              ) / 100
            : 0;

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
      }

      if (showMarkCompleted && markCompleted && onMarkCompleted) {
        await onMarkCompleted();
      }

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
      <div className="grid sm:grid-cols-2 gap-x-4 gap-y-4 py-4">
        {/* ── Płatność: realny przepływ pieniędzy (gotówka/karta/przelew/…) ── */}
        {!splitPayment && (
          <div className="space-y-4 rounded-md border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("gabinet.payments.sectionPayment", "Płatność")}
            </p>
            <div>
              <Label>{t("gabinet.payments.method")}</Label>
              <Select
                value={paymentMethod === "package" ? "" : paymentMethod}
                onValueChange={(v) => {
                  setPaymentMethod(v);
                  if (v === "gratis" || v === "barter") {
                    setPaymentAmount(treatmentPrice.toFixed(2));
                  }
                  setPaymentPackageId(null);
                  setPaymentPackageItems([]);
                }}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t(
                      "gabinet.payments.packageModeActive",
                      "— rozliczenie z pakietu —",
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {PAY_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {t(`gabinet.payments.methods.${m}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {paymentMethod === "package" ? (
              <div className="rounded-md border bg-muted/30 p-2.5">
                <p className="text-sm">
                  {t(
                    "gabinet.payments.packageQuantityInfo",
                    "Rozliczenie ilościowe z pakietu — bez płatności.",
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("gabinet.payments.packageSettleValue", {
                    amount: formatCurrencyPLN(packageSettleAmount),
                    defaultValue: "Wartość rozliczenia: {{amount}}",
                  })}
                </p>
                {outstanding > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("gabinet.payments.outstanding")}:{" "}
                    {formatCurrencyPLN(outstanding)}
                  </p>
                )}
              </div>
            ) : (
              <div>
                <Label>{t("gabinet.payments.amount")}</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={
                    isFixedAmountMethod
                      ? treatmentPrice.toFixed(2)
                      : paymentAmount
                  }
                  disabled={isFixedAmountMethod}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                      setPaymentAmount(v);
                    }
                  }}
                  placeholder={
                    outstanding > 0 ? outstanding.toFixed(2) : "0.00"
                  }
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
            )}
            {paymentMethod !== "package" &&
              !isFixedAmountMethod &&
              outstanding > 0 && (
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
                                    ((outstanding * Math.min(parsed, 100)) /
                                      100) *
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
          </div>
        )}

        {/* ── Rozliczenie z wykupionych: pakiety/karnety + saldo nadpłat ── */}
        <div className="space-y-4 rounded-md border p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("gabinet.payments.sectionRedeem", "Rozliczenie z wykupionych")}
          </p>
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
          {!splitPayment && (
            <div>
              <Label>
                {t("gabinet.payments.redeemFromPackage", "Pakiet / karnet")}
              </Label>
              {eligiblePackages.length === 0 ? (
                <p className="text-sm text-muted-foreground mt-1">
                  {t("gabinet.packages.noActivePackages")}
                </p>
              ) : (
                <Select
                  value={
                    paymentMethod === "package" ? (paymentPackageId ?? "") : ""
                  }
                  onValueChange={(pkgId) => {
                    if (pkgId === "__none__") {
                      setPaymentMethod("cash");
                      setPaymentPackageId(null);
                      setPaymentPackageItems([]);
                      return;
                    }
                    setPaymentMethod("package");
                    setPaymentPackageId(pkgId);
                    const pkg = eligiblePackages.find((p) => p._id === pkgId);
                    setPaymentPackageItems(
                      (pkg?.treatmentsUsed ?? [])
                        .filter((e) => (e.usedCount ?? 0) < (e.totalCount ?? 0))
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
                        "gabinet.payments.noRedeem",
                        "Nie rozliczaj z pakietu",
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      {t(
                        "gabinet.payments.noRedeem",
                        "Nie rozliczaj z pakietu",
                      )}
                    </SelectItem>
                    {eligiblePackages.map((pkg) => (
                      <SelectItem key={pkg._id} value={pkg._id}>
                        {pkg.packageName ?? t("gabinet.packages.package")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </div>

        {/* Package redemption items — the package itself is picked in the
            Rozliczenie section above; here the user assigns quantities. */}
        {!splitPayment && paymentMethod === "package" && paymentPackageId && (
          <div className="space-y-3 rounded-md border p-3 sm:col-span-2">
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

        {/* Split payment toggle */}
        <div className="flex items-center gap-2 sm:col-span-2">
          <input
            type="checkbox"
            id="settlement-split-payment"
            checked={splitPayment}
            onChange={(e) => {
              setSplitPayment(e.target.checked);
              if (!e.target.checked) {
                setFirstSplitAmount("");
                setSecondSplitAmount("");
                setFirstSplitPackageId(null);
                setFirstSplitPackageItems([]);
                setSecondSplitPackageId(null);
                setSecondSplitPackageItems([]);
              }
            }}
          />
          <Label
            htmlFor="settlement-split-payment"
            className="cursor-pointer font-normal"
          >
            {t("gabinet.packages.splitPayment", "Podziel płatność")}
          </Label>
        </div>

        {splitPayment && (
          <div className="rounded-lg border p-3 space-y-3 sm:col-span-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border p-2 space-y-2">
                <Label className="text-xs font-medium">
                  {t("gabinet.packages.firstMethod", "Pierwsza metoda")}
                </Label>
                <Select
                  value={firstSplitMethod}
                  onValueChange={(v) => {
                    setFirstSplitMethod(v as (typeof PAYMENT_METHODS)[number]);
                    if (v === "gratis" || v === "barter") {
                      setFirstSplitAmount(treatmentPrice.toFixed(2));
                    }
                    if (v !== "package") {
                      setFirstSplitPackageId(null);
                      setFirstSplitPackageItems([]);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>
                        {t("gabinet.payments.groupPayment", "Metody płatności")}
                      </SelectLabel>
                      {PAY_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {t(`gabinet.payments.methods.${m}`)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>
                        {t("gabinet.payments.groupRedeem", "Metody rozliczeń")}
                      </SelectLabel>
                      <SelectItem value="package">
                        {t("gabinet.payments.methods.package")}
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={
                    isFirstSplitFixed
                      ? treatmentPrice.toFixed(2)
                      : firstSplitAmount
                  }
                  disabled={isFirstSplitFixed}
                  onChange={(e) => {
                    if (isFirstSplitFixed) return;
                    const v = e.target.value;
                    if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                      setFirstSplitAmount(v);
                    }
                  }}
                />
                {isFirstSplitFixed && (
                  <p className="text-xs text-muted-foreground">
                    {t("gabinet.payments.amountLockedToTreatment")}
                  </p>
                )}
              </div>
              <div className="rounded-md border p-2 space-y-2">
                <Label className="text-xs font-medium">
                  {t("gabinet.packages.secondMethod", "Druga metoda")}
                </Label>
                <Select
                  value={secondSplitMethod}
                  onValueChange={(v) => {
                    setSecondSplitMethod(v as (typeof PAYMENT_METHODS)[number]);
                    if (v === "gratis" || v === "barter") {
                      setSecondSplitAmount(treatmentPrice.toFixed(2));
                    }
                    if (v !== "package") {
                      setSecondSplitPackageId(null);
                      setSecondSplitPackageItems([]);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>
                        {t("gabinet.payments.groupPayment", "Metody płatności")}
                      </SelectLabel>
                      {PAY_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {t(`gabinet.payments.methods.${m}`)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>
                        {t("gabinet.payments.groupRedeem", "Metody rozliczeń")}
                      </SelectLabel>
                      <SelectItem value="package">
                        {t("gabinet.payments.methods.package")}
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={
                    isSecondSplitFixed
                      ? treatmentPrice.toFixed(2)
                      : secondSplitAmount
                  }
                  disabled={isSecondSplitFixed}
                  onChange={(e) => {
                    if (isSecondSplitFixed) return;
                    const v = e.target.value;
                    if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                      setSecondSplitAmount(v);
                    }
                  }}
                />
                {isSecondSplitFixed && (
                  <p className="text-xs text-muted-foreground">
                    {t("gabinet.payments.amountLockedToTreatment")}
                  </p>
                )}
              </div>
            </div>
            {firstSplitMethod === "package" && (
              <div className="rounded-md border p-3 space-y-2">
                <Label className="text-xs font-medium">
                  {t("gabinet.packages.selectPackage")} (
                  {t("gabinet.packages.firstMethod", "Pierwsza metoda")})
                </Label>
                {eligiblePackages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("gabinet.packages.noActivePackages")}
                  </p>
                ) : (
                  <Select
                    value={firstSplitPackageId ?? ""}
                    onValueChange={(pkgId) => {
                      setFirstSplitPackageId(pkgId);
                      const pkg = eligiblePackages.find((p) => p._id === pkgId);
                      setFirstSplitPackageItems(
                        (pkg?.treatmentsUsed ?? [])
                          .filter(
                            (e) => (e.usedCount ?? 0) < (e.totalCount ?? 0),
                          )
                          .map((e) => ({
                            treatmentId: e.treatmentId,
                            variantId: e.variantId,
                            treatmentName:
                              e.treatmentName ??
                              t("gabinet.packages.treatment"),
                            remaining: (e.totalCount ?? 0) - (e.usedCount ?? 0),
                            qty: 0,
                          })),
                      );
                    }}
                  >
                    <SelectTrigger>
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
                {firstSplitPackageId && (
                  <div className="space-y-2">
                    {firstSplitPackageItems.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {t("gabinet.packages.allTreatmentsExhausted")}
                      </p>
                    ) : (
                      firstSplitPackageItems.map((item, idx) => (
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
                              setFirstSplitPackageItems((prev) =>
                                prev.map((it, i) =>
                                  i === idx ? { ...it, qty: val } : it,
                                ),
                              );
                            }}
                          />
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
            {secondSplitMethod === "package" && (
              <div className="rounded-md border p-3 space-y-2">
                <Label className="text-xs font-medium">
                  {t("gabinet.packages.selectPackage")} (
                  {t("gabinet.packages.secondMethod", "Druga metoda")})
                </Label>
                {eligiblePackages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("gabinet.packages.noActivePackages")}
                  </p>
                ) : (
                  <Select
                    value={secondSplitPackageId ?? ""}
                    onValueChange={(pkgId) => {
                      setSecondSplitPackageId(pkgId);
                      const pkg = eligiblePackages.find((p) => p._id === pkgId);
                      setSecondSplitPackageItems(
                        (pkg?.treatmentsUsed ?? [])
                          .filter(
                            (e) => (e.usedCount ?? 0) < (e.totalCount ?? 0),
                          )
                          .map((e) => ({
                            treatmentId: e.treatmentId,
                            variantId: e.variantId,
                            treatmentName:
                              e.treatmentName ??
                              t("gabinet.packages.treatment"),
                            remaining: (e.totalCount ?? 0) - (e.usedCount ?? 0),
                            qty: 0,
                          })),
                      );
                    }}
                  >
                    <SelectTrigger>
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
                {secondSplitPackageId && (
                  <div className="space-y-2">
                    {secondSplitPackageItems.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {t("gabinet.packages.allTreatmentsExhausted")}
                      </p>
                    ) : (
                      secondSplitPackageItems.map((item, idx) => (
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
                              setSecondSplitPackageItems((prev) =>
                                prev.map((it, i) =>
                                  i === idx ? { ...it, qty: val } : it,
                                ),
                              );
                            }}
                          />
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
            <div
              className={`flex items-center justify-between text-xs ${
                splitMismatch || splitSameMethod
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}
            >
              <span>
                {t("gabinet.packages.splitSum", "Suma")}:{" "}
                {formatCurrencyPLN(splitTotal)}
                {` / ${formatCurrencyPLN(splitExpectedTotal)}`}
              </span>
              {splitSameMethod ? (
                <span>
                  {t(
                    "gabinet.packages.splitSameMethod",
                    "Metody muszą się różnić",
                  )}
                </span>
              ) : splitMismatch ? (
                <span>
                  {t(
                    "gabinet.packages.splitUnderpaid",
                    "Kwota jest niższa niż cena",
                  )}
                </span>
              ) : null}
            </div>
            {splitOverpayment > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {t("gabinet.payments.overpaymentToCredit", {
                  amount: formatCurrencyPLN(splitOverpayment),
                })}
              </p>
            )}
          </div>
        )}

        <div className="sm:col-span-2">
          <Label>{t("common.notes")}</Label>
          <RichTextEditor
            value={paymentNote}
            onChange={(val) => setPaymentNote(val ?? "")}
            placeholder={t("gabinet.payments.notePlaceholder")}
            minHeight="80px"
          />
        </div>

        {showMarkCompleted && (
          <label className="flex items-start gap-2 text-sm cursor-pointer sm:col-span-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={markCompleted}
              onChange={(e) => setMarkCompleted(e.target.checked)}
            />
            <span className="leading-tight">
              {t("gabinet.appointmentDetail.settleMarkCompleted", {
                defaultValue: "Oznacz wizytę jako zakończoną",
              })}
            </span>
          </label>
        )}
      </div>

      <DialogFooter
        className={
          extraFooterContent
            ? "flex-col-reverse gap-2 sm:flex-row sm:justify-between"
            : undefined
        }
      >
        {extraFooterContent}
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={
              isSubmitting ||
              (splitPayment &&
                (splitMissingAmount || splitMismatch || splitSameMethod))
            }
          >
            {isSubmitting
              ? t("common.processing")
              : t("gabinet.payments.create")}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
