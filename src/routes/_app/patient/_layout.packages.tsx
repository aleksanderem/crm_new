import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_app/patient/_layout/packages")({
  component: PatientPackages,
});

function PatientPackages() {
  const { t } = useTranslation();
  const tokenHash = typeof window !== "undefined" ? localStorage.getItem("patientPortalToken") ?? "" : "";

  const { data: packages } = useQuery(
    convexQuery(api.gabinet.patientPortal.getMyPackages, { tokenHash })
  );

  const statusColor = (s: string) => {
    switch (s) {
      case "active": return "default" as const;
      case "completed": return "secondary" as const;
      case "expired": return "destructive" as const;
      case "cancelled": return "outline" as const;
      default: return "secondary" as const;
    }
  };

  const items = packages ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t("patientPortal.packages.title")}</h1>

      {items.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          {t("patientPortal.packages.empty")}
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((pkg) => {
            const totalTreatments = pkg.treatmentsUsed.reduce((sum, tu) => sum + tu.totalCount, 0);
            const usedTreatments = pkg.treatmentsUsed.reduce((sum, tu) => sum + tu.usedCount, 0);
            const progressPercent = totalTreatments > 0 ? Math.round((usedTreatments / totalTreatments) * 100) : 0;

            return (
              <div key={pkg._id} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{pkg.packageName}</p>
                    {pkg.expiresAt && (
                      <p className="text-xs text-muted-foreground">
                        {t("patientPortal.packages.expires")}: {new Date(pkg.expiresAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <Badge variant={statusColor(pkg.status)}>{pkg.status}</Badge>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t("patientPortal.packages.usage")}</span>
                    <span>{usedTreatments} / {totalTreatments}</span>
                  </div>
                  <Progress value={progressPercent} className="h-2" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
