import { useCallback, useState } from "react";

export type PackagePaymentMethod = "cash" | "card" | "transfer" | "other";

export function usePackagePaymentForm(effectiveTotalForSplit: number) {
  const [paymentMethod, setPaymentMethod] = useState<PackagePaymentMethod>("cash");
  const [splitPayment, setSplitPayment] = useState(false);
  const [firstSplitMethod, setFirstSplitMethod] = useState<PackagePaymentMethod>("cash");
  const [secondSplitMethod, setSecondSplitMethod] = useState<PackagePaymentMethod>("card");
  const [firstSplitAmount, setFirstSplitAmount] = useState<string>("");
  const [secondSplitAmount, setSecondSplitAmount] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const parsedFirstSplit = Number.parseFloat(firstSplitAmount.replace(",", ".")) || 0;
  const parsedSecondSplit = Number.parseFloat(secondSplitAmount.replace(",", ".")) || 0;
  const splitTotal = Math.round((parsedFirstSplit + parsedSecondSplit) * 100) / 100;
  const splitExpectedTotal = Math.round(effectiveTotalForSplit * 100) / 100;
  const splitMismatch = splitPayment && effectiveTotalForSplit > 0 && splitTotal !== splitExpectedTotal;
  const splitMissingAmount = splitPayment && parsedFirstSplit <= 0 && parsedSecondSplit <= 0;
  const splitSameMethod = splitPayment && firstSplitMethod === secondSplitMethod;

  const resetPaymentForm = useCallback(() => {
    setPaymentMethod("cash");
    setSplitPayment(false);
    setFirstSplitMethod("cash");
    setSecondSplitMethod("card");
    setFirstSplitAmount("");
    setSecondSplitAmount("");
  }, []);

  return {
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
  };
}
