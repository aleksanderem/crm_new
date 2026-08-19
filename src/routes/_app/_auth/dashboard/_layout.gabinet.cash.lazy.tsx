import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAction } from "convex/react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { toast } from "sonner";
import { useOrganization } from "@/components/org-context";
import { PermissionGate, usePermission } from "@/hooks/use-permission";
import { formatCurrencyPLN } from "@/lib/format-currency";
import { PageHeader } from "@/components/layout/page-header";
import { SidePanel } from "@/components/crm/side-panel";
import { Input } from "@/components/ui/input";
import { Label as FieldLabel } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCircle,
  PlusCircle,
  Trash2Icon,
  WalletIcon,
} from "@/lib/ez-icons";
import {
  useSupabaseGabinetCashTransactions,
  useSupabaseGabinetDayCloseByDate,
  useSupabaseGabinetDayClosesList,
  useSupabaseGabinetPreviousDayClose,
} from "@/hooks/use-supabase-day-close";
import { useSupabasePaymentsRevenueByDateRange } from "@/hooks/use-supabase-payments";
import { useSupabaseGabinetLocationsList } from "@/hooks/use-supabase-gabinet-locations";
import { useSupabaseGabinetSafeMovements } from "@/hooks/use-supabase-safe";
import { useSupabaseOrganizationMembers } from "@/hooks/use-supabase-organizations";
import { supabaseKeys } from "@/lib/supabase/query-keys";

function GabinetCashSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6">
      <Skeleton className="h-10 w-64" />
    </div>
  );
}

export const Route = createLazyFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/cash"
)({
  component: () => (
    <PermissionGate
      feature="gabinet_reports"
      action="view"
      loadingFallback={<GabinetCashSkeleton />}
    >
      <GabinetCash />
    </PermissionGate>
  ),
});

const PAYMENT_METHOD_COLORS: Record<string, string> = {
  cash: "var(--chart-1)",
  card: "var(--chart-2)",
  transfer: "var(--chart-3)",
  package: "var(--chart-4)",
  other: "var(--chart-5)",
};

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

