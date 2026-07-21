import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { SidePanel } from "@/components/crm/side-panel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "@/lib/ez-icons";
import { useSupabaseGabinetPatientsList } from "@/hooks/use-supabase-gabinet-patients";
import { useSupabaseGabinetTreatmentsList } from "@/hooks/use-supabase-gabinet-treatments";
import { useSupabaseGabinetEmployeesList } from "@/hooks/use-supabase-gabinet-employees";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { formatActionError } from "@/lib/format-action-error";
import { formatCurrencyPLN } from "@/lib/format-currency";
import { cn } from "@/lib/utils";

type PaymentMethod = "cash" | "card" | "transfer" | "other";

interface SellTreatmentPanelProps {
  organizationId: Id<"organizations">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SellTreatmentPanel({
  organizationId,
  open,
  onOpenChange,
}: SellTreatmentPanelProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // @ts-ignore — TS2589: deep type instantiation in Convex codegen for this action
  const purchaseTreatment = useAction(api.gabinet.packages.purchaseTreatment);
  const createPayment = useAction(api.payments.create);

  const { data: patientsData } = useSupabaseGabinetPatientsList(organizationId);
  const { data: treatmentsData } = useSupabaseGabinetTreatmentsList(organizationId, { isActive: true });
  const { data: employeesData } = useSupabaseGabinetEmployeesList(String(organizationId), { activeOnly: true });

  const [patientId, setPatientId] = useState<string>("");
  const [soldByEmployeeId, setSoldByEmployeeId] = useState<string>("");
  const [treatmentId, setTreatmentId] = useState<string>("");
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
  const [discountType, setDiscountType] = useState<"amount" | "percent">("amount");
  const [discountValue, setDiscountValue] = useState<string>("");

  const activeTreatments = useMemo(
    () => treatmentsData ?? [],
    [treatmentsData],
  );
  const selectedTreatment = useMemo(
    () => activeTreatments.find((tr) => tr._id === treatmentId),
    [activeTreatments, treatmentId],
  );

  const parsedSessionCount = Math.max(1, Number.parseInt(sessionCount, 10) || 1);
  const totalPrice = useMemo(
    () =>
      selectedTreatment
        ? Math.round((selectedTreatment.price ?? 0) * parsedSessionCount * 100) / 100
        : 0,
    [selectedTreatment, parsedSessionCount],
  );
  const currency = selectedTreatment?.currency ?? "PLN";

  const parsedDiscountValue = Number.parseFloat(discountValue.replace(",", ".")) || 0;
  const discountAmount =
    totalPrice > 0
      ? discountType === "amount"
        ? Math.min(parsedDiscountValue, totalPrice)
        : Math.round((totalPrice * Math.min(parsedDiscountValue, 100)) / 100 * 100) / 100
      : 0;
  const finalPrice = Math.round(Math.max(0, totalPrice - discountAmount) * 100) / 100;

  const isOneTime = paymentType === "one_time";
  const isInstallment = paymentType === "installment";

  const parsedInstallmentCount = Math.max(2, Math.min(4, Number.parseInt(installmentCount, 10) || 2));
  const installmentAmount = selectedTreatment
    ? Math.round((finalPrice / parsedInstallmentCount) * 100) / 100
    : 0;
  const installmentRemainder = selectedTreatment
    ? Math.round((finalPrice - installmentAmount * parsedInstallmentCount) * 100) / 100
    : 0;
  const firstInstallmentAmount = selectedTreatment
    ? Math.round((installmentAmount + installmentRemainder) * 100) / 100
    : 0;

  const parsedFirstSplit = Number.parseFloat(firstSplitAmount.replace(",", ".")) || 0;
  const parsedSecondSplit = Number.parseFloat(secondSplitAmount.replace(",", ".")) || 0;
  const splitTotal = Math.round((parsedFirstSplit + parsedSecondSplit) * 100) / 100;
  const splitExpectedTotal = selectedTreatment
    ? isInstallment
      ? firstInstallmentAmount
      : Math.round(finalPrice * 100) / 100
    : 0;
  const splitMismatch = splitPayment && !!selectedTreatment && splitTotal !== splitExpectedTotal;
  const splitMissingAmount = splitPayment && parsedFirstSplit <= 0 && parsedSecondSplit <= 0;
  const splitSameMethod = splitPayment && firstSplitMethod === secondSplitMethod;

  const reset = useCallback(() => {
    setPatientId("");
    setSoldByEmployeeId("");
    setTreatmentId("");
    setSessionCount("1");
    setPaymentType("one_time");
    setPaymentMethod("cash");
    setSplitPayment(false);
    setFirstSplitMethod("cash");
    setSecondSplitMethod("card");
    setFirstSplitAmount("");
    setSecondSplitAmount("");
    setInstallmentCount("2");
    setDiscountType("amount");
    setDiscountValue("");
  }, []);

  const handleSubmit = async () => {
    if (!patientId || !selectedTreatment) return;
    if (splitPayment) {
      if (splitMissingAmount) {
        toast.error(
          t("gabinet.packages.splitMissingAmount", "Podaj kwotę co najmniej jednej metody płatności"),
        );
        return;
      }
      if (splitMismatch) {
        toast.error(
          t("gabinet.packages.splitMismatchError", "Suma rozdzielonych płatności musi być równa cenie"),
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
        paidAmount: finalPrice,
        paymentMethod: usagePaymentMethod,
        soldByEmployeeId: soldByEmployeeId || undefined,
      });

      const treatmentName = selectedTreatment.name;
      const discountFields =
        discountAmount > 0
          ? {
              discountAmount,
              discountPercent:
                discountType === "percent"
                  ? parsedDiscountValue
                  : Math.round((discountAmount / totalPrice) * 10000) / 100,
            }
          : {};

      if (isInstallment) {
        if (splitPayment) {
          const parts: Array<{ method: PaymentMethod; amount: number }> = [];
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
              notes: `Treatment: ${treatmentName} (installment 1/${parsedInstallmentCount} split: ${part.method})`,
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
            paymentMethod,
            notes: `Treatment: ${treatmentName} (installment 1/${parsedInstallmentCount})`,
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
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          await createPayment({
            organizationId,
            patientId: patientId as Id<"gabinetPatients">,
            packageUsageId: usageId,
            amount: part.amount,
            currency,
            paymentMethod: part.method,
            notes: `Treatment: ${treatmentName} (split: ${part.method})`,
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
          paymentMethod,
          notes: `Treatment: ${treatmentName}`,
          ...discountFields,
        });
      }

      toast.success(t("gabinet.treatments.purchased", "Zabieg sprzedany pomyślnie"));
      void queryClient.invalidateQueries({
        queryKey: supabaseKeys.gabinetTreatments.list(organizationId),
      });
      void queryClient.invalidateQueries({
        queryKey: supabaseKeys.gabinetPackageUsage.list(organizationId),
      });
      onOpenChange(false);
      reset();
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

  return (
    <SidePanel
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
      title={t("sidebar.gabinet.sellProduct", "Sprzedaj produkt")}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>{t("gabinet.packages.selectPatient", "Klient")}</Label>
          <Select value={patientId} onValueChange={setPatientId}>
            <SelectTrigger>
              <SelectValue
                placeholder={t("gabinet.packages.selectPatientPlaceholder", "Wybierz klienta...")}
              />
            </SelectTrigger>
            <SelectContent>
              {(patientsData ?? []).map((p) => (
                <SelectItem key={p._id} value={p._id}>
                  {p.firstName} {p.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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
          <Label>{t("gabinet.treatments.selectTreatment", "Zabieg")}</Label>
          <Select value={treatmentId} onValueChange={setTreatmentId}>
            <SelectTrigger>
              <SelectValue
                placeholder={t("gabinet.treatments.selectTreatmentPlaceholder", "Wybierz zabieg...")}
              />
            </SelectTrigger>
            <SelectContent>
              {activeTreatments.map((tr) => (
                <SelectItem key={tr._id} value={tr._id}>
                  {tr.name} — {formatCurrencyPLN(tr.price ?? 0, tr.currency ?? "PLN")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sell-treatment-session-count">
            {t("gabinet.treatments.sessionCount", "Liczba sesji")}
          </Label>
          <Input
            id="sell-treatment-session-count"
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
              <span>{formatCurrencyPLN(selectedTreatment.price ?? 0, currency)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {t("gabinet.treatments.sessionCount", "Liczba sesji")}
              </span>
              <span>&times;{parsedSessionCount}</span>
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
                <span>- {formatCurrencyPLN(discountAmount, currency)}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-1 border-t text-sm">
              <span className="font-medium">
                {discountAmount > 0
                  ? t("gabinet.payments.discountedPrice")
                  : t("gabinet.packages.totalPrice", "Cena całkowita")}
              </span>
              <span className="font-bold">{formatCurrencyPLN(finalPrice, currency)}</span>
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

        <Label
          htmlFor="sell-treatment-split-payment"
          className="-mx-2 flex min-h-11 select-none items-center gap-3 rounded-md px-2 py-2.5 cursor-pointer text-sm font-normal transition-colors hover:bg-accent/40 active:bg-accent"
        >
          <Checkbox
            id="sell-treatment-split-payment"
            checked={splitPayment}
            onCheckedChange={(v) => setSplitPayment(v === true)}
          />
          {isInstallment
            ? t("gabinet.packages.splitFirstInstallment", "Podziel pierwszą ratę")
            : t("gabinet.packages.splitPayment", "Podziel płatność")}
        </Label>

        {isInstallment && selectedTreatment && (
          <div className="rounded-lg border p-3 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="sell-treatment-installment-count" className="text-xs font-medium">
                {t("gabinet.packages.installmentCount", "Liczba rat")}
              </Label>
              <Select value={installmentCount} onValueChange={setInstallmentCount}>
                <SelectTrigger id="sell-treatment-installment-count">
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
              <span className="font-medium">{formatCurrencyPLN(installmentAmount, currency)}</span>
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
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={firstSplitAmount}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                      setFirstSplitAmount(v);
                    }
                  }}
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
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={secondSplitAmount}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                      setSecondSplitAmount(v);
                    }
                  }}
                />
              </div>
            </div>
            <div
              className={cn(
                "flex items-center justify-between text-xs",
                splitMismatch || splitSameMethod ? "text-destructive" : "text-muted-foreground",
              )}
            >
              <span>
                {t("gabinet.packages.splitSum", "Suma")}: {splitTotal.toFixed(2)}
                {selectedTreatment
                  ? ` / ${formatCurrencyPLN(splitExpectedTotal, currency)}`
                  : ""}
              </span>
              {splitSameMethod ? (
                <span>{t("gabinet.packages.splitSameMethod", "Metody muszą się różnić")}</span>
              ) : splitMismatch ? (
                <span>{t("gabinet.packages.splitMismatch", "Musi się zgadzać z ceną")}</span>
              ) : null}
            </div>
          </div>
        )}

        <Button
          className="w-full"
          disabled={
            !patientId ||
            !treatmentId ||
            parsedSessionCount < 1 ||
            submitting ||
            (splitPayment && (splitMissingAmount || !!splitMismatch || splitSameMethod))
          }
          onClick={handleSubmit}
        >
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" variant="stroke" />}
          {t("gabinet.packages.purchaseButton", "Dodaj sprzedaż")}
        </Button>
      </div>
    </SidePanel>
  );
}
