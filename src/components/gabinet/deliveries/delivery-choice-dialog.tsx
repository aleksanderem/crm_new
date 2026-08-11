import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileText, Plus } from "@/lib/ez-icons";

export function DeliveryChoiceDialog({
  open,
  onOpenChange,
  onInvoice,
  onManual,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvoice: () => void;
  onManual: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("gabinet.deliveries.choiceTitle", "Dodaj dostawę")}
          </DialogTitle>
          <DialogDescription>
            {t("gabinet.deliveries.choiceDesc", "Wybierz sposób dodania dostawy.")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <button
            type="button"
            onClick={onInvoice}
            className="flex items-start gap-4 rounded-lg border-2 border-primary/20 bg-primary/5 p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <FileText className="h-5 w-5 text-primary" variant="stroke" />
            </span>
            <span className="space-y-1">
              <span className="block text-sm font-semibold">
                {t("gabinet.deliveries.choiceInvoiceTitle", "Załaduj fakturę")}
              </span>
              <span className="block text-xs text-muted-foreground">
                {t(
                  "gabinet.deliveries.choiceInvoiceDesc",
                  "Dodaj fakturę w PDF lub jako zdjęcie, a system odczyta jej dane i produkty.",
                )}
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={onManual}
            className="flex items-start gap-4 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
              <Plus className="h-5 w-5 text-muted-foreground" variant="stroke" />
            </span>
            <span className="space-y-1">
              <span className="block text-sm font-semibold">
                {t("gabinet.deliveries.choiceManualTitle", "Dodaj ręcznie")}
              </span>
              <span className="block text-xs text-muted-foreground">
                {t(
                  "gabinet.deliveries.choiceManualDesc",
                  "Dodaj produkty do dostawy bez faktury.",
                )}
              </span>
            </span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
