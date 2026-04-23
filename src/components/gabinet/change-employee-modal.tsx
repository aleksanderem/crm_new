import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle,
  Clock,
  AlertTriangle,
  ShieldAlert,
  Calendar,
  RefreshCcw,
  Loader2,
} from "@/lib/ez-icons";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChangeEmployeeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: Id<"organizations">;
  appointmentId: Id<"gabinetAppointments">;
  treatmentId: Id<"gabinetTreatments">;
  currentEmployeeId: Id<"users">;
  appointmentDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  durationMinutes: number;
}

interface EmployeeRow {
  employeeDoc: {
    _id: Id<"gabinetEmployees">;
    userId: Id<"users">;
    firstName?: string;
    lastName?: string;
    qualifiedTreatmentIds: Id<"gabinetTreatments">[];
    role: string;
    specialization?: string;
  };
  name: string;
  initials: string;
  isCurrent: boolean;
  isQualified: boolean;
}


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDatePl(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return format(d, "EEEE, d MMM yyyy", { locale: pl });
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// ---------------------------------------------------------------------------
// Illustrations
// ---------------------------------------------------------------------------

function StackedCardsIllustration() {
  return (
    <div className="relative h-24 w-52" aria-hidden="true">
      <div className="bg-muted/60 dark:bg-muted/30 border-border/50 absolute inset-x-6 top-0 h-6 rounded-t-lg border" />
      <div className="bg-muted/80 dark:bg-muted/50 border-border/60 absolute inset-x-3 top-3 h-6 rounded-t-lg border" />
      <div className="bg-background border-border absolute inset-x-0 top-6 flex h-16 items-center gap-3 rounded-lg border px-4 shadow-sm">
        <div className="bg-muted size-8 shrink-0 rounded" />
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="bg-muted h-2.5 w-3/4 rounded" />
          <div className="bg-muted/60 h-2 w-1/2 rounded" />
        </div>
      </div>
      <div className="from-background/0 via-background/60 to-background pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-linear-to-b" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChangeEmployeeModal({
  open,
  onOpenChange,
  organizationId,
  appointmentId,
  treatmentId,
  currentEmployeeId,
  appointmentDate,
  startTime,
  endTime,
  durationMinutes,
}: ChangeEmployeeModalProps) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<Id<"users"> | null>(null);
  const [useNewSlot, setUseNewSlot] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateAppointment = useAction(api.gabinet.appointments.update);

  // Fetch all active employees
  const listEmployeesAction = useAction(api.gabinet.employees.listAll);
  const { data: employeesList } = useQuery({
    queryKey: ["gabinet.employees.listAll", organizationId, true],
    queryFn: () => listEmployeesAction({ organizationId, activeOnly: true }),
    enabled: !!organizationId,
  }) as { data: any[] | undefined };

  // Build employee rows (excluding current)
  const employees: EmployeeRow[] = useMemo(() => {
    if (!employeesList) return [];
    return employeesList
      .filter((e) => e.userId !== currentEmployeeId)
      .map((e) => {
        const name =
          e.firstName || e.lastName
            ? `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim()
            : "—";
        const isQualified =
          e.qualifiedTreatmentIds.length === 0 ||
          e.qualifiedTreatmentIds.includes(treatmentId);
        return {
          employeeDoc: e as EmployeeRow["employeeDoc"],
          name,
          initials: getInitials(name),
          isCurrent: false,
          isQualified,
        };
      });
  }, [employeesList, currentEmployeeId, treatmentId]);

  // For the selected employee, check availability at current slot (action → Supabase)
  const getAvailableSlots = useAction(api.gabinet.appointments.getAvailableSlotsQuery);
  const { data: availabilityCheck, isLoading: isCheckingAvailability } =
    useQuery({
      queryKey: [
        "gabinet.availableSlots",
        organizationId,
        selectedId,
        appointmentDate,
        durationMinutes,
      ],
      queryFn: () =>
        getAvailableSlots({
          organizationId,
          userId: selectedId!,
          date: appointmentDate,
          duration: durationMinutes,
        }),
      enabled: !!selectedId,
    });

  // Check if the current slot specifically is available for the selected employee
  const isSlotAvailable = useMemo(() => {
    if (!selectedId || !availabilityCheck) return false;
    return availabilityCheck.some(
      (slot: { start: string; end: string }) =>
        slot.start === startTime && slot.end === endTime,
    );
  }, [selectedId, availabilityCheck, startTime, endTime]);

  // Find next available slot if current is not available
  const shouldSearchSlot =
    !!selectedId && !isCheckingAvailability && !isSlotAvailable;
  const findNextSlotAction = useAction(api.gabinet.scheduling.findNextAvailableSlot);
  const { data: nextSlot, isLoading: isSearchingSlot } = useQuery({
    queryKey: [
      "gabinet.findNextAvailableSlot",
      organizationId,
      selectedId,
      durationMinutes,
      appointmentDate,
    ],
    queryFn: () =>
      findNextSlotAction({
        organizationId,
        employeeId: selectedId!,
        durationMinutes,
        fromDate: appointmentDate,
      }),
    enabled: shouldSearchSlot,
  });

  // Check qualification for selected employee
  const selectedRow = employees.find((e) => e.employeeDoc.userId === selectedId);
  const isQualified = selectedRow?.isQualified ?? false;

  // Determine what action is possible
  const canAssignDirect = selectedId && isSlotAvailable && isQualified;
  const canRebook =
    selectedId && !isSlotAvailable && isQualified && nextSlot && useNewSlot;

  const handleConfirm = async () => {
    if (!selectedId) return;
    setIsSubmitting(true);
    try {
      if (canAssignDirect) {
        // Same slot, just change employee
        await updateAppointment({
          organizationId,
          appointmentId,
          employeeId: selectedId,
        });
        toast.success(
          t("gabinet.appointments.employeeChanged", "Zmieniono pracownika"),
        );
      } else if (canRebook && nextSlot) {
        // Rebook to new slot with new employee
        await updateAppointment({
          organizationId,
          appointmentId,
          employeeId: selectedId,
          date: nextSlot.date,
          startTime: nextSlot.startTime,
          endTime: nextSlot.endTime,
        });
        toast.success(
          t(
            "gabinet.appointments.employeeChangedAndRebooked",
            "Zmieniono pracownika i przeniesiono wizytę",
          ),
        );
      }
      onOpenChange(false);
      setSelectedId(null);
      setUseNewSlot(false);
    } catch (err: any) {
      toast.error(err.message ?? t("common.error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setSelectedId(null);
      setUseNewSlot(false);
    }
    onOpenChange(open);
  };

  const isLoading = isCheckingAvailability || isSearchingSlot;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("gabinet.appointments.changeEmployee", "Zmień pracownika")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "gabinet.appointments.changeEmployeeDesc",
              "Wybierz nowego pracownika. System sprawdzi dostępność w terminie wizyty.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[320px] overflow-y-auto -mx-1 px-1">
          <div className="space-y-1">
            {employees.map((emp) => {
              const isSelected = selectedId === emp.employeeDoc.userId;
              return (
                <button
                  key={emp.employeeDoc._id}
                  type="button"
                  onClick={() => {
                    setSelectedId(emp.employeeDoc.userId);
                    setUseNewSlot(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-transparent hover:bg-muted/50",
                  )}
                >
                  <Avatar className="h-8 w-8 bg-cyan-100 dark:bg-cyan-900/50">
                    <AvatarFallback className="text-xs font-medium bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300">
                      {emp.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{emp.name}</p>
                    {emp.employeeDoc.specialization && (
                      <p className="text-xs text-muted-foreground truncate">
                        {emp.employeeDoc.specialization}
                      </p>
                    )}
                  </div>
                  {!emp.isQualified && (
                    <Badge
                      variant="outline"
                      className="shrink-0 text-[10px] border-amber-300 text-amber-600 dark:text-amber-400"
                    >
                      <ShieldAlert
                        size={10}
                        variant="stroke"
                        className="mr-0.5"
                      />
                      {t("gabinet.appointments.notQualified", "Bez kwalifikacji")}
                    </Badge>
                  )}
                </button>
              );
            })}
            {employees.length === 0 && (
              <Empty className="py-8">
                <EmptyHeader>
                  <EmptyMedia>
                    <StackedCardsIllustration />
                  </EmptyMedia>
                  <EmptyTitle className="text-base">
                    {t(
                      "gabinet.appointments.noOtherEmployees",
                      "Brak innych pracowników",
                    )}
                  </EmptyTitle>
                  <EmptyDescription>
                    {t(
                      "gabinet.appointments.noOtherEmployeesDesc",
                      "Nie ma innych aktywnych pracowników do przypisania.",
                    )}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        </div>

        {/* Availability status for selected employee */}
        {selectedId && (
          <>
            <Separator />
            <div className="space-y-3">
              {isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2
                    size={14}
                    variant="stroke"
                    className="animate-spin"
                  />
                  {t(
                    "gabinet.appointments.checkingAvailability",
                    "Sprawdzanie dostępności...",
                  )}
                </div>
              ) : !isQualified ? (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900/50 dark:bg-amber-950/30">
                  <ShieldAlert
                    size={16}
                    variant="stroke"
                    className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
                  />
                  <div>
                    <p className="font-medium text-amber-800 dark:text-amber-300">
                      {t(
                        "gabinet.appointments.employeeNotQualified",
                        "Pracownik nie ma kwalifikacji do tego zabiegu",
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-500">
                      {t(
                        "gabinet.appointments.qualificationRequired",
                        "Zmiana pracownika bez odpowiednich kwalifikacji nie jest możliwa.",
                      )}
                    </p>
                  </div>
                </div>
              ) : isSlotAvailable ? (
                <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900/50 dark:bg-emerald-950/30">
                  <CheckCircle
                    size={16}
                    variant="stroke"
                    className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                  />
                  <div>
                    <p className="font-medium text-emerald-800 dark:text-emerald-300">
                      {t(
                        "gabinet.appointments.slotAvailable",
                        "Termin jest dostępny",
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-500">
                      {appointmentDate}, {startTime}–{endTime}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900/50 dark:bg-red-950/30">
                    <AlertTriangle
                      size={16}
                      variant="stroke"
                      className="mt-0.5 shrink-0 text-red-600 dark:text-red-400"
                    />
                    <div>
                      <p className="font-medium text-red-800 dark:text-red-300">
                        {t(
                          "gabinet.appointments.slotConflict",
                          "Pracownik jest zajęty w tym terminie",
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-red-600 dark:text-red-500">
                        {appointmentDate}, {startTime}–{endTime}
                      </p>
                    </div>
                  </div>

                  {nextSlot ? (
                    <button
                      type="button"
                      onClick={() => setUseNewSlot(!useNewSlot)}
                      className={cn(
                        "flex w-full items-start gap-2 rounded-md border p-3 text-left text-sm transition-colors",
                        useNewSlot
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/50",
                      )}
                    >
                      <Calendar
                        size={16}
                        variant="stroke"
                        className="mt-0.5 shrink-0 text-primary"
                      />
                      <div className="flex-1">
                        <p className="font-medium">
                          {t(
                            "gabinet.appointments.suggestedSlot",
                            "Najbliższy wolny termin",
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDatePl(nextSlot.date)},{" "}
                          {nextSlot.startTime}–{nextSlot.endTime}
                        </p>
                        {useNewSlot && (
                          <p className="mt-1 text-xs text-primary">
                            {t(
                              "gabinet.appointments.willRebook",
                              "Wizyta zostanie przeniesiona na ten termin",
                            )}
                          </p>
                        )}
                      </div>
                      <div
                        className={cn(
                          "mt-0.5 size-4 shrink-0 rounded-full border-2 transition-colors",
                          useNewSlot
                            ? "border-primary bg-primary"
                            : "border-muted-foreground/30",
                        )}
                      >
                        {useNewSlot && (
                          <svg
                            viewBox="0 0 16 16"
                            fill="none"
                            className="size-full text-primary-foreground"
                          >
                            <path
                              d="M12 5L6.5 10.5L4 8"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </div>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                      <Clock size={14} variant="stroke" />
                      {t(
                        "gabinet.appointments.noSlotFound",
                        "Brak wolnych terminów w najbliższych 30 dniach",
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            {t("common.cancel", "Anuluj")}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              isSubmitting ||
              isLoading ||
              !selectedId ||
              !isQualified ||
              (!isSlotAvailable && !canRebook)
            }
          >
            {isSubmitting ? (
              <>
                <Loader2
                  size={14}
                  variant="stroke"
                  className="mr-2 animate-spin"
                />
                {t("common.saving", "Zapisywanie...")}
              </>
            ) : canRebook ? (
              <>
                <RefreshCcw size={14} variant="stroke" className="mr-2" />
                {t(
                  "gabinet.appointments.changeAndRebook",
                  "Zmień i przenieś wizytę",
                )}
              </>
            ) : (
              t(
                "gabinet.appointments.confirmChangeEmployee",
                "Zmień pracownika",
              )
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
