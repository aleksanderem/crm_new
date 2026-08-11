import { Card, CardContent } from "@/components/ui/card";
import { Calendar, Sparkles } from "@/lib/ez-icons";
import { plateJsonToText } from "@/components/gabinet/rich-text-editor";
import type { MappedGabinetAppointment } from "@/lib/supabase/mappers/gabinet/appointments";

export function PatientBeautyPlanTab({
  beautyPlanEntries,
  getApptTreatmentDisplay,
  navigate,
  t,
}: {
  beautyPlanEntries: MappedGabinetAppointment[];
  getApptTreatmentDisplay: (apt?: MappedGabinetAppointment | null) => string | undefined;
  navigate: (opts: { to: string; params?: Record<string, string>; search?: Record<string, string> }) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" variant="stroke" />
          {t("gabinet.patients.beautyPlan.title", "Historia beauty plan")}
        </h3>
      </div>
      <p className="text-sm text-muted-foreground">
        {t(
          "gabinet.patients.beautyPlan.description",
          "Plany zabiegowe zaproponowane podczas wizyt — najnowsze na górze.",
        )}
      </p>
      {beautyPlanEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Sparkles className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            {t(
              "gabinet.patients.beautyPlan.empty",
              'Brak beauty plan. Plany dodane w zakładce „Notatki z wizyty” pojawią się tutaj.',
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {beautyPlanEntries.map((apt) => {
            const treatmentDisplayName = getApptTreatmentDisplay(apt);
            const planText = plateJsonToText(apt.interviewNotes).trim();
            return (
              <Card
                key={apt._id}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() =>
                  navigate({
                    to: "/dashboard/gabinet/appointments/$appointmentId",
                    params: { appointmentId: apt._id },
                    search: { tab: "documentation" },
                  })
                }
              >
                <CardContent className="pt-4 pb-4 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Calendar
                        className="h-4 w-4 text-muted-foreground shrink-0"
                        variant="stroke"
                      />
                      <p className="text-sm font-medium truncate">
                        {treatmentDisplayName ?? t("common.unknown")}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {apt.date}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">
                    {planText}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
