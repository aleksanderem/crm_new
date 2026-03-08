import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { ArrowLeft, ArrowRight, CalendarCheck, Check } from "@/lib/ez-icons";
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { Id } from "@cvx/_generated/dataModel";

export const Route = createFileRoute("/_app/patient/_layout/book")({
  component: PatientBooking,
});

type Step = "treatment" | "employee" | "date" | "time" | "confirm";

const STEPS: Step[] = ["treatment", "employee", "date", "time", "confirm"];

function usePortalToken() {
  return typeof window !== "undefined"
    ? localStorage.getItem("patientPortalToken") ?? ""
    : "";
}

function PatientBooking() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const tokenHash = usePortalToken();

  const [step, setStep] = useState<Step>("treatment");
  const [selectedTreatment, setSelectedTreatment] = useState<{
    _id: Id<"gabinetTreatments">;
    name: string;
    duration: number;
    price: number;
    currency: string;
  } | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<{
    userId: Id<"users">;
    firstName: string;
    lastName: string;
  } | null>(null);
  const [anyEmployee, setAnyEmployee] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const bookMutation = useMutation(api.gabinet.patientPortal.bookFromPortal);

  const { data: treatments } = useQuery(
    convexQuery(api.gabinet.patientPortal.getBookableTreatments, { tokenHash }),
  );

  const { data: employees } = useQuery(
    convexQuery(
      api.gabinet.patientPortal.getQualifiedEmployees,
      selectedTreatment
        ? { tokenHash, treatmentId: selectedTreatment._id }
        : "skip",
    ),
  );

  const dateStr = selectedDate
    ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`
    : "";

  const { data: slots } = useQuery(
    convexQuery(
      api.gabinet.patientPortal.getPublicAvailableSlots,
      selectedEmployee && selectedDate && selectedTreatment
        ? {
            tokenHash,
            employeeId: selectedEmployee.userId,
            date: dateStr,
            duration: selectedTreatment.duration,
          }
        : "skip",
    ),
  );

  const stepIndex = STEPS.indexOf(step);

  const goBack = () => {
    if (stepIndex > 0) {
      const prevStep = STEPS[stepIndex - 1];
      setStep(prevStep);
      // Clear dependent selections when going back
      if (prevStep === "treatment") {
        setSelectedEmployee(null);
        setAnyEmployee(false);
        setSelectedDate(undefined);
        setSelectedTime(null);
      } else if (prevStep === "employee") {
        setSelectedDate(undefined);
        setSelectedTime(null);
      } else if (prevStep === "date") {
        setSelectedTime(null);
      }
    }
  };

  const handleSelectTreatment = (treatment: NonNullable<typeof treatments>[number]) => {
    setSelectedTreatment(treatment);
    setSelectedEmployee(null);
    setAnyEmployee(false);
    setSelectedDate(undefined);
    setSelectedTime(null);
    setStep("employee");
  };

  const handleSelectEmployee = (employee: NonNullable<typeof employees>[number]) => {
    setSelectedEmployee({
      userId: employee.userId,
      firstName: employee.firstName,
      lastName: employee.lastName,
    });
    setAnyEmployee(false);
    setSelectedDate(undefined);
    setSelectedTime(null);
    setStep("date");
  };

  const handleSelectAnyEmployee = () => {
    setAnyEmployee(true);
    setSelectedEmployee(null);
    setSelectedDate(undefined);
    setSelectedTime(null);
    setStep("date");
  };

  const handleSelectDate = (date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
    setSelectedTime(null);

    // If "any employee" was chosen, pick the first qualified employee for slot lookup
    if (anyEmployee && employees && employees.length > 0) {
      setSelectedEmployee({
        userId: employees[0].userId,
        firstName: employees[0].firstName,
        lastName: employees[0].lastName,
      });
    }

    setStep("time");
  };

  const handleSelectTime = (time: string) => {
    setSelectedTime(time);
    setStep("confirm");
  };

  const handleSubmit = async () => {
    if (!selectedTreatment || !selectedDate || !selectedTime) return;
    setIsSubmitting(true);
    try {
      await bookMutation({
        tokenHash,
        treatmentId: selectedTreatment._id,
        employeeId: anyEmployee ? undefined : selectedEmployee?.userId,
        preferredDate: dateStr,
        preferredTime: selectedTime,
      });
      toast.success(t("patientPortal.booking.success"));
      navigate({ to: "/patient/appointments" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Booking failed";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const groupedTreatments = useMemo(() => {
    if (!treatments) return new Map<string, typeof treatments>();
    const map = new Map<string, NonNullable<typeof treatments>>();
    for (const t of treatments) {
      const cat = t.category ?? "Inne";
      const existing = map.get(cat) ?? [];
      map.set(cat, [...existing, t]);
    }
    return map;
  }, [treatments]);

  return (
    <div className="space-y-4">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        {stepIndex > 0 ? (
          <Button variant="ghost" size="icon" onClick={goBack} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" variant="stroke" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate({ to: "/patient/appointments" })}
            className="h-8 w-8"
          >
            <ArrowLeft className="h-4 w-4" variant="stroke" />
          </Button>
        )}
        <h1 className="text-xl font-semibold">{t("patientPortal.booking.title")}</h1>
      </div>

      {/* Step indicators */}
      <div className="flex gap-1">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full ${
              i <= stepIndex ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>

      {/* Step: Treatment */}
      {step === "treatment" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("patientPortal.booking.selectTreatment")}
          </p>
          {!treatments ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t("patientPortal.booking.loading")}
            </div>
          ) : treatments.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t("patientPortal.booking.noTreatments")}
            </div>
          ) : (
            <div className="space-y-4">
              {[...groupedTreatments.entries()].map(([category, items]) => (
                <div key={category}>
                  <h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                    {category}
                  </h3>
                  <div className="space-y-2">
                    {items.map((treatment) => (
                      <button
                        key={treatment._id}
                        type="button"
                        onClick={() => handleSelectTreatment(treatment)}
                        className="flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 active:bg-muted"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{treatment.name}</p>
                          {treatment.description && (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {treatment.description}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-muted-foreground">
                            {treatment.duration} min
                          </p>
                        </div>
                        <div className="ml-3 flex flex-col items-end">
                          <span className="text-sm font-semibold">
                            {treatment.price} {treatment.currency}
                          </span>
                          <ArrowRight className="mt-1 h-4 w-4 text-muted-foreground" variant="stroke" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step: Employee */}
      {step === "employee" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("patientPortal.booking.selectEmployee")}
          </p>
          <button
            type="button"
            onClick={handleSelectAnyEmployee}
            className="flex w-full items-center justify-between rounded-lg border border-dashed p-3 text-left transition-colors hover:bg-muted/50 active:bg-muted"
          >
            <div>
              <p className="text-sm font-medium">{t("patientPortal.booking.anyEmployee")}</p>
              <p className="text-xs text-muted-foreground">
                {t("patientPortal.booking.anyEmployeeDesc")}
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" variant="stroke" />
          </button>
          {employees?.map((emp) => (
            <button
              key={emp._id}
              type="button"
              onClick={() => handleSelectEmployee(emp)}
              className="flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 active:bg-muted"
            >
              <div>
                <p className="text-sm font-medium">
                  {emp.firstName} {emp.lastName}
                </p>
                {emp.specialization && (
                  <p className="text-xs text-muted-foreground">{emp.specialization}</p>
                )}
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" variant="stroke" />
            </button>
          ))}
        </div>
      )}

      {/* Step: Date */}
      {step === "date" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("patientPortal.booking.selectDate")}
          </p>
          <div className="flex justify-center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleSelectDate}
              disabled={(date) => date < today || date.getDay() === 0}
              className="rounded-lg border"
            />
          </div>
        </div>
      )}

      {/* Step: Time */}
      {step === "time" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("patientPortal.booking.selectTime")}
          </p>
          {!slots ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t("patientPortal.booking.loading")}
            </div>
          ) : slots.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t("patientPortal.booking.noSlots")}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((slot) => (
                <button
                  key={slot.start}
                  type="button"
                  onClick={() => handleSelectTime(slot.start)}
                  className={`rounded-lg border px-3 py-2 text-center text-sm font-medium transition-colors hover:bg-primary hover:text-primary-foreground active:bg-primary/90 ${
                    selectedTime === slot.start
                      ? "bg-primary text-primary-foreground"
                      : ""
                  }`}
                >
                  {slot.start}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step: Confirm */}
      {step === "confirm" && selectedTreatment && selectedDate && selectedTime && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("patientPortal.booking.confirmDetails")}
          </p>
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {t("patientPortal.booking.treatment")}
              </span>
              <span className="text-sm font-medium">{selectedTreatment.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {t("patientPortal.booking.specialist")}
              </span>
              <span className="text-sm font-medium">
                {anyEmployee
                  ? t("patientPortal.booking.anyEmployee")
                  : `${selectedEmployee?.firstName} ${selectedEmployee?.lastName}`}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {t("patientPortal.booking.date")}
              </span>
              <span className="text-sm font-medium">{dateStr}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {t("patientPortal.booking.time")}
              </span>
              <span className="text-sm font-medium">{selectedTime}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {t("patientPortal.booking.duration")}
              </span>
              <span className="text-sm font-medium">{selectedTreatment.duration} min</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {t("patientPortal.booking.price")}
              </span>
              <span className="text-sm font-semibold">
                {selectedTreatment.price} {selectedTreatment.currency}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950">
            <p className="text-xs text-blue-800 dark:text-blue-200">
              {t("patientPortal.booking.pendingNote")}
            </p>
          </div>

          <Button
            className="w-full"
            size="lg"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              t("patientPortal.booking.submitting")
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" variant="stroke" />
                {t("patientPortal.booking.submit")}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
