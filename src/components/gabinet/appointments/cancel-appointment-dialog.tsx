import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";

export function CancelAppointmentDialog({
  open,
  onOpenChange,
  cancelReason,
  isUpdating,
  onCancelReasonChange,
  onConfirm,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cancelReason: string;
  isUpdating: boolean;
  onCancelReasonChange: (val: string) => void;
  onConfirm: () => void;
  t: (key: string, opts?: Record<string, unknown> | string) => string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("gabinet.appointments.cancelTitle")}</DialogTitle>
          <DialogDescription>
            {t("gabinet.appointments.cancelDesc")}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <RichTextEditor
            placeholder={t("gabinet.appointments.cancelReasonPlaceholder")}
            value={cancelReason}
            onChange={(val) => onCancelReasonChange(val ?? "")}
            minHeight="80px"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isUpdating}
          >
            {isUpdating
              ? t("common.processing")
              : t("gabinet.appointments.actions.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
