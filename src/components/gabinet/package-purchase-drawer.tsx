import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  const purchasePackage = useAction(api.gabinet.packages.purchasePackage);
  const createPayment = useAction(api.payments.create);

  const [selectedPkgId, setSelectedPkgId] = useState<string>("");
  const [paymentType, setPaymentType] = useState<"one_time" | "installment">("one_time");
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [splitPayment, setSplitPayment] = useState(false);
  const [firstSplitMethod, setFirstSplitMethod] = useState<"cash" | "card" | "transfer" | "other">("cash");
  const [secondSplitMethod, setSecondSplitMethod] = useState<"cash" | "card" | "transfer" | "other">("card");
  const [firstSplitAmount, setFirstSplitAmount] = useState<string>("");
  const [secondSplitAmount, setSecondSplitAmount] = useState<string>("");
  const [installmentCount, setInstallmentCount] = useState<string>("2");
  const [submitting, setSubmitting] = useState(false);

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

  const isOneTime = paymentType === "one_time";
  const isInstallment = paymentType === "installment";

  const parsedInstallmentCount = Math.max(2, Math.min(4, Number.parseInt(installmentCount, 10) || 2));
  const installmentAmount = selectedPkg
    ? Math.round((selectedPkg.totalPrice / parsedInstallmentCount) * 100) / 100
    : 0;
  const installmentRemainder = selectedPkg
    ? Math.round((selectedPkg.totalPrice - installmentAmount * parsedInstallmentCount) * 100) / 100
    : 0;
  const firstInstallmentAmount = selectedPkg
    ? Math.round((installmentAmount + installmentRemainder) * 100) / 100
    : 0;

  const parsedFirstSplit = Number.parseFloat(firstSplitAmount) || 0;
  const parsedSecondSplit = Number.parseFloat(secondSplitAmount) || 0;
  const splitTotal = Math.round((parsedFirstSplit + parsedSecondSplit) * 100) / 100;
  const splitExpectedTotal = selectedPkg
    ? isInstallment
      ? firstInstallmentAmount
      : Math.round(selectedPkg.totalPrice * 100) / 100
    : 0;
  const splitMismatch = splitPayment && selectedPkg && splitTotal !== splitExpectedTotal;
  const splitMissingMethod = splitPayment && parsedFirstSplit <= 0 && parsedSecondSplit <= 0;
  const splitSameMethod = splitPayment && firstSplitMethod === secondSplitMethod;

  const resetForm = () => {
    setSelectedPkgId("");
    setPaymentType("one_time");
    setPaymentMethod("cash");
    setSplitPayment(false);
    setFirstSplitMethod("cash");
    setSecondSplitMethod("card");
    setFirstSplitAmount("");
    setSecondSplitAmount("");
    setInstallmentCount("2");
  };

  const handlePurchase = async () => {
    if (!selectedPkg) return;
    if (splitPayment) {
      if (splitMissingMethod) {
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
        paidAmount: selectedPkg.totalPrice,
        paymentMethod: usagePaymentMethod,
      });

      if (isInstallment) {
        if (splitPayment) {
          const parts: Array<{ method: "cash" | "card" | "transfer" | "other"; amount: number }> = [];
          if (parsedFirstSplit > 0)
            parts.push({ method: firstSplitMethod, amount: parsedFirstSplit });
          if (parsedSecondSplit > 0)
            parts.push({ method: secondSplitMethod, amount: parsedSecondSplit });
          for (const part of parts) {
            await createPayment({
              organizationId,
              patientId: patientId as Id<"gabinetPatients">,
              packageUsageId: usageId,
              amount: part.amount,
              currency,
              paymentMethod: part.method,
              notes: `Package: ${selectedPkg.name} (installment 1/${parsedInstallmentCount} split: ${part.method})`,
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
        const parts: Array<{ method: "cash" | "card" | "transfer" | "other"; amount: number }> = [];
        if (parsedFirstSplit > 0)
          parts.push({ method: firstSplitMethod, amount: parsedFirstSplit });
        if (parsedSecondSplit > 0)
          parts.push({ method: secondSplitMethod, amount: parsedSecondSplit });
        for (const part of parts) {
          await createPayment({
            organizationId,
            patientId: patientId as Id<"gabinetPatients">,
            packageUsageId: usageId,
            amount: part.amount,
            currency,
            paymentMethod: part.method,
            notes: `Package: ${selectedPkg.name} (split: ${part.method})`,
          });
        }
      } else {
        await createPayment({
          organizationId,
          patientId: patientId as Id<"gabinetPatients">,
          packageUsageId: usageId,
          amount: selectedPkg.totalPrice,
          currency,
          paymentMethod: paymentMethod as "cash" | "card" | "transfer",
          notes: `Package: ${selectedPkg.name}`,
        });
      }

      toast.success(t("gabinet.packages.purchased", "Package purchased successfully"));
      resetForm();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
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
                <p className="text-xs text-muted-foreground">{selectedPkg.description}</p>
              )}
              <div className="space-y-1">
                {selectedPkg.treatments.map((tr) => (
                  <div key={String(tr.treatmentId)} className="flex items-center justify-between text-xs">
                    <span>{treatmentMap.get(tr.treatmentId) ?? t("common.unknown")}</span>
                    <span className="text-muted-foreground">&times;{tr.quantity}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-1 border-t text-sm">
                <span className="font-medium">{t("gabinet.packages.totalPrice")}</span>
                <span className="font-bold">{selectedPkg.totalPrice} {selectedPkg.currency ?? "PLN"}</span>
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

          <div className="flex items-center gap-2">
            <Checkbox
              id="split-payment"
              checked={splitPayment}
              onCheckedChange={(v) => setSplitPayment(v === true)}
            />
            <Label htmlFor="split-payment" className="cursor-pointer text-sm font-normal">
              {isInstallment
                ? t(
                    "gabinet.packages.splitFirstInstallment",
                    "Split first installment",
                  )
                : t("gabinet.packages.splitPayment", "Split payment")}
            </Label>
          </div>

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
                  {installmentAmount.toFixed(2)} {selectedPkg.currency ?? "PLN"}
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
            <div className="rounded-lg border p-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border p-2 space-y-2">
                  <Label className="text-xs font-medium">
                    {t("gabinet.packages.firstMethod", "First method")}
                  </Label>
                  <Select
                    value={firstSplitMethod}
                    onValueChange={(v) =>
                      setFirstSplitMethod(v as typeof firstSplitMethod)
                    }
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
                    id="split-first-amount"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={firstSplitAmount}
                    onChange={(e) => setFirstSplitAmount(e.target.value)}
                  />
                </div>
                <div className="rounded-md border p-2 space-y-2">
                  <Label className="text-xs font-medium">
                    {t("gabinet.packages.secondMethod", "Second method")}
                  </Label>
                  <Select
                    value={secondSplitMethod}
                    onValueChange={(v) =>
                      setSecondSplitMethod(v as typeof secondSplitMethod)
                    }
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
                    id="split-second-amount"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={secondSplitAmount}
                    onChange={(e) => setSecondSplitAmount(e.target.value)}
                  />
                </div>
              </div>
              <div
                className={`flex items-center justify-between text-xs ${
                  splitMismatch || splitSameMethod ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                <span>
                  {t("gabinet.packages.splitSum", "Sum")}: {splitTotal.toFixed(2)} /{" "}
                  {splitExpectedTotal.toFixed(2)} {selectedPkg?.currency ?? "PLN"}
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

        </div>

        <SheetFooter className="border-t pt-4">
          <Button
            className="w-full"
            disabled={
              !selectedPkg ||
              submitting ||
              (splitPayment && (splitMissingMethod || !!splitMismatch || splitSameMethod))
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
