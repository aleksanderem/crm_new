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

export function CancelPaymentDialog({
  cancellingPaymentId,
  cancelReason,
  setCancelReason,
  isCancelSubmitting,
  onClose,
  onSubmit,
  t,
}: {
  cancellingPaymentId: string | null;
  cancelReason: string;
  setCancelReason: (v: string) => void;
  isCancelSubmitting: boolean;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <Dialog
      open={cancellingPaymentId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("gabinet.payments.cancelPayment")}</DialogTitle>
          <DialogDescription>
            {t("gabinet.payments.cancelPaymentDesc")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>
              {t("gabinet.payments.cancelReason")}{" "}
              <span className="text-xs text-muted-foreground">
                ({t("common.optional")})
              </span>
            </Label>
            <Input
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder={t("gabinet.payments.cancelReasonPlaceholder")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button
            variant="destructive"
            onClick={onSubmit}
            disabled={isCancelSubmitting}
          >
            {isCancelSubmitting
              ? t("common.processing")
              : t("gabinet.payments.cancelConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
