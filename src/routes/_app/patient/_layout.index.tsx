import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck, Heart } from "@/lib/ez-icons";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_app/patient/_layout/")({
  component: PatientDashboard,
});

function usePortalSession() {
  const sessionId = typeof window !== "undefined" ? localStorage.getItem("patientPortalSessionId") ?? "" : "";
  const token = typeof window !== "undefined" ? localStorage.getItem("patientPortalToken") ?? "" : "";
  return { sessionId, token };
}

function PatientDashboard() {
  const { t } = useTranslation();
  const { sessionId, token } = usePortalSession();

  const { data: profile } = useQuery(
    convexQuery(api["gabinet/patientPortal"].getMyProfile, { sessionId, token })
  );

  const { data: appointments } = useQuery(
    convexQuery(api["gabinet/patientPortal"].getMyAppointments, { sessionId, token })
  );

  const { data: loyaltyBalance } = useQuery(
    convexQuery(api["gabinet/patientPortal"].getMyLoyaltyBalance, { sessionId, token })
  );

  const upcoming = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return (appointments ?? [])
      .filter((a) => a.date >= today && a.status !== "cancelled")
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
      .slice(0, 5);
  }, [appointments]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">
          {t("patientPortal.dashboard.welcome", { name: profile?.firstName ?? "" })}
        </h1>
        <p className="text-sm text-muted-foreground">{t("patientPortal.dashboard.subtitle")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <CalendarCheck className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">{t("patientPortal.dashboard.upcomingAppointments")}</p>
              <p className="text-2xl font-bold">{upcoming.length}</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <Heart className="h-5 w-5 text-pink-500" />
            <div>
              <p className="text-sm text-muted-foreground">{t("patientPortal.dashboard.loyaltyPoints")}</p>
              <p className="text-2xl font-bold">{loyaltyBalance?.balance ?? 0}</p>
              {loyaltyBalance?.tier && (
                <p className="text-xs text-muted-foreground capitalize">{loyaltyBalance.tier}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Upcoming appointments */}
      <div className="rounded-lg border">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">{t("patientPortal.dashboard.nextAppointments")}</h3>
        </div>
        {upcoming.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {t("patientPortal.dashboard.noUpcoming")}
          </div>
        ) : (
          <div className="divide-y">
            {upcoming.map((a) => (
              <div key={a._id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{a.treatmentName}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.date} · {a.startTime}–{a.endTime}
                  </p>
                </div>
                <Badge variant="outline">{a.status.replace("_", " ")}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
