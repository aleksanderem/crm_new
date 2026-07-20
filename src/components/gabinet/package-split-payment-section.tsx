import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrencyPLN } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import type { PackagePaymentMethod } from "@/hooks/use-package-payment-form";

interface PackageSplitPaymentSectionProps {
  firstSplitMethod: PackagePaymentMethod;
  onFirstSplitMethodChange: (m: PackagePaymentMethod) => void;
  secondSplitMethod: PackagePaymentMethod;
  onSecondSplitMethodChange: (m: PackagePaymentMethod) => void;
  firstSplitAmount: string;
  onFirstSplitAmountChange: (v: string) => void;
  secondSplitAmount: string;
  onSecondSplitAmountChange: (v: string) => void;
  splitTotal: number;
  splitExpectedTotal: number;
  splitMismatch: boolean;
  splitSameMethod: boolean;
  currency?: string;
}

function SplitMethodSelect({
  value,
  onChange,
}: {
  value: PackagePaymentMethod;
  onChange: (m: PackagePaymentMethod) => void;
}) {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={(v) => onChange(v as PackagePaymentMethod)}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="cash">{t("gabinet.packages.paymentMethods.cash")}</SelectItem>
        <SelectItem value="card">{t("gabinet.packages.paymentMethods.card")}</SelectItem>
        <SelectItem value="transfer">{t("gabinet.packages.paymentMethods.transfer")}</SelectItem>
        <SelectItem value="other">{t("gabinet.packages.paymentMethods.other", "Inna")}</SelectItem>
      </SelectContent>
    </Select>
  );
}

function SplitAmountInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Input
      type="text"
      inputMode="decimal"
      placeholder="0.00"
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
          onChange(v);
        }
      }}
    />
  );
}

export function PackageSplitPaymentSection({
  firstSplitMethod,
  onFirstSplitMethodChange,
  secondSplitMethod,
  onSecondSplitMethodChange,
  firstSplitAmount,
  onFirstSplitAmountChange,
  secondSplitAmount,
  onSecondSplitAmountChange,
  splitTotal,
  splitExpectedTotal,
  splitMismatch,
  splitSameMethod,
  currency = "PLN",
}: PackageSplitPaymentSectionProps) {
  const { t } = useTranslation();

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md border p-2 space-y-2">
          <Label className="text-xs font-medium">
            {t("gabinet.packages.firstMethod", "Pierwsza metoda")}
          </Label>
          <SplitMethodSelect value={firstSplitMethod} onChange={onFirstSplitMethodChange} />
          <SplitAmountInput value={firstSplitAmount} onChange={onFirstSplitAmountChange} />
        </div>
        <div className="rounded-md border p-2 space-y-2">
          <Label className="text-xs font-medium">
            {t("gabinet.packages.secondMethod", "Druga metoda")}
          </Label>
          <SplitMethodSelect value={secondSplitMethod} onChange={onSecondSplitMethodChange} />
          <SplitAmountInput value={secondSplitAmount} onChange={onSecondSplitAmountChange} />
        </div>
      </div>
      <div
        className={cn(
          "flex items-center justify-between text-xs",
          splitMismatch || splitSameMethod ? "text-destructive" : "text-muted-foreground",
        )}
      >
        <span>
          {t("gabinet.packages.splitSum", "Suma")}: {splitTotal.toFixed(2)} /{" "}
          {formatCurrencyPLN(splitExpectedTotal, currency)}
        </span>
        {splitSameMethod ? (
          <span>{t("gabinet.packages.splitSameMethod", "Metody muszą się różnić")}</span>
        ) : splitMismatch ? (
          <span>{t("gabinet.packages.splitMismatch", "Musi się zgadzać z ceną")}</span>
        ) : null}
      </div>
    </div>
  );
}
