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

type UsageDialogItem = {
  treatmentId: string;
  variantId?: string;
  treatmentName: string;
  remaining: number;
  qty: number;
};

export function PackageUsageDialog({
  open,
  onOpenChange,
  usageDialogItems,
  isUsageSubmitting,
  onItemQtyChange,
  onSubmit,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usageDialogItems: UsageDialogItem[];
  isUsageSubmitting: boolean;
  onItemQtyChange: (idx: number, val: number) => void;
  onSubmit: () => void;
  t: (key: string, opts?: Record<string, unknown> | string) => string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("gabinet.packages.useMultiple")}</DialogTitle>
          <DialogDescription>
            {t("gabinet.packages.useMultipleDesc")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {usageDialogItems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t("gabinet.packages.allTreatmentsExhausted")}
            </p>
          ) : (
            usageDialogItems.map((item, idx) => (
              <div key={item.treatmentId} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {item.treatmentName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("gabinet.packages.availableRemaining", {
                      remaining: item.remaining,
                    })}
                  </p>
                </div>
                <Input
                  type="number"
                  inputMode="numeric"
                  className="w-20"
                  min={0}
                  max={item.remaining}
                  value={item.qty}
                  onChange={(e) => {
                    const val = Math.max(
                      0,
                      Math.min(
                        item.remaining,
                        parseInt(e.target.value) || 0,
                      ),
                    );
                    onItemQtyChange(idx, val);
                  }}
                />
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={
              isUsageSubmitting || usageDialogItems.every((it) => it.qty === 0)
            }
            onClick={onSubmit}
          >
            {isUsageSubmitting
              ? t("common.saving")
              : t("gabinet.packages.recordUsage")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
