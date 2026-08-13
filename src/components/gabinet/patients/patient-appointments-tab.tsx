import { Button } from "@/components/ui/button";
import { Calendar, Plus } from "@/lib/ez-icons";
import type { MappedGabinetAppointment } from "@/lib/supabase/mappers/gabinet/appointments";
import { AppointmentRow } from "./appointment-row";

export function PatientAppointmentsTab({
  patientAppointments,
  getApptTreatmentDisplay,
  getVisitCountLabel,
  navigate,
  t,
}: {
  patientAppointments: MappedGabinetAppointment[] | undefined;
  getApptTreatmentDisplay: (apt?: MappedGabinetAppointment | null) => string | undefined;
  getVisitCountLabel: (apt: MappedGabinetAppointment) => { label: string; title: string } | null;
  navigate: (opts: { to: string; params?: Record<string, string> }) => void;
  t: (key: string, opts?: Record<string, unknown> | string) => string;
}) {
  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          {t("gabinet.patients.tabs.appointments")}
        </h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate({ to: "/dashboard/gabinet/calendar" })}
        >
          <Plus className="mr-1 h-4 w-4" variant="stroke" />
          {t("gabinet.appointments.createAppointment")}
        </Button>
      </div>
      {!patientAppointments || patientAppointments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Calendar className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            {t("gabinet.appointments.noAppointments")}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {[...patientAppointments]
            .sort((a, b) =>
              (b.date + b.startTime).localeCompare(a.date + a.startTime),
            )
            .map((apt) => (
              <AppointmentRow
                key={apt._id}
                apt={apt}
                visitCount={getVisitCountLabel(apt)}
                treatmentDisplayName={getApptTreatmentDisplay(apt)}
                isPast={apt.date < today}
                onClick={() =>
                  navigate({
                    to: "/dashboard/gabinet/appointments/$appointmentId",
                    params: { appointmentId: apt._id },
                  })
                }
                t={t}
              />
            ))}
        </div>
      )}
    </div>
  );
}
