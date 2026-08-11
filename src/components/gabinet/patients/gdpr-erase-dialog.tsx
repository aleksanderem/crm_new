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

export function GdprEraseDialog({
  open,
  gdprConfirmText,
  setGdprConfirmText,
  isGdprSubmitting,
  onClose,
  onSubmit,
  t,
}: {
  open: boolean;
  gdprConfirmText: string;
  setGdprConfirmText: (v: string) => void;
  isGdprSubmitting: boolean;
  onClose: () => void;
  onSubmit: () => Promise<void>;
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
            {t(
              "gabinet.patients.gdprEraseTitle",
              "Trwałe usunięcie danych (RODO)",
            )}
          </DialogTitle>
          <DialogDescription>
            {t(
              "gabinet.patients.gdprEraseDesc",
              "Ta operacja trwale anonimizuje dane osobowe klienta: imię, nazwisko, e-mail, telefon, PESEL, adres, dane medyczne i kontakt alarmowy. Historię wizyt i płatności zostawiamy ze względów prawno-księgowych. Operacji nie można cofnąć.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>
              {t(
                "gabinet.patients.gdprEraseConfirmLabel",
                'Wpisz "USUŃ" aby potwierdzić',
              )}
            </Label>
            <Input
              type="text"
              value={gdprConfirmText}
              onChange={(e) => setGdprConfirmText(e.target.value)}
              placeholder="USUŃ"
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={onSubmit}
            disabled={
              isGdprSubmitting ||
              gdprConfirmText.trim().toUpperCase() !== "USUŃ"
            }
          >
            {isGdprSubmitting
              ? t("common.processing")
              : t("gabinet.patients.gdprEraseConfirm", "Usuń dane trwale")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
