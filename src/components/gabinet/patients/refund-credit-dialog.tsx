import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

export function RefundCreditDialog({
  open,
  canRefundCredit,
  creditBalance,
  refundAmount,
  setRefundAmount,
  refundMethod,
  setRefundMethod,
  refundNotes,
  setRefundNotes,
  isRefundSubmitting,
  onClose,
  onRefund,
  onRequestAuthorization,
  t,
}: {
  open: boolean;
  canRefundCredit: boolean;
  creditBalance: number;
  refundAmount: string;
  setRefundAmount: (v: string) => void;
  refundMethod: "cash" | "card" | "transfer" | "other";
  setRefundMethod: (v: "cash" | "card" | "transfer" | "other") => void;
  refundNotes: string;
  setRefundNotes: (v: string) => void;
  isRefundSubmitting: boolean;
  onClose: () => void;
  onRefund: () => Promise<void>;
  onRequestAuthorization: () => Promise<void>;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {canRefundCredit
              ? t("gabinet.payments.credit.refundDialogTitle")
              : t("gabinet.payments.credit.requestRefundDialogTitle")}
          </DialogTitle>
          <DialogDescription>
            {canRefundCredit
              ? t("gabinet.payments.credit.refundDialogDesc")
              : t("gabinet.payments.credit.requestRefundDialogDesc")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-md border bg-muted/30 p-2.5">
            <p className="text-xs text-muted-foreground">
              {t("gabinet.payments.credit.available")}
            </p>
            <p className="text-base font-semibold tabular-nums">
              {formatCurrencyPLN(creditBalance)}
            </p>
          </div>
          <div>
            <Label>{t("gabinet.payments.credit.refundAmount")}</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={refundAmount}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                  setRefundAmount(v);
                }
              }}
              placeholder="0.00"
            />
          </div>
          {canRefundCredit && (
            <div>
              <Label>{t("gabinet.payments.credit.refundMethod")}</Label>
              <Select
                value={refundMethod}
                onValueChange={(v) =>
                  setRefundMethod(v as "cash" | "card" | "transfer" | "other")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">
                    {t("gabinet.payments.methods.cash")}
                  </SelectItem>
                  <SelectItem value="card">
                    {t("gabinet.payments.methods.card")}
                  </SelectItem>
                  <SelectItem value="transfer">
                    {t("gabinet.payments.methods.transfer")}
                  </SelectItem>
                  <SelectItem value="other">
                    {t("gabinet.payments.methods.other")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>{t("gabinet.payments.credit.refundNotes")}</Label>
            <Input
              type="text"
              value={refundNotes}
              onChange={(e) => setRefundNotes(e.target.value)}
              placeholder={t("gabinet.payments.notePlaceholder")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={canRefundCredit ? onRefund : onRequestAuthorization}
            disabled={isRefundSubmitting}
          >
            {isRefundSubmitting
              ? t("common.processing")
              : canRefundCredit
                ? t("gabinet.payments.credit.refundConfirm")
                : t("gabinet.payments.credit.requestRefundConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
