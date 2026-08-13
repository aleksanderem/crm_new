import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";

type CancelScope = "single" | "series";

export function CancelAppointmentDialog({
  open,
  onOpenChange,
  cancelReason,
  isUpdating,
  onCancelReasonChange,
  onConfirm,
  isRecurring,
  cancelScope = "single",
  onCancelScopeChange,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cancelReason: string;
  isUpdating: boolean;
  onCancelReasonChange: (val: string) => void;
  onConfirm: () => void;
  isRecurring?: boolean;
  cancelScope?: CancelScope;
  onCancelScopeChange?: (scope: CancelScope) => void;
  t: (key: string, opts?: Record<string, unknown> | string) => string;
}) {
  const title =
    isRecurring && cancelScope === "series"
      ? t("gabinet.appointments.cancelSeriesTitle", "Anuluj serię wizyt")
      : t("gabinet.appointments.cancelTitle");

  const confirmLabel =
    isRecurring && cancelScope === "series"
      ? t("gabinet.appointments.actions.cancelSeries", "Anuluj serię")
      : t("gabinet.appointments.actions.cancel");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {t("gabinet.appointments.cancelDesc")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {isRecurring && onCancelScopeChange && (
            <RadioGroup
              value={cancelScope}
              onValueChange={(v) => onCancelScopeChange(v as CancelScope)}
              className="gap-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="single" id="cancel-scope-single" />
                <Label htmlFor="cancel-scope-single" className="cursor-pointer font-normal">
                  {t("gabinet.appointments.cancelScope.single", "Tylko ta wizyta")}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="series" id="cancel-scope-series" />
                <Label htmlFor="cancel-scope-series" className="cursor-pointer font-normal">
                  {t("gabinet.appointments.cancelScope.series", "Ta i wszystkie następne")}
                </Label>
              </div>
            </RadioGroup>
          )}
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
            {isUpdating ? t("common.processing") : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
