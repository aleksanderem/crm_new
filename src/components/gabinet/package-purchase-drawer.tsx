import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "@/lib/ez-icons";
import { PlateText } from "@/components/plate-text";
import { formatActionError } from "@/lib/format-action-error";
import { formatCurrencyPLN } from "@/lib/format-currency";
import { usePackagePaymentForm } from "@/hooks/use-package-payment-form";
import { PackageSplitPaymentSection } from "./package-split-payment-section";
import { useSupabaseGabinetEmployeesList } from "@/hooks/use-supabase-gabinet-employees";

interface PackagePurchaseDrawerProps {
  patientId: string;
  organizationId: Id<"organizations">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PackagePurchaseDrawer({
  patientId,
  organizationId,
  open,
  onOpenChange,
}: PackagePurchaseDrawerProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const purchasePackage = useAction(api.gabinet.packages.purchasePackage);
  const createPayment = useAction(api.payments.create);

  const [selectedPkgId, setSelectedPkgId] = useState<string>("");
  const [soldByEmployeeId, setSoldByEmployeeId] = useState<string>("");
  const [paymentType, setPaymentType] = useState<"one_time" | "installment">("one_time");
  const [installmentCount, setInstallmentCount] = useState<string>("2");
  const [discountType, setDiscountType] = useState<"amount" | "percent">("amount");
  const [discountValue, setDiscountValue] = useState<string>("");

  const { data: employeesData } = useSupabaseGabinetEmployeesList(String(organizationId), { activeOnly: true, enabled: open });

  const listActivePackages = useAction(api.gabinet.packages.listActive);
  const { data: activePackages } = useQuery({
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

  const selectedPkg = (activePackages ?? []).find((p) => p._id === selectedPkgId);

  const basePrice = selectedPkg?.totalPrice ?? 0;
  const parsedDiscountValue = Number.parseFloat(discountValue.replace(",", ".")) || 0;
  const discountAmount =
    basePrice > 0
      ? discountType === "amount"
        ? Math.min(parsedDiscountValue, basePrice)
        : Math.round((basePrice * Math.min(parsedDiscountValue, 100)) / 100 * 100) / 100
      : 0;
  const finalPrice = Math.round(Math.max(0, basePrice - discountAmount) * 100) / 100;

  const isOneTime = paymentType === "one_time";
  const isInstallment = paymentType === "installment";

  const parsedInstallmentCount = Math.max(2, Math.min(4, Number.parseInt(installmentCount, 10) || 2));
  const installmentAmount = selectedPkg
    ? Math.round((finalPrice / parsedInstallmentCount) * 100) / 100
    : 0;
  const installmentRemainder = selectedPkg
    ? Math.round((finalPrice - installmentAmount * parsedInstallmentCount) * 100) / 100
    : 0;
  const firstInstallmentAmount = selectedPkg
    ? Math.round((installmentAmount + installmentRemainder) * 100) / 100
    : 0;

  const effectiveTotalForSplit = selectedPkg
    ? isInstallment
      ? firstInstallmentAmount
      : finalPrice
    : 0;

  const {
    paymentMethod,
    setPaymentMethod,
    splitPayment,
    setSplitPayment,
    firstSplitMethod,
    setFirstSplitMethod,
    secondSplitMethod,
    setSecondSplitMethod,
    firstSplitAmount,
    setFirstSplitAmount,
    secondSplitAmount,
    setSecondSplitAmount,
    submitting,
    setSubmitting,
    parsedFirstSplit,
    parsedSecondSplit,
    splitTotal,
    splitExpectedTotal,
    splitMismatch,
    splitMissingAmount,
    splitSameMethod,
    resetPaymentForm,
  } = usePackagePaymentForm(effectiveTotalForSplit);

  const resetForm = () => {
    setSelectedPkgId("");
    setSoldByEmployeeId("");
    setPaymentType("one_time");
    setInstallmentCount("2");
    setDiscountType("amount");
    setDiscountValue("");
    resetPaymentForm();
  };

  const handlePurchase = async () => {
    if (!selectedPkg) return;
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
    }
    setSubmitting(true);
    try {
      const currency = selectedPkg.currency ?? "PLN";
      let usagePaymentMethod = paymentMethod;
      if (splitPayment) usagePaymentMethod = "split";
      if (isInstallment) usagePaymentMethod = "installment";
      const usageId = await purchasePackage({
        organizationId,
        patientId,
        packageId: selectedPkg._id,
        paidAmount: finalPrice,
        paymentMethod: usagePaymentMethod,
        soldByEmployeeId: soldByEmployeeId || undefined,
      });

      const discountFields =
        discountAmount > 0
          ? {
              discountAmount,
              discountPercent:
                discountType === "percent"
                  ? parsedDiscountValue
                  : Math.round((discountAmount / basePrice) * 10000) / 100,
            }
          : {};

      if (isInstallment) {
        if (splitPayment) {
          const parts: Array<{ method: typeof firstSplitMethod; amount: number }> = [];
          if (parsedFirstSplit > 0)
            parts.push({ method: firstSplitMethod, amount: parsedFirstSplit });
          if (parsedSecondSplit > 0)
            parts.push({ method: secondSplitMethod, amount: parsedSecondSplit });
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            await createPayment({
              organizationId,
              patientId: patientId as Id<"gabinetPatients">,
              packageUsageId: usageId,
              amount: part.amount,
              currency,
              paymentMethod: part.method,
              notes: `Package: ${selectedPkg.name} (installment 1/${parsedInstallmentCount} split: ${part.method})`,
              ...(i === 0 ? discountFields : {}),
            });
          }
        } else {
          await createPayment({
            organizationId,
            patientId: patientId as Id<"gabinetPatients">,
            packageUsageId: usageId,
            amount: firstInstallmentAmount,
            currency,
            paymentMethod: paymentMethod as "cash" | "card" | "transfer" | "other",
            notes: `Package: ${selectedPkg.name} (installment 1/${parsedInstallmentCount})`,
            ...discountFields,
          });
        }
        for (let i = 2; i <= parsedInstallmentCount; i++) {
          await createPayment({
            organizationId,
            patientId: patientId as Id<"gabinetPatients">,
            packageUsageId: usageId,
            amount: installmentAmount,
            currency,
            paymentMethod: paymentMethod as "cash" | "card" | "transfer" | "other",
            notes: `Package: ${selectedPkg.name} (installment ${i}/${parsedInstallmentCount})`,
            status: "pending",
          });
        }
      } else if (splitPayment) {
        const parts: Array<{ method: typeof firstSplitMethod; amount: number }> = [];
        if (parsedFirstSplit > 0)
          parts.push({ method: firstSplitMethod, amount: parsedFirstSplit });
        if (parsedSecondSplit > 0)
          parts.push({ method: secondSplitMethod, amount: parsedSecondSplit });
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          await createPayment({
            organizationId,
            patientId: patientId as Id<"gabinetPatients">,
            packageUsageId: usageId,
            amount: part.amount,
            currency,
            paymentMethod: part.method,
            notes: `Package: ${selectedPkg.name} (split: ${part.method})`,
            ...(i === 0 ? discountFields : {}),
          });
        }
      } else {
        await createPayment({
          organizationId,
          patientId: patientId as Id<"gabinetPatients">,
          packageUsageId: usageId,
          amount: finalPrice,
          currency,
          paymentMethod: paymentMethod as "cash" | "card" | "transfer",
          notes: `Package: ${selectedPkg.name}`,
          ...discountFields,
        });
      }

      toast.success(t("gabinet.packages.purchased", "Package purchased successfully"));
      await queryClient.invalidateQueries({
        queryKey: ["gabinet.packages.getPatientPackages", organizationId, patientId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["gabinet.packages.listActive", organizationId],
      });
      resetForm();
      onOpenChange(false);
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.packages.errors.purchaseFailed",
          defaultValue: "Nie udało się sprzedać pakietu.",
        }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      resetForm();
    }
    onOpenChange(v);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="flex flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("gabinet.packages.purchasePackage", "Purchase Package")}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-5">
          {(employeesData ?? []).length > 0 && (
            <div className="space-y-1.5">
              <Label>{t("gabinet.packages.soldBy", "Sprzedał/a")}</Label>
              <Select value={soldByEmployeeId} onValueChange={setSoldByEmployeeId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("gabinet.packages.soldByPlaceholder", "Wybierz pracownika (opcjonalnie)")} />
                </SelectTrigger>
                <SelectContent>
                  {(employeesData ?? []).map((e) => (
                    <SelectItem key={e._id} value={e._id}>
                      {[e.firstName, e.lastName].filter(Boolean).join(" ") || e._id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t("gabinet.packages.selectPackage", "Package")}</Label>
            <Select value={selectedPkgId} onValueChange={setSelectedPkgId}>
              <SelectTrigger>
                <SelectValue placeholder={t("gabinet.packages.selectPackagePlaceholder", "Select a package...")} />
              </SelectTrigger>
              <SelectContent>
                {(activePackages ?? []).map((pkg) => (
                  <SelectItem key={pkg._id} value={pkg._id}>
                    {pkg.name} — {pkg.totalPrice} {pkg.currency ?? "PLN"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedPkg && (
            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-sm font-medium">{selectedPkg.name}</p>
              {selectedPkg.description && (
                <p className="text-xs text-muted-foreground">
                  <PlateText value={selectedPkg.description} />
                </p>
              )}
              <div className="space-y-1">
                {selectedPkg.treatments.map((tr) => (
                  <div key={String(tr.treatmentId)} className="flex items-center justify-between text-xs">
                    <span>{treatmentMap.get(tr.treatmentId) ?? t("common.unknown")}</span>
                    <span className="text-muted-foreground">&times;{tr.quantity}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {t("gabinet.payments.discount")}
                </span>
                <div className="flex items-center gap-1.5">
                  <div className="flex rounded-md border overflow-hidden text-xs">
                    <button
                      type="button"
                      onClick={() => { setDiscountType("amount"); setDiscountValue(""); }}
                      className={`px-2 py-0.5 transition-colors ${discountType === "amount" ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                    >
                      PLN
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDiscountType("percent"); setDiscountValue(""); }}
                      className={`px-2 py-0.5 transition-colors ${discountType === "percent" ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                    >
                      %
                    </button>
                  </div>
                  <div className="relative w-20">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={discountValue}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                          setDiscountValue(v);
                        }
                      }}
                      placeholder="0"
                      className={`h-7 text-xs ${discountType === "percent" ? "pr-5" : ""}`}
                    />
                    {discountType === "percent" && (
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
                    )}
                  </div>
                </div>
              </div>
              {discountAmount > 0 && (
                <div className="flex items-center justify-between text-xs text-destructive">
                  <span>{t("gabinet.payments.discount")}</span>
                  <span>- {formatCurrencyPLN(discountAmount, selectedPkg.currency ?? "PLN")}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-1 border-t text-sm">
                <span className="font-medium">
                  {discountAmount > 0
                    ? t("gabinet.payments.discountedPrice")
                    : t("gabinet.packages.totalPrice")}
                </span>
                <span className="font-bold">{formatCurrencyPLN(finalPrice, selectedPkg.currency ?? "PLN")}</span>
              </div>
              {selectedPkg.validityDays && (
                <p className="text-xs text-muted-foreground">
                  {t("gabinet.packages.validFor", "Valid for")} {selectedPkg.validityDays} {t("gabinet.packages.days")}
                </p>
              )}
            </div>
          )}

          <div
            role="radiogroup"
            aria-label={t("gabinet.packages.paymentType", "Payment type")}
            className="grid grid-cols-2 gap-2"
          >
            <button
              type="button"
              role="radio"
              aria-checked={isOneTime}
              onClick={() => setPaymentType("one_time")}
              className={`rounded-lg border p-3 text-left transition-colors ${
                isOneTime
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:bg-accent"
              }`}
            >
              <p className="text-sm font-medium">
                {t("gabinet.packages.paymentTypeOneTime", "One-time payment")}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("gabinet.packages.paymentTypeOneTimeHint", "Pay full amount now")}
              </p>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={isInstallment}
              onClick={() => setPaymentType("installment")}
              className={`rounded-lg border p-3 text-left transition-colors ${
                isInstallment
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:bg-accent"
              }`}
            >
              <p className="text-sm font-medium">
                {t("gabinet.packages.paymentTypeInstallment", "Installments")}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("gabinet.packages.paymentTypeInstallmentHint", "Split into scheduled installments")}
              </p>
            </button>
          </div>

          <div className="space-y-1.5">
            <Label>{t("gabinet.packages.paymentMethod", "Payment Method")}</Label>
            <Select
              value={paymentMethod}
              onValueChange={setPaymentMethod}
              disabled={isOneTime && splitPayment}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">{t("gabinet.packages.paymentMethods.cash", "Cash")}</SelectItem>
                <SelectItem value="card">{t("gabinet.packages.paymentMethods.card", "Card")}</SelectItem>
                <SelectItem value="transfer">{t("gabinet.packages.paymentMethods.transfer", "Transfer")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Label
            htmlFor="split-payment"
            className="-mx-2 flex min-h-11 select-none items-center gap-3 rounded-md px-2 py-2.5 cursor-pointer text-sm font-normal transition-colors hover:bg-accent/40 active:bg-accent"
          >
            <Checkbox
              id="split-payment"
              checked={splitPayment}
              onCheckedChange={(v) => setSplitPayment(v === true)}
            />
            {isInstallment
              ? t(
                  "gabinet.packages.splitFirstInstallment",
                  "Split first installment",
                )
              : t("gabinet.packages.splitPayment", "Split payment")}
          </Label>

          {isInstallment && selectedPkg && (
            <div className="rounded-lg border p-3 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="installment-count" className="text-xs font-medium">
                  {t("gabinet.packages.installmentCount", "Number of installments")}
                </Label>
                <Select
                  value={installmentCount}
                  onValueChange={setInstallmentCount}
                >
                  <SelectTrigger id="installment-count">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2, 3, 4].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {t("gabinet.packages.installmentAmount", "Per installment")}
                </span>
                <span className="font-medium">
                  {formatCurrencyPLN(installmentAmount, selectedPkg.currency ?? "PLN")}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t(
                  "gabinet.packages.installmentNote",
                  "The first installment is collected now; remaining installments are recorded as pending and can be marked paid later.",
                )}
              </p>
            </div>
          )}

          {splitPayment && (
            <PackageSplitPaymentSection
              firstSplitMethod={firstSplitMethod}
              onFirstSplitMethodChange={setFirstSplitMethod}
              secondSplitMethod={secondSplitMethod}
              onSecondSplitMethodChange={setSecondSplitMethod}
              firstSplitAmount={firstSplitAmount}
              onFirstSplitAmountChange={setFirstSplitAmount}
              secondSplitAmount={secondSplitAmount}
              onSecondSplitAmountChange={setSecondSplitAmount}
              splitTotal={splitTotal}
              splitExpectedTotal={splitExpectedTotal}
              splitMismatch={splitMismatch}
              splitSameMethod={splitSameMethod}
              currency={selectedPkg?.currency ?? "PLN"}
            />
          )}

        </div>

        <SheetFooter className="border-t pt-4">
          <Button
            className="w-full"
            disabled={
              !selectedPkg ||
              submitting ||
              (splitPayment && (splitMissingAmount || !!splitMismatch || splitSameMethod))
            }
            onClick={handlePurchase}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("gabinet.packages.purchaseButton", "Purchase")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
