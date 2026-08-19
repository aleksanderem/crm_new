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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { TFunction } from "i18next";
import { TimePicker5Min } from "@/components/gabinet/calendar/time-picker-5min";
import { Loader2 } from "@/lib/ez-icons";
import { cn } from "@/lib/utils";

type RescheduleScope = "single" | "series";

interface RescheduleAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentDate: string; // YYYY-MM-DD
  currentStartTime: string; // HH:MM
  currentEndTime: string; // HH:MM
  isSaving: boolean;
  onSave: (date: string, startTime: string, endTime: string, scope: RescheduleScope) => void;
  /** When true, shows a scope selector so the user can reschedule the whole series. */
  isRecurring?: boolean;
  t: TFunction;
}

export function RescheduleAppointmentDialog({
  open,
  onOpenChange,
  currentDate,
  currentStartTime,
  currentEndTime,
  isSaving,
  onSave,
  isRecurring,
  t,
}: RescheduleAppointmentDialogProps) {
  const [date, setDate] = useState(currentDate);
  const [startTime, setStartTime] = useState(currentStartTime);
  const [endTime, setEndTime] = useState(currentEndTime);
  const [scope, setScope] = useState<RescheduleScope>("single");

  // Reset to current values when the dialog opens
  useEffect(() => {
    if (open) {
      setDate(currentDate);
      setStartTime(currentStartTime);
      setEndTime(currentEndTime);
      setScope("single");
    }
  }, [open, currentDate, currentStartTime, currentEndTime]);

  const isTimeValid = startTime < endTime;
  // For series scope only time matters (dates stay per-occurrence), so only
  // require time to differ from current. For single scope, date may also change.
  const isUnchanged =
    scope === "series"
      ? startTime === currentStartTime && endTime === currentEndTime
      : date === currentDate && startTime === currentStartTime && endTime === currentEndTime;

  const handleSubmit = () => {
    if (!isTimeValid || isUnchanged) return;
    // For series rescheduling the date field is irrelevant; pass currentDate so
    // the handler can use it as `fromDate` to filter occurrences.
    onSave(scope === "series" ? currentDate : date, startTime, endTime, scope);
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
          {isRecurring && (
            <RadioGroup
              value={scope}
              onValueChange={(v) => setScope(v as RescheduleScope)}
              className="gap-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="single" id="reschedule-scope-single" />
                <Label htmlFor="reschedule-scope-single" className="cursor-pointer font-normal">
                  {t("gabinet.appointments.rescheduleScope.single", "Tylko ta wizyta")}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="series" id="reschedule-scope-series" />
                <Label htmlFor="reschedule-scope-series" className="cursor-pointer font-normal">
                  {t("gabinet.appointments.rescheduleScope.series", "Ta i wszystkie następne")}
                </Label>
              </div>
            </RadioGroup>
          )}

          {scope === "single" && (
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
          )}

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
            disabled={isSaving || !isTimeValid || isUnchanged || (scope === "single" && !date)}
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