function formatTs(ms: number): string {
  return new Date(ms).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Payment Summary Card
// ---------------------------------------------------------------------------

function PaymentSummaryCard({
  summary,
  totalCollected,
  currency,
  isLoading,
}: {
  summary: { method: string; total: number; count: number }[];
  totalCollected: number;
  currency: string;
  isLoading: boolean;
}) {
  const { t } = useTranslation();

  if (isLoading) return <Skeleton className="h-48 rounded-lg" />;

  const hasData = totalCollected > 0;

  return (
    <Card>
      <CardHeader className="flex justify-between border-b">
        <span className="text-lg font-semibold">
          {t("gabinet.cash.paymentSummary")}
        </span>
        <span className="text-muted-foreground text-sm">
          {formatCurrencyPLN(totalCollected, currency, { fractionDigits: 2 })}
        </span>
      </CardHeader>
      <CardContent className="pt-4">
        {!hasData ? (
          <p className="text-muted-foreground text-sm py-4 text-center">
            {t("gabinet.cash.noPayments")}
          </p>
        ) : (
          <div className="space-y-3">
            {summary
              .filter((item) => item.count > 0)
              .map((item) => {
                const pct =
                  totalCollected > 0
                    ? Math.round((item.total / totalCollected) * 100)
                    : 0;
                const color =
                  PAYMENT_METHOD_COLORS[item.method] ?? "var(--chart-4)";
                return (
                  <div key={item.method} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="font-medium capitalize">
                          {t(
                            `gabinet.reports.paymentMethod.${item.method}`,
                            item.method,
                          )}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {item.count}×
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{pct}%</span>
                        <span className="font-semibold">
                          {formatCurrencyPLN(item.total, currency, {
                            fractionDigits: 2,
                          })}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Cash Transactions Card
// ---------------------------------------------------------------------------

function CashTransactionsCard({
  organizationId,
  date,
  locationId,
  canEdit,
  isLoading,
}: {
  organizationId: string;
  date: string;
  locationId: string | undefined;
  canEdit: boolean;
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const createTx = useAction(api.gabinet.dayClose.createCashTransaction);
  const deleteTx = useAction(api.gabinet.dayClose.deleteCashTransaction);

  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [txType, setTxType] = useState<"deposit" | "withdrawal">("deposit");
  const [txAmount, setTxAmount] = useState("");
  const [txReason, setTxReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: transactions, isLoading: loadingTx } =
    useSupabaseGabinetCashTransactions(organizationId, date, {
      locationId,
    });

  const totalDeposits = useMemo(
    () =>
      (transactions ?? [])
        .filter((t) => t.type === "deposit")
        .reduce((s, t) => s + t.amount, 0),
    [transactions],
  );

  const totalWithdrawals = useMemo(
    () =>
      (transactions ?? [])
        .filter((t) => t.type === "withdrawal")
        .reduce((s, t) => s + t.amount, 0),
    [transactions],
  );

  const invalidate = useCallback(() => {
    qc.invalidateQueries({
      queryKey: supabaseKeys.gabinetCashTransactions.list(organizationId),
    });
    qc.invalidateQueries({
      queryKey: supabaseKeys.gabinetDayCloses.list(organizationId),
    });
  }, [qc, organizationId]);

  const handleAdd = useCallback(async () => {
    const amount = parseFloat(txAmount.replace(",", "."));
    if (isNaN(amount) || amount <= 0) {
      toast.error(t("gabinet.cash.invalidAmount"));
      return;
    }
    setSubmitting(true);
    try {
      await createTx({
        organizationId: organizationId as Id<"organizations">,
        locationId: locationId ?? undefined,
        date,
        type: txType,
        amount,
        reason: txReason || undefined,
      });
      toast.success(t("gabinet.cash.transactionAdded"));
      setAddPanelOpen(false);
      setTxAmount("");
      setTxReason("");
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }, [createTx, organizationId, locationId, date, txType, txAmount, txReason, t, invalidate]);

  const handleDelete = useCallback(
    async (txId: string) => {
      try {
        await deleteTx({
          organizationId: organizationId as Id<"organizations">,
          transactionId: txId,
        });
        toast.success(t("gabinet.cash.transactionDeleted"));
        invalidate();
      } catch (e) {
        toast.error((e as Error).message);
      }
    },
    [deleteTx, organizationId, t, invalidate],
  );

  if (isLoading || loadingTx) return <Skeleton className="h-40 rounded-lg" />;

  return (
    <>
      <Card>
        <CardHeader className="flex justify-between border-b">
          <span className="text-lg font-semibold">
            {t("gabinet.cash.cashTransactions")}
          </span>
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddPanelOpen(true)}
            >
              <PlusCircle className="mr-1.5 h-4 w-4" variant="stroke" />
              {t("gabinet.cash.addTransaction")}
            </Button>
          )}
        </CardHeader>
        <CardContent className="pt-4">
          {(transactions ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm py-2 text-center">
              {t("gabinet.cash.noTransactions")}
            </p>
          ) : (
            <div className="space-y-2">
              {transactions!.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={
                        tx.type === "deposit"
                          ? "text-green-600 font-medium shrink-0"
                          : "text-red-600 font-medium shrink-0"
                      }
                    >
                      {tx.type === "deposit"
                        ? `+${formatCurrencyPLN(tx.amount, "PLN", { fractionDigits: 2 })}`
                        : `-${formatCurrencyPLN(tx.amount, "PLN", { fractionDigits: 2 })}`}
                    </span>
                    {tx.reason && (
                      <span className="text-muted-foreground truncate">
                        {tx.reason}
                      </span>
                    )}
                  </div>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground shrink-0"
                      onClick={() => handleDelete(tx.id)}
                    >
                      <Trash2Icon className="h-3.5 w-3.5" variant="stroke" />
                    </Button>
                  )}
                </div>
              ))}
              <div className="border-t pt-2 flex items-center justify-between text-sm font-medium">
                <div className="flex gap-4">
                  <span className="text-green-600">
                    +{formatCurrencyPLN(totalDeposits, "PLN", { fractionDigits: 2 })}
                  </span>
                  <span className="text-red-600">
                    -{formatCurrencyPLN(totalWithdrawals, "PLN", { fractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <SidePanel
        open={addPanelOpen}
        onOpenChange={setAddPanelOpen}
        title={t("gabinet.cash.addTransaction")}
        onSubmit={handleAdd}
        submitLabel={t("common.add")}
        isSubmitting={submitting}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <FieldLabel>{t("gabinet.cash.type")}</FieldLabel>
            <Select
              value={txType}
              onValueChange={(v) => setTxType(v as "deposit" | "withdrawal")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deposit">
                  {t("gabinet.cash.deposit")}
                </SelectItem>
                <SelectItem value="withdrawal">
                  {t("gabinet.cash.withdrawal")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <FieldLabel>{t("gabinet.cash.amount")}</FieldLabel>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0,00"
              value={txAmount}
              onChange={(e) => setTxAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>{t("gabinet.cash.reason")}</FieldLabel>
            <Input
              placeholder={t("gabinet.cash.reasonPlaceholder")}
              value={txReason}
              onChange={(e) => setTxReason(e.target.value)}
            />
          </div>
        </div>
      </SidePanel>
    </>
  );
}

// ---------------------------------------------------------------------------
// Day Close Form Card
// ---------------------------------------------------------------------------

function DayCloseFormCard({
  organizationId,
  date,
  locationId,
  cashFromPayments,
  cashDeposits,
  cashWithdrawals,
  canEdit,
  isAlreadyClosed,
  previousCashNextOpening,
  onClosed,
}: {
  organizationId: string;
  date: string;
  locationId: string | undefined;
  cashFromPayments: number;
  cashDeposits: number;
  cashWithdrawals: number;
  canEdit: boolean;
  isAlreadyClosed: boolean;
  previousCashNextOpening: number | null | undefined;
  onClosed: () => void;
}) {
  const { t } = useTranslation();
  const createClose = useAction(api.gabinet.dayClose.createDayClose);

  const [openingBalance, setOpeningBalance] = useState("0");
  const [openingBalanceTouched, setOpeningBalanceTouched] = useState(false);
  const [countedCash, setCountedCash] = useState("");
  const [cashNextOpening, setCashNextOpening] = useState("");

  useEffect(() => {
    if (!openingBalanceTouched && previousCashNextOpening != null) {
      setOpeningBalance(previousCashNextOpening.toFixed(2));
    }
  }, [previousCashNextOpening, openingBalanceTouched]);
  const [cashToSafe, setCashToSafe] = useState("0");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const openingBalanceNum = parseFloat(openingBalance.replace(",", ".")) || 0;
  const countedCashNum = parseFloat(countedCash.replace(",", ".")) || 0;
  const expectedCash =
    Math.round(
      (openingBalanceNum + cashFromPayments + cashDeposits - cashWithdrawals) * 100,
    ) / 100;
  const discrepancy = Math.round((countedCashNum - expectedCash) * 100) / 100;

  const showSplit = !!countedCash && countedCashNum > 0;
  const cashNextOpeningNum = parseFloat(cashNextOpening.replace(",", ".")) || 0;
  const cashToSafeNum = parseFloat(cashToSafe.replace(",", ".")) || 0;
  const splitSum = Math.round((cashNextOpeningNum + cashToSafeNum) * 100) / 100;
  const splitValid =
    !showSplit ||
    (cashNextOpeningNum >= 0 &&
      cashToSafeNum >= 0 &&
      cashToSafeNum <= countedCashNum &&
      Math.abs(splitSum - Math.round(countedCashNum * 100) / 100) < 0.005);

  const handleCountedCashChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setCountedCash(raw);
      // Auto-fill: entire counted amount stays in register, safe gets 0.
      const v = parseFloat(raw.replace(",", "."));
      if (!isNaN(v) && v >= 0) {
        setCashNextOpening(String(v));
        setCashToSafe("0");
      }
    },
    [],
  );

  const handleClose = useCallback(async () => {
    if (!countedCash) {
      toast.error(t("gabinet.cash.countedCashRequired"));
      return;
    }
    if (!splitValid) {
      toast.error(t("gabinet.cash.cashSplitRequired"));
      return;
    }
    setSubmitting(true);
    try {
      await createClose({
        organizationId: organizationId as Id<"organizations">,
        locationId: locationId ?? undefined,
        date,
        cashOpeningBalance: openingBalanceNum,
        cashCounted: countedCashNum,
        cashNextOpening: showSplit ? cashNextOpeningNum : undefined,
        cashToSafe: showSplit ? cashToSafeNum : undefined,
        notes: notes || undefined,
      });
      toast.success(t("gabinet.cash.dayClosed"));
      onClosed();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }, [
    createClose, organizationId, locationId, date, openingBalanceNum,
    countedCashNum, cashNextOpeningNum, cashToSafeNum, showSplit,
    notes, t, countedCash, splitValid, onClosed,
  ]);

  if (isAlreadyClosed) return null;

  return (
    <Card>
      <CardHeader className="flex justify-between border-b">
        <span className="text-lg font-semibold">
          {t("gabinet.cash.closeDay")}
        </span>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <FieldLabel htmlFor="opening-balance">
              {t("gabinet.cash.openingBalance")}
            </FieldLabel>
            <Input
              id="opening-balance"
              type="number"
              min="0"
              step="0.01"
              placeholder="0,00"
              value={openingBalance}
              onChange={(e) => {
                setOpeningBalance(e.target.value);
                setOpeningBalanceTouched(true);
              }}
              disabled={!canEdit}
            />
            {previousCashNextOpening != null && !openingBalanceTouched && (
              <p className="text-xs text-muted-foreground">
                {t("gabinet.cash.openingBalancePreFilled")}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <FieldLabel htmlFor="counted-cash">
              {t("gabinet.cash.countedCash")}
            </FieldLabel>
            <Input
              id="counted-cash"
              type="number"
              min="0"
              step="0.01"
              placeholder="0,00"
              value={countedCash}
              onChange={handleCountedCashChange}
              disabled={!canEdit}
            />
          </div>
        </div>

        {/* Cash reconciliation preview */}
        <div className="rounded-md border bg-muted/30 p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {t("gabinet.cash.openingBalance")}
            </span>
            <span>
              {formatCurrencyPLN(openingBalanceNum, "PLN", { fractionDigits: 2 })}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {t("gabinet.cash.cashFromPayments")}
            </span>
            <span className="text-green-600">
              +{formatCurrencyPLN(cashFromPayments, "PLN", { fractionDigits: 2 })}
            </span>
          </div>
          {cashDeposits > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("gabinet.cash.deposits")}
              </span>
              <span className="text-green-600">
                +{formatCurrencyPLN(cashDeposits, "PLN", { fractionDigits: 2 })}
              </span>
            </div>
          )}
          {cashWithdrawals > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("gabinet.cash.withdrawals")}
              </span>
              <span className="text-red-600">
                -{formatCurrencyPLN(cashWithdrawals, "PLN", { fractionDigits: 2 })}
              </span>
            </div>
          )}
          <div className="flex justify-between border-t pt-2 font-medium">
            <span>{t("gabinet.cash.expectedCash")}</span>
            <span>
              {formatCurrencyPLN(expectedCash, "PLN", { fractionDigits: 2 })}
            </span>
          </div>
          {countedCash && (
            <div
              className={`flex justify-between font-semibold ${
                discrepancy === 0
                  ? "text-green-600"
                  : discrepancy > 0
                    ? "text-blue-600"
                    : "text-red-600"
              }`}
            >
              <span>{t("gabinet.cash.discrepancy")}</span>
              <span>
                {discrepancy >= 0 ? "+" : ""}
                {formatCurrencyPLN(discrepancy, "PLN", { fractionDigits: 2 })}
              </span>
            </div>
          )}
        </div>

        {/* Cash split — shown after countedCash is entered */}
        {showSplit && (
          <div className="rounded-md border p-4 space-y-3">
            <p className="text-sm font-medium">{t("gabinet.cash.cashSplit")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <FieldLabel htmlFor="cash-next-opening">
                  {t("gabinet.cash.cashNextOpening")}
                </FieldLabel>
                <Input
                  id="cash-next-opening"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0,00"
                  value={cashNextOpening}
                  onChange={(e) => setCashNextOpening(e.target.value)}
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="cash-to-safe">
                  {t("gabinet.cash.cashToSafe")}
                </FieldLabel>
                <Input
                  id="cash-to-safe"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0,00"
                  value={cashToSafe}
                  onChange={(e) => setCashToSafe(e.target.value)}
                  disabled={!canEdit}
                />
              </div>
            </div>
            {!splitValid && (
              <p className="text-sm text-red-600">
                {t("gabinet.cash.cashSplitRequired")}
              </p>
            )}
            {splitValid && splitSum > 0 && (
              <p className="text-xs text-muted-foreground">
                {splitSum.toFixed(2)} /{" "}
                {countedCashNum.toFixed(2)} PLN
              </p>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <FieldLabel htmlFor="close-notes">{t("gabinet.cash.notes")}</FieldLabel>
          <Textarea
            id="close-notes"
            placeholder={t("gabinet.cash.notesPlaceholder")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!canEdit}
            rows={2}
          />
        </div>

        {canEdit && (
          <Button
            onClick={handleClose}
            disabled={submitting || !countedCash || !splitValid}
            className="w-full"
          >
            {submitting
              ? t("common.saving")
              : t("gabinet.cash.closeDay")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Day Close Summary Card (shown when already closed)
// ---------------------------------------------------------------------------

function DayCloseSummaryCard({
  dayClose,
}: {
  dayClose: {
    date: string;
    paymentSummary: Record<string, number>;
    totalCollected: number;
    cashOpeningBalance: number;
    cashFromPayments: number;
    cashDeposits: number;
    cashWithdrawals: number;
    cashExpected: number;
    cashCounted: number;
    cashDiscrepancy: number;
    cashNextOpening: number | null;
    cashToSafe: number | null;
    notes: string | null;
    closedAt: number;
  };
}) {
  const { t } = useTranslation();
  const isOk = dayClose.cashDiscrepancy === 0;
  const hasSplit =
    dayClose.cashNextOpening !== null || dayClose.cashToSafe !== null;

  return (
    <Card className="border-green-200">
      <CardHeader className="flex justify-between border-b border-green-100 bg-green-50/50 dark:bg-green-950/20 rounded-t-lg">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-600" variant="stroke" />
          <span className="text-lg font-semibold text-green-700 dark:text-green-400">
            {t("gabinet.cash.dayAlreadyClosed")}
          </span>
        </div>
        <span className="text-muted-foreground text-sm">
          {formatTs(dayClose.closedAt)}
        </span>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <div className="rounded-md border bg-muted/30 p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {t("gabinet.cash.totalCollected")}
            </span>
            <span className="font-semibold">
              {formatCurrencyPLN(dayClose.totalCollected, "PLN", {
                fractionDigits: 2,
              })}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {t("gabinet.cash.cashFromPayments")}
            </span>
            <span>
              {formatCurrencyPLN(dayClose.cashFromPayments, "PLN", {
                fractionDigits: 2,
              })}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {t("gabinet.cash.openingBalance")}
            </span>
            <span>
              {formatCurrencyPLN(dayClose.cashOpeningBalance, "PLN", {
                fractionDigits: 2,
              })}
            </span>
          </div>
          {dayClose.cashDeposits > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("gabinet.cash.deposits")}
              </span>
              <span className="text-green-600">
                +{formatCurrencyPLN(dayClose.cashDeposits, "PLN", {
                  fractionDigits: 2,
                })}
              </span>
            </div>
          )}
          {dayClose.cashWithdrawals > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("gabinet.cash.withdrawals")}
              </span>
              <span className="text-red-600">
                -{formatCurrencyPLN(dayClose.cashWithdrawals, "PLN", {
                  fractionDigits: 2,
                })}
              </span>
            </div>
          )}
          <div className="flex justify-between border-t pt-2">
            <span className="text-muted-foreground">
              {t("gabinet.cash.expectedCash")}
            </span>
            <span className="font-medium">
              {formatCurrencyPLN(dayClose.cashExpected, "PLN", {
                fractionDigits: 2,
              })}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {t("gabinet.cash.countedCash")}
            </span>
            <span className="font-medium">
              {formatCurrencyPLN(dayClose.cashCounted, "PLN", {
                fractionDigits: 2,
              })}
            </span>
          </div>
          <div
            className={`flex justify-between font-semibold pt-1 ${
              isOk
                ? "text-green-600"
                : dayClose.cashDiscrepancy > 0
                  ? "text-blue-600"
                  : "text-red-600"
            }`}
          >
            <div className="flex items-center gap-1.5">
              {!isOk && (
                <AlertTriangle className="h-4 w-4" variant="stroke" />
              )}
              <span>{t("gabinet.cash.discrepancy")}</span>
            </div>
            <span>
              {dayClose.cashDiscrepancy >= 0 ? "+" : ""}
              {formatCurrencyPLN(dayClose.cashDiscrepancy, "PLN", {
                fractionDigits: 2,
              })}
            </span>
          </div>
        </div>

        {/* Cash split summary (R2B) */}
        {hasSplit && (
          <div className="rounded-md border p-4 space-y-2 text-sm">
            <p className="font-medium">{t("gabinet.cash.cashSplit")}</p>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("gabinet.cash.cashNextOpening")}
              </span>
              <span>
                {formatCurrencyPLN(dayClose.cashNextOpening ?? 0, "PLN", {
                  fractionDigits: 2,
                })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("gabinet.cash.cashToSafe")}
              </span>
              <span className="font-medium">
                {formatCurrencyPLN(dayClose.cashToSafe ?? 0, "PLN", {
                  fractionDigits: 2,
                })}
              </span>
            </div>
          </div>
        )}

        {dayClose.notes && (
          <p className="text-sm text-muted-foreground italic">{dayClose.notes}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// History Table
// ---------------------------------------------------------------------------

function DayCloseHistoryCard({
  organizationId,
  locationId,
}: {
  organizationId: string;
  locationId: string | undefined;
}) {
  const { t } = useTranslation();
  const { data: history, isLoading } = useSupabaseGabinetDayClosesList(
    organizationId,
    { locationId, limit: 20 },
  );

  if (isLoading) return <Skeleton className="h-40 rounded-lg" />;
  if (!history || history.length === 0) return null;

  return (
    <Card>
      <CardHeader className="border-b">
        <span className="text-lg font-semibold">{t("gabinet.cash.history")}</span>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="divide-y">
          {history.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between py-3 text-sm"
            >
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{item.date}</span>
                <span className="text-muted-foreground text-xs">
                  {formatTs(item.closedAt)}
                </span>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span className="font-semibold">
                  {formatCurrencyPLN(item.totalCollected, "PLN", {
                    fractionDigits: 2,
                  })}
                </span>
                {item.cashDiscrepancy !== 0 && (
                  <span
                    className={`text-xs font-medium ${
                      item.cashDiscrepancy > 0
                        ? "text-blue-600"
                        : "text-red-600"
                    }`}
                  >
                    {item.cashDiscrepancy > 0 ? "+" : ""}
                    {formatCurrencyPLN(item.cashDiscrepancy, "PLN", {
                      fractionDigits: 2,
                    })}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Safe Balance Card
// ---------------------------------------------------------------------------

function SafeBalanceCard({
  balance,
  totalIn,
  totalOut,
  isLoading,
}: {
  balance: number;
  totalIn: number;
  totalOut: number;
  isLoading: boolean;
}) {
  const { t } = useTranslation();

  if (isLoading) return <Skeleton className="h-32 rounded-lg" />;

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <WalletIcon className="h-5 w-5 text-muted-foreground" variant="stroke" />
          <span className="text-lg font-semibold">{t("gabinet.safe.balance")}</span>
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold">
            {formatCurrencyPLN(balance, "PLN", { fractionDigits: 2 })}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("gabinet.safe.balanceDescription")}
        </p>
        <div className="flex gap-6 text-sm border-t pt-3">
          <div className="flex items-center gap-1.5">
            <ArrowDownIcon className="h-3.5 w-3.5 text-green-600" variant="stroke" />
            <span className="text-muted-foreground">{t("gabinet.safe.totalIn")}:</span>
            <span className="font-medium text-green-600">
              {formatCurrencyPLN(totalIn, "PLN", { fractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <ArrowUpIcon className="h-3.5 w-3.5 text-red-600" variant="stroke" />
            <span className="text-muted-foreground">{t("gabinet.safe.totalOut")}:</span>
            <span className="font-medium text-red-600">
              {formatCurrencyPLN(totalOut, "PLN", { fractionDigits: 2 })}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Safe Movements Card
// ---------------------------------------------------------------------------

function SafeMovementsCard({
  movements,
  isLoading,
  canEdit,
  safeBalance,
  organizationId,
  locationId,
  memberNameById,
  onWithdrawn,
}: {
  movements: { id: string; type: "transfer_in" | "withdrawal"; amount: number; description: string | null; referenceDayCloseId: string | null; createdBy: string; createdAt: number }[];
  isLoading: boolean;
  canEdit: boolean;
  safeBalance: number;
  organizationId: string;
  locationId: string;
  memberNameById: Map<string, string>;
  onWithdrawn: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const withdrawFromSafe = useAction(api.gabinet.safe.withdrawFromSafe);

  const [panelOpen, setPanelOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawReason, setWithdrawReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleWithdraw = useCallback(async () => {
    const amount = parseFloat(withdrawAmount.replace(",", "."));
    if (isNaN(amount) || amount <= 0) {
      toast.error(t("gabinet.safe.invalidAmount"));
      return;
    }
    if (amount > safeBalance) {
      toast.error(
        t("gabinet.safe.insufficientBalance", {
          balance: safeBalance.toFixed(2),
        }),
      );
      return;
    }
    setSubmitting(true);
    try {
      await withdrawFromSafe({
        organizationId: organizationId as Id<"organizations">,
        locationId,
        amount,
        description: withdrawReason || undefined,
      });
      toast.success(t("gabinet.safe.withdrawSuccess"));
      setPanelOpen(false);
      setWithdrawAmount("");
      setWithdrawReason("");
      qc.invalidateQueries({
        queryKey: supabaseKeys.gabinetSafeMovements.list(organizationId),
      });
      onWithdrawn();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }, [withdrawFromSafe, organizationId, locationId, withdrawAmount, withdrawReason, safeBalance, t, qc, onWithdrawn]);

  if (isLoading) return <Skeleton className="h-40 rounded-lg" />;

  return (
    <>
      <Card>
        <CardHeader className="flex justify-between border-b">
          <span className="text-lg font-semibold">{t("gabinet.safe.movements")}</span>
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPanelOpen(true)}
            >
              <ArrowUpIcon className="mr-1.5 h-4 w-4" variant="stroke" />
              {t("gabinet.safe.withdrawButton")}
            </Button>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          {movements.length === 0 ? (
            <p className="text-muted-foreground text-sm py-6 text-center">
              {t("gabinet.safe.noMovements")}
            </p>
          ) : (
            <div className="divide-y">
              {movements.map((m) => (
                <div
                  key={m.id}
                  className="flex items-start justify-between py-3 text-sm gap-3"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <span
                      className={`mt-0.5 shrink-0 rounded-full p-1 ${
                        m.type === "transfer_in"
                          ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                          : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                      }`}
                    >
                      {m.type === "transfer_in" ? (
                        <ArrowDownIcon className="h-3 w-3" variant="stroke" />
                      ) : (
                        <ArrowUpIcon className="h-3 w-3" variant="stroke" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium leading-none">
                        {m.type === "transfer_in"
                          ? t("gabinet.safe.typeTransferIn")
                          : t("gabinet.safe.typeWithdrawal")}
                      </p>
                      {m.description && (
                        <p className="text-muted-foreground text-xs mt-1 truncate">
                          {m.description}
                        </p>
                      )}
                      {m.referenceDayCloseId && (
                        <p className="text-muted-foreground text-xs mt-0.5">
                          {t("gabinet.safe.dayCloseRef")}
                        </p>
                      )}
                      <p className="text-muted-foreground text-xs mt-1">
                        {formatTs(m.createdAt)}
                        {memberNameById.get(m.createdBy) && ` · ${memberNameById.get(m.createdBy)}`}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 font-semibold tabular-nums ${
                      m.type === "transfer_in" ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {m.type === "transfer_in" ? "+" : "-"}
                    {formatCurrencyPLN(m.amount, "PLN", { fractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <SidePanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        title={t("gabinet.safe.withdrawForm")}
        onSubmit={handleWithdraw}
        submitLabel={t("gabinet.safe.withdraw")}
        isSubmitting={submitting}
      >
        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("gabinet.safe.balance")}</span>
              <span className="font-semibold">
                {formatCurrencyPLN(safeBalance, "PLN", { fractionDigits: 2 })}
              </span>
            </div>
          </div>
          <div className="space-y-1.5">
            <FieldLabel>{t("gabinet.safe.withdrawAmount")}</FieldLabel>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              max={safeBalance}
              placeholder="0,00"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>{t("gabinet.safe.withdrawReason")}</FieldLabel>
            <Textarea
              placeholder={t("gabinet.safe.withdrawReasonPlaceholder")}
              value={withdrawReason}
              onChange={(e) => setWithdrawReason(e.target.value)}
              rows={2}
            />
          </div>
        </div>
      </SidePanel>
    </>
  );
}

// ---------------------------------------------------------------------------
// Safe Tab Content
// ---------------------------------------------------------------------------

function SafeTabContent({
  organizationId,
  locationId,
  canEdit,
}: {
  organizationId: string;
  locationId: string | undefined;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data: safeData, isLoading } = useSupabaseGabinetSafeMovements(
    organizationId,
    locationId,
    { enabled: !!locationId },
  );

  const { data: members } = useSupabaseOrganizationMembers(organizationId);
  const memberNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members ?? []) {
      if (m.userId && m.user?.name) map.set(m.userId, m.user.name);
    }
    return map;
  }, [members]);

  const handleWithdrawn = useCallback(() => {
    qc.invalidateQueries({
      queryKey: supabaseKeys.gabinetSafeMovements.list(organizationId),
    });
  }, [qc, organizationId]);

  if (!locationId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <WalletIcon className="h-10 w-10 text-muted-foreground/40" variant="stroke" />
        <p className="text-muted-foreground">{t("gabinet.safe.noLocation")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <SafeBalanceCard
        balance={safeData?.balance ?? 0}
        totalIn={safeData?.totalIn ?? 0}
        totalOut={safeData?.totalOut ?? 0}
        isLoading={isLoading}
      />
      <SafeMovementsCard
        movements={safeData?.movements ?? []}
        isLoading={isLoading}
        canEdit={canEdit}
        safeBalance={safeData?.balance ?? 0}
        organizationId={organizationId}
        locationId={locationId}
        memberNameById={memberNameById}
        onWithdrawn={handleWithdrawn}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

function GabinetCash() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const qc = useQueryClient();

  const { allowed: canView, loading: permLoading } = usePermission(
    "gabinet_reports",
    "view",
  );
  const { allowed: canEdit } = usePermission("gabinet_reports", "edit");

  const [activeTab, setActiveTab] = useState<"kasa" | "sejf">("kasa");
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [selectedLocationId, setSelectedLocationId] = useState<
    string | undefined
  >(undefined);

  const { data: locations } = useSupabaseGabinetLocationsList(organizationId, {
    activeOnly: true,
  });

  // Payments for the selected day.
  const { data: payments, isLoading: loadingPayments } =
    useSupabasePaymentsRevenueByDateRange(
      organizationId,
      selectedDate,
      selectedDate,
      { locationId: selectedLocationId },
    );

  // Payment method breakdown.
  const { paymentSummary, totalCollected, cashFromPayments } = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    let total = 0;
    let cash = 0;
    for (const p of payments ?? []) {
      const method =
        p.paymentMethod === "cash" ||
        p.paymentMethod === "card" ||
        p.paymentMethod === "transfer" ||
        p.paymentMethod === "package"
          ? p.paymentMethod
          : "other";
      const prev = map.get(method) ?? { total: 0, count: 0 };
      map.set(method, { total: prev.total + p.amount, count: prev.count + 1 });
      total += p.amount;
      if (method === "cash") cash += p.amount;
    }
    const summary = (
      ["cash", "card", "transfer", "package", "other"] as const
    ).map((key) => ({
      method: key,
      total: map.get(key)?.total ?? 0,
      count: map.get(key)?.count ?? 0,
    }));
    return {
      paymentSummary: summary,
      totalCollected: Math.round(total * 100) / 100,
      cashFromPayments: Math.round(cash * 100) / 100,
    };
  }, [payments]);

  // Cash transactions for the day.
  const { data: cashTxs } = useSupabaseGabinetCashTransactions(
    organizationId,
    selectedDate,
    { locationId: selectedLocationId },
  );

  const cashDeposits = useMemo(
    () =>
      (cashTxs ?? [])
        .filter((t) => t.type === "deposit")
        .reduce((s, t) => s + t.amount, 0),
    [cashTxs],
  );
  const cashWithdrawals = useMemo(
    () =>
      (cashTxs ?? [])
        .filter((t) => t.type === "withdrawal")
        .reduce((s, t) => s + t.amount, 0),
    [cashTxs],
  );

  // Day close for the selected date.
  const { data: dayClose, isLoading: loadingDayClose } =
    useSupabaseGabinetDayCloseByDate(organizationId, selectedDate, {
      locationId: selectedLocationId,
    });

  // Previous day close — used to pre-fill opening balance when not yet closed.
  const { data: prevDayClose } = useSupabaseGabinetPreviousDayClose(
    organizationId,
    selectedDate,
    { locationId: selectedLocationId, enabled: !loadingDayClose && !dayClose },
  );

  const handleClosed = useCallback(() => {
    qc.invalidateQueries({
      queryKey: supabaseKeys.gabinetDayCloses.list(organizationId),
    });
  }, [qc, organizationId]);

  if (permLoading) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6">
        <Skeleton className="h-10 w-64" />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6">
        <PageHeader
          title={t("gabinet.cash.title")}
          description={t("common.noPermission", "You don't have permission to view this page.")}
        />
      </div>
    );
  }

  const isAlreadyClosed = !!dayClose;

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title={t("gabinet.cash.title")}
          description={t("gabinet.cash.description")}
        />
        <div className="flex gap-2 shrink-0">
          {locations && locations.length > 0 && (
            <Select
              value={selectedLocationId ?? "all"}
              onValueChange={(v) =>
                setSelectedLocationId(v === "all" ? undefined : v)
              }
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("gabinet.reports.allLocations", "All locations")}
                </SelectItem>
                {locations.map((loc) => (
                  <SelectItem key={loc._id} value={loc._id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {activeTab === "kasa" && (
            <Input
              type="date"
              className="w-40"
              value={selectedDate}
              max={todayIso()}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          )}
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "kasa" | "sejf")}
      >
        <TabsList>
          <TabsTrigger value="kasa">{t("gabinet.cash.tabKasa")}</TabsTrigger>
          <TabsTrigger value="sejf">{t("gabinet.cash.tabSejf")}</TabsTrigger>
        </TabsList>

        <TabsContent value="kasa" className="flex flex-col gap-4 sm:gap-6 mt-4">
          {/* Already closed banner / form */}
          {loadingDayClose ? (
            <Skeleton className="h-16 rounded-lg" />
          ) : isAlreadyClosed ? (
            <DayCloseSummaryCard dayClose={dayClose!} />
          ) : null}

          {/* Payment Summary */}
          <PaymentSummaryCard
            summary={paymentSummary}
            totalCollected={totalCollected}
            currency="PLN"
            isLoading={loadingPayments}
          />

          {/* Cash Transactions */}
          <CashTransactionsCard
            organizationId={organizationId}
            date={selectedDate}
            locationId={selectedLocationId}
            canEdit={canEdit && !isAlreadyClosed}
            isLoading={loadingDayClose}
          />

          {/* Day Close Form (only when not yet closed) */}
          {!loadingDayClose && !isAlreadyClosed && (
            <DayCloseFormCard
              organizationId={organizationId}
              date={selectedDate}
              locationId={selectedLocationId}
              cashFromPayments={cashFromPayments}
              cashDeposits={cashDeposits}
              cashWithdrawals={cashWithdrawals}
              canEdit={canEdit}
              isAlreadyClosed={isAlreadyClosed}
              previousCashNextOpening={prevDayClose?.cashNextOpening ?? null}
              onClosed={handleClosed}
            />
          )}

          {/* History */}
          <DayCloseHistoryCard
            organizationId={organizationId}
            locationId={selectedLocationId}
          />
        </TabsContent>

        <TabsContent value="sejf" className="mt-4">
          <SafeTabContent
            organizationId={organizationId}
            locationId={selectedLocationId}
            canEdit={canEdit}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
