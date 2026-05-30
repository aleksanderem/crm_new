import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sparkles, Plus } from "@/lib/ez-icons";
import { formatCurrencyPLN } from "@/lib/format-currency";
import { TreatmentPurchaseDrawer } from "./treatment-purchase-drawer";

interface PatientTreatmentsCardProps {
  patientId: string;
  organizationId: Id<"organizations">;
}

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  completed: "secondary",
  expired: "destructive",
  cancelled: "outline",
};

export function PatientTreatmentsCard({ patientId, organizationId }: PatientTreatmentsCardProps) {
  const { t } = useTranslation();
  const [purchaseOpen, setPurchaseOpen] = useState(false);

  const getPatientPackagesAction = useAction(api.gabinet.packages.getPatientPackages);
  const { data: usages } = useQuery({
    queryKey: ["gabinet.packages.getPatientPackages", organizationId, patientId],
    queryFn: () =>
      getPatientPackagesAction({
        organizationId,
        patientId: patientId as string,
      }),
    enabled: !!organizationId && !!patientId,
  });

  const listActivePackages = useAction(api.gabinet.packages.listActive);
  const { data: allPackages } = useQuery({
    queryKey: ["gabinet.packages.listActive", organizationId],
    queryFn: () => listActivePackages({ organizationId }),
    enabled: !!organizationId,
  });

  const listActiveTreatments = useAction(api.gabinet.treatments.listActive);
  const { data: treatments } = useQuery({
    queryKey: ["gabinet.treatments.listActive", organizationId],
    queryFn: () => listActiveTreatments({ organizationId }),
    enabled: !!organizationId,
  });

  const treatmentMap = new Map((treatments ?? []).map((tr) => [tr._id, tr.name]));
  const packageMap = new Map((allPackages ?? []).map((p) => [p._id, p]));

  // Single-session purchases of one treatment ("zabieg"). Multi-session sales
  // (e.g. "Endermologia 10x") live in PatientPackagesCard with the other packages.
  const items = (usages ?? []).filter((usage) => {
    if (usage.treatmentsUsed.length !== 1) return false;
    return usage.treatmentsUsed[0].totalCount <= 1;
  });

  const getExpiryColor = (expiresAt?: number) => {
    if (!expiresAt) return "text-muted-foreground";
    const daysLeft = Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 0) return "text-destructive";
    if (daysLeft <= 7) return "text-orange-500";
    return "text-muted-foreground";
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {t("gabinet.treatments.patientTreatments", "Zabiegi")}
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-7" onClick={() => setPurchaseOpen(true)}>
              <Plus className="mr-1 h-[17px] w-[17px]" variant="stroke" />
              {t("gabinet.treatments.addOrSell", "Dodaj/Sprzedaj")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Sparkles className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">
                {t("gabinet.treatments.noPatientTreatments", "Brak zakupionych zabiegów")}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((usage) => {
                const pkg = packageMap.get(usage.packageId);
                const tu = usage.treatmentsUsed[0];
                const treatmentName = tu
                  ? treatmentMap.get(tu.treatmentId) ?? t("common.unknown")
                  : t("common.unknown");
                const pct = tu && tu.totalCount > 0 ? (tu.usedCount / tu.totalCount) * 100 : 0;
                const currency = pkg?.currency ?? "PLN";

                return (
                  <div
                    key={usage._id}
                    className="rounded-lg border p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium leading-tight">{treatmentName}</span>
                      <Badge variant={statusColors[usage.status] ?? "secondary"} className="shrink-0">
                        {t(`gabinet.packages.status.${usage.status}`, usage.status)}
                      </Badge>
                    </div>

                    {tu && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{t("gabinet.packages.used", "Wykorzystano")}</span>
                          <span>{tu.usedCount}/{tu.totalCount}</span>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{t("gabinet.packages.paidAmount", "Zapłacono")}</span>
                      <span className="font-medium">
                        {formatCurrencyPLN(usage.paidAmount, currency)}
                      </span>
                    </div>

                    {usage.expiresAt && (
                      <p className={`text-xs ${getExpiryColor(usage.expiresAt)}`}>
                        {t("gabinet.packages.expires", "Wygasa")}:{" "}
                        {new Date(usage.expiresAt).toLocaleDateString("pl-PL")}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <TreatmentPurchaseDrawer
        patientId={patientId}
        organizationId={organizationId}
        open={purchaseOpen}
        onOpenChange={setPurchaseOpen}
      />
    </>
  );
}
