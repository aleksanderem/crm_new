import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "@/lib/ez-icons";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_app/patient/_layout/appointments")({
  component: PatientAppointments,
});

function PatientAppointments() {
  const { t } = useTranslation();
  const tokenHash =
    typeof window !== "undefined"
      ? (localStorage.getItem("patientPortalToken") ?? "")
      : "";

  const { data: appointments } = useQuery(
    convexQuery(api.gabinet.patientPortal.getMyAppointments, { tokenHash }),
  );

  const today = new Date().toISOString().split("T")[0];

  const { upcoming, past } = useMemo(() => {
    const all = appointments ?? [];
    return {
      upcoming: all
        .filter((a) => a.date >= today)
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            a.startTime.localeCompare(b.startTime),
        ),
      past: all
        .filter((a) => a.date < today)
        .sort(
          (a, b) =>
            b.date.localeCompare(a.date) ||
            b.startTime.localeCompare(a.startTime),
        ),
    };
  }, [appointments, today]);

  const statusColor = (s: string) => {
    switch (s) {
      case "scheduled":
        return "outline" as const;
      case "confirmed":
        return "default" as const;
      case "completed":
        return "secondary" as const;
      case "cancelled":
        return "destructive" as const;
      default:
        return "secondary" as const;
    }
  };

  const renderList = (items: typeof upcoming, emptyMsg: string) => {
    if (items.length === 0) {
      return (
        <div className="p-6 text-center text-sm text-muted-foreground">
          {emptyMsg}
        </div>
      );
    }
    return (
      <div className="divide-y">
        {items.map((a) => (
          <div
            key={a._id}
            className="flex items-center justify-between px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium">{a.treatmentName}</p>
              <p className="text-xs text-muted-foreground">
                {a.date} · {a.startTime}–{a.endTime}
              </p>
              {a.notes && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {a.notes}
                </p>
              )}
            </div>
            <Badge variant={statusColor(a.status)}>
              {a.status.replace("_", " ")}
            </Badge>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {t("patientPortal.appointments.title")}
        </h1>
        <Button asChild size="sm">
          <Link to="/patient/book">
            <Plus className="mr-1 h-4 w-4" variant="stroke" />
            {t("patientPortal.booking.bookButton")}
          </Link>
        </Button>
      </div>

      <div className="rounded-lg border">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">
            {t("patientPortal.appointments.upcoming")}
          </h3>
        </div>
        {renderList(upcoming, t("patientPortal.appointments.noUpcoming"))}
      </div>

      <div className="rounded-lg border">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">
            {t("patientPortal.appointments.past")}
          </h3>
        </div>
        {renderList(past, t("patientPortal.appointments.noPast"))}
      </div>
    </div>
  );
}
