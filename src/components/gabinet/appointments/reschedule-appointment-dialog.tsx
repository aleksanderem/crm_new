import { useState, useEffect, type ChangeEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TimePicker5Min } from "@/components/gabinet/calendar/time-picker-5min";
import { Loader2 } from "@/lib/ez-icons";
import { cn } from "@/lib/utils";

interface RescheduleAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentDate: string; // YYYY-MM-DD
  currentStartTime: string; // HH:MM
  currentEndTime: string; // HH:MM
  isSaving: boolean;
  onSave: (date: string, startTime: string, endTime: string) => void;
  t: (key: string, fallback?: string) => string;
}

export function RescheduleAppointmentDialog({
  open,
  onOpenChange,
  currentDate,
  currentStartTime,
  currentEndTime,
  isSaving,
  onSave,
  t,
}: RescheduleAppointmentDialogProps) {
  const [date, setDate] = useState(currentDate);
  const [startTime, setStartTime] = useState(currentStartTime);
  const [endTime, setEndTime] = useState(currentEndTime);

  // Reset to current values when the dialog opens
  useEffect(() => {
    if (open) {
      setDate(currentDate);
      setStartTime(currentStartTime);
      setEndTime(currentEndTime);
    }
  }, [open, currentDate, currentStartTime, currentEndTime]);

  const isTimeValid = startTime < endTime;
  const isUnchanged =
    date === currentDate &&
    startTime === currentStartTime &&
    endTime === currentEndTime;

  const handleSubmit = () => {
    if (!isTimeValid || isUnchanged) return;
    onSave(date, startTime, endTime);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {t("gabinet.appointments.reschedule", "Przenieś wizytę")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "gabinet.appointments.rescheduleDesc",
              "Zmień datę lub godzinę wizyty bez zmiany pracownika.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reschedule-date">
              {t("common.date", "Data")}
            </Label>
            <input
              id="reschedule-date"
              type="date"
              value={date}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setDate(e.target.value)}
              disabled={isSaving}
              className={cn(
                "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="reschedule-start">
                {t("gabinet.appointments.startTime", "Godzina od")}
              </Label>
              <TimePicker5Min
                id="reschedule-start"
                value={startTime}
                onChange={(val) => setStartTime(val)}
                disabled={isSaving}
                allowTyping
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reschedule-end">
                {t("gabinet.appointments.endTime", "Godzina do")}
              </Label>
              <TimePicker5Min
                id="reschedule-end"
                value={endTime}
                onChange={(val) => setEndTime(val)}
                disabled={isSaving}
                allowTyping
              />
            </div>
          </div>

          {!isTimeValid && startTime && endTime && (
            <p className="text-xs text-destructive">
              {t(
                "gabinet.appointments.endTimeBeforeStart",
                "Godzina zakończenia musi być późniejsza niż godzina rozpoczęcia.",
              )}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            {t("common.cancel", "Anuluj")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSaving || !isTimeValid || isUnchanged || !date}
          >
            {isSaving ? (
              <>
                <Loader2 size={14} variant="stroke" className="mr-2 animate-spin" />
                {t("common.saving", "Zapisywanie...")}
              </>
            ) : (
              t("gabinet.appointments.confirmReschedule", "Zapisz termin")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
