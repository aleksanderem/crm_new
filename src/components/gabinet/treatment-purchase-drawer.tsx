import { useMemo, useState } from "react";
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
import { formatActionError } from "@/lib/format-action-error";
import { formatCurrencyPLN } from "@/lib/format-currency";

interface TreatmentPurchaseDrawerProps {
  patientId: string;
  organizationId: Id<"organizations">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type PaymentMethod = "cash" | "card" | "transfer" | "other";

export function TreatmentPurchaseDrawer({
  patientId,
  organizationId,
  open,
  onOpenChange,
}: TreatmentPurchaseDrawerProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // @ts-ignore — TS2589: deep type instantiation in Convex codegen for this action
  const purchaseTreatment = useAction(api.gabinet.packages.purchaseTreatment);
  const createPayment = useAction(api.payments.create);

  const [selectedTreatmentId, setSelectedTreatmentId] = useState<string>("");
  const [sessionCount, setSessionCount] = useState<string>("1");
  const [paymentType, setPaymentType] = useState<"one_time" | "installment">("one_time");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [splitPayment, setSplitPayment] = useState(false);
  const [firstSplitMethod, setFirstSplitMethod] = useState<PaymentMethod>("cash");
  const [secondSplitMethod, setSecondSplitMethod] = useState<PaymentMethod>("card");
  const [firstSplitAmount, setFirstSplitAmount] = useState<string>("");
  const [secondSplitAmount, setSecondSplitAmount] = useState<string>("");
  const [installmentCount, setInstallmentCount] = useState<string>("2");
  const [submitting, setSubmitting] = useState(false);

  const listActiveTreatments = useAction(api.gabinet.treatments.listActive);
  const { data: treatments } = useQuery({
    queryKey: ["gabinet.treatments.listActive", organizationId],
    queryFn: () => listActiveTreatments({ organizationId }),
    enabled: !!organizationId && open,
  });

  const selectedTreatment = (treatments ?? []).find((tr) => tr._id === selectedTreatmentId);

  const parsedSessionCount = Math.max(1, Number.parseInt(sessionCount, 10) || 1);
  const totalPrice = useMemo(
    () =>
      selectedTreatment
        ? Math.round((selectedTreatment.price ?? 0) * parsedSessionCount * 100) / 100
        : 0,
    [selectedTreatment, parsedSessionCount],
  );
  const currency = selectedTreatment?.currency ?? "PLN";

  const isOneTime = paymentType === "one_time";
  const isInstallment = paymentType === "installment";

  const parsedInstallmentCount = Math.max(2, Math.min(4, Number.parseInt(installmentCount, 10) || 2));
  const installmentAmount =
    selectedTreatment ? Math.round((totalPrice / parsedInstallmentCount) * 100) / 100 : 0;
  const installmentRemainder = selectedTreatment
    ? Math.round((totalPrice - installmentAmount * parsedInstallmentCount) * 100) / 100
    : 0;
  const firstInstallmentAmount = selectedTreatment
    ? Math.round((installmentAmount + installmentRemainder) * 100) / 100
    : 0;

  const parsedFirstSplit = Number.parseFloat(firstSplitAmount) || 0;
  const parsedSecondSplit = Number.parseFloat(secondSplitAmount) || 0;
  const splitTotal = Math.round((parsedFirstSplit + parsedSecondSplit) * 100) / 100;
  const splitExpectedTotal = selectedTreatment
    ? isInstallment
      ? firstInstallmentAmount
      : Math.round(totalPrice * 100) / 100
    : 0;
  const splitMismatch = splitPayment && selectedTreatment && splitTotal !== splitExpectedTotal;
  const splitMissingAmount = splitPayment && parsedFirstSplit <= 0 && parsedSecondSplit <= 0;
  const splitSameMethod = splitPayment && firstSplitMethod === secondSplitMethod;

  const resetForm = () => {
    setSelectedTreatmentId("");
    setSessionCount("1");
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
    if (!selectedTreatment) return;
    if (splitPayment) {
      if (splitMissingAmount) {
        toast.error(
          t("gabinet.packages.splitMissingAmount", "Podaj kwotę co najmniej jednej metody płatności"),
        );
        return;
      }
      if (splitMismatch) {
        toast.error(
          t(
            "gabinet.packages.splitMismatchError",
            "Suma rozdzielonych płatności musi być równa cenie",
          ),
        );
        return;
      }
      if (splitSameMethod) {
        toast.error(
          t("gabinet.packages.splitSameMethodError", "Wybierz dwie różne metody płatności"),
        );
        return;
      }
    }
    setSubmitting(true);
    try {
      let usagePaymentMethod: string = paymentMethod;
      if (splitPayment) usagePaymentMethod = "split";
      if (isInstallment) usagePaymentMethod = "installment";

      const usageId = await purchaseTreatment({
        organizationId,
        patientId,
        treatmentId: selectedTreatment._id,
        sessionCount: parsedSessionCount,
        paidAmount: totalPrice,
        paymentMethod: usagePaymentMethod,
      });

      const treatmentName = selectedTreatment.name;

      if (isInstallment) {
        if (splitPayment) {
          const parts: Array<{ method: PaymentMethod; amount: number }> = [];
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
              notes: `Treatment: ${treatmentName} (installment 1/${parsedInstallmentCount} split: ${part.method})`,
            });
          }
        } else {
          await createPayment({
            organizationId,
            patientId: patientId as Id<"gabinetPatients">,
            packageUsageId: usageId,
            amount: firstInstallmentAmount,
            currency,
            paymentMethod,
            notes: `Treatment: ${treatmentName} (installment 1/${parsedInstallmentCount})`,
          });
        }
        for (let i = 2; i <= parsedInstallmentCount; i++) {
          await createPayment({
            organizationId,
            patientId: patientId as Id<"gabinetPatients">,
            packageUsageId: usageId,
            amount: installmentAmount,
            currency,
            paymentMethod,
            notes: `Treatment: ${treatmentName} (installment ${i}/${parsedInstallmentCount})`,
            status: "pending",
          });
        }
      } else if (splitPayment) {
        const parts: Array<{ method: PaymentMethod; amount: number }> = [];
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
            notes: `Treatment: ${treatmentName} (split: ${part.method})`,
          });
        }
      } else {
        await createPayment({
          organizationId,
          patientId: patientId as Id<"gabinetPatients">,
          packageUsageId: usageId,
          amount: totalPrice,
          currency,
          paymentMethod,
          notes: `Treatment: ${treatmentName}`,
        });
      }

      toast.success(t("gabinet.treatments.purchased", "Zabieg sprzedany pomyślnie"));
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
          key: "gabinet.treatments.errors.purchaseFailed",
          defaultValue: "Nie udało się sprzedać zabiegu.",
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
          <SheetTitle>
            {t("gabinet.treatments.purchaseTreatment", "Sprzedaj zabieg")}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-5">
          <div className="space-y-1.5">
            <Label>{t("gabinet.treatments.selectTreatment", "Zabieg")}</Label>
            <Select value={selectedTreatmentId} onValueChange={setSelectedTreatmentId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={t(
                    "gabinet.treatments.selectTreatmentPlaceholder",
                    "Wybierz zabieg...",
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                {(treatments ?? []).map((tr) => (
                  <SelectItem key={tr._id} value={tr._id}>
                    {tr.name} — {formatCurrencyPLN(tr.price ?? 0, tr.currency ?? "PLN")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="session-count">
              {t("gabinet.treatments.sessionCount", "Liczba sesji")}
            </Label>
            <Input
              id="session-count"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={sessionCount}
              onChange={(e) => setSessionCount(e.target.value)}
            />
          </div>

          {selectedTreatment && (
            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-sm font-medium">{selectedTreatment.name}</p>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {t("gabinet.treatments.unitPrice", "Cena za sesję")}
                </span>
                <span>
                  {(selectedTreatment.price ?? 0).toFixed(2)} {currency}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {t("gabinet.treatments.sessionCount", "Liczba sesji")}
                </span>
                <span>&times;{parsedSessionCount}</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t text-sm">
                <span className="font-medium">
                  {t("gabinet.packages.totalPrice", "Cena całkowita")}
                </span>
                <span className="font-bold">
                  {totalPrice.toFixed(2)} {currency}
                </span>
              </div>
            </div>
          )}

          <div
            role="radiogroup"
            aria-label={t("gabinet.packages.paymentType", "Rodzaj płatności")}
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
                {t("gabinet.packages.paymentTypeOneTime", "Płatność jednorazowa")}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("gabinet.packages.paymentTypeOneTimeHint", "Zapłać całą kwotę teraz")}
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
                {t("gabinet.packages.paymentTypeInstallment", "Płatność na raty")}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("gabinet.packages.paymentTypeInstallmentHint", "Rozłóż płatność na raty")}
              </p>
            </button>
          </div>

          <div className="space-y-1.5">
            <Label>{t("gabinet.packages.paymentMethod", "Metoda płatności")}</Label>
            <Select
              value={paymentMethod}
              onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
              disabled={isOneTime && splitPayment}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">
                  {t("gabinet.packages.paymentMethods.cash", "Gotówka")}
                </SelectItem>
                <SelectItem value="card">
                  {t("gabinet.packages.paymentMethods.card", "Karta")}
                </SelectItem>
                <SelectItem value="transfer">
                  {t("gabinet.packages.paymentMethods.transfer", "Przelew")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="treatment-split-payment"
              checked={splitPayment}
              onCheckedChange={(v) => setSplitPayment(v === true)}
            />
            <Label
              htmlFor="treatment-split-payment"
              className="cursor-pointer text-sm font-normal"
            >
              {isInstallment
                ? t("gabinet.packages.splitFirstInstallment", "Podziel pierwszą ratę")
                : t("gabinet.packages.splitPayment", "Podziel płatność")}
            </Label>
          </div>

          {isInstallment && selectedTreatment && (
            <div className="rounded-lg border p-3 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="treatment-installment-count" className="text-xs font-medium">
                  {t("gabinet.packages.installmentCount", "Liczba rat")}
                </Label>
                <Select value={installmentCount} onValueChange={setInstallmentCount}>
                  <SelectTrigger id="treatment-installment-count">
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
                  {t("gabinet.packages.installmentAmount", "Kwota raty")}
                </span>
                <span className="font-medium">
                  {installmentAmount.toFixed(2)} {currency}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t(
                  "gabinet.packages.installmentNote",
                  "Pierwsza rata zostanie pobrana teraz; pozostałe raty zostaną zapisane jako oczekujące i można je oznaczyć jako opłacone później.",
                )}
              </p>
            </div>
          )}

          {splitPayment && (
            <div className="rounded-lg border p-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border p-2 space-y-2">
                  <Label className="text-xs font-medium">
                    {t("gabinet.packages.firstMethod", "Pierwsza metoda")}
                  </Label>
                  <Select
                    value={firstSplitMethod}
                    onValueChange={(v) => setFirstSplitMethod(v as PaymentMethod)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">
                        {t("gabinet.packages.paymentMethods.cash", "Gotówka")}
                      </SelectItem>
                      <SelectItem value="card">
                        {t("gabinet.packages.paymentMethods.card", "Karta")}
                      </SelectItem>
                      <SelectItem value="transfer">
                        {t("gabinet.packages.paymentMethods.transfer", "Przelew")}
                      </SelectItem>
                      <SelectItem value="other">
                        {t("gabinet.packages.paymentMethods.other", "Inna")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
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
                    {t("gabinet.packages.secondMethod", "Druga metoda")}
                  </Label>
                  <Select
                    value={secondSplitMethod}
                    onValueChange={(v) => setSecondSplitMethod(v as PaymentMethod)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">
                        {t("gabinet.packages.paymentMethods.cash", "Gotówka")}
                      </SelectItem>
                      <SelectItem value="card">
                        {t("gabinet.packages.paymentMethods.card", "Karta")}
                      </SelectItem>
                      <SelectItem value="transfer">
                        {t("gabinet.packages.paymentMethods.transfer", "Przelew")}
                      </SelectItem>
                      <SelectItem value="other">
                        {t("gabinet.packages.paymentMethods.other", "Inna")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
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
                  {t("gabinet.packages.splitSum", "Suma")}: {splitTotal.toFixed(2)} /{" "}
                  {splitExpectedTotal.toFixed(2)} {currency}
                </span>
                {splitSameMethod ? (
                  <span>
                    {t("gabinet.packages.splitSameMethod", "Metody muszą się różnić")}
                  </span>
                ) : splitMismatch ? (
                  <span>{t("gabinet.packages.splitMismatch", "Musi się zgadzać z ceną")}</span>
                ) : null}
              </div>
            </div>
          )}
        </div>

        <SheetFooter className="border-t pt-4">
          <Button
            className="w-full"
            disabled={
              !selectedTreatment ||
              parsedSessionCount < 1 ||
              submitting ||
              (splitPayment && (splitMissingAmount || !!splitMismatch || splitSameMethod))
            }
            onClick={handlePurchase}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("gabinet.packages.purchaseButton", "Dodaj sprzedaż")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
