import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Package, Plus } from "@/lib/ez-icons";
import { PackagePurchaseDrawer } from "./package-purchase-drawer";

interface PatientPackagesCardProps {
  patientId: string;
  organizationId: Id<"organizations">;
}

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  completed: "secondary",
  expired: "destructive",
  cancelled: "outline",
};

export function PatientPackagesCard({ patientId, organizationId }: PatientPackagesCardProps) {
  const { t } = useTranslation();
  const [purchaseOpen, setPurchaseOpen] = useState(false);

  const { data: usages } = useQuery(
    convexQuery(api["gabinet/packages"].getPatientPackages, {
      organizationId,
      patientId: patientId as Id<"gabinetPatients">,
    })
  );

  const { data: allPackages } = useQuery(
    convexQuery(api["gabinet/packages"].listActive, { organizationId })
  );

  const { data: treatments } = useQuery(
    convexQuery(api["gabinet/treatments"].listActive, { organizationId })
  );

  const treatmentMap = new Map(
    (treatments ?? []).map((tr) => [tr._id, tr.name])
  );

  const packageMap = new Map(
    (allPackages ?? []).map((p) => [p._id, p])
  );

  const items = usages ?? [];

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
              {t("gabinet.packages.patientPackages", "Packages")}
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-7" onClick={() => setPurchaseOpen(true)}>
              <Plus className="mr-1 h-3 w-3" />
              {t("common.add")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Package className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">
                {t("gabinet.packages.noPatientPackages", "No packages purchased")}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((usage) => {
                const pkg = packageMap.get(usage.packageId);
                const pkgName = pkg?.name ?? t("common.unknown");

                return (
                  <div key={usage._id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium leading-tight">{pkgName}</span>
                      <Badge variant={statusColors[usage.status] ?? "secondary"} className="shrink-0">
                        {t(`gabinet.packages.status.${usage.status}`, usage.status)}
                      </Badge>
                    </div>

                    {usage.treatmentsUsed.map((tu) => {
                      const pct = tu.totalCount > 0 ? (tu.usedCount / tu.totalCount) * 100 : 0;
                      return (
                        <div key={String(tu.treatmentId)} className="space-y-1">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{treatmentMap.get(tu.treatmentId) ?? t("common.unknown")}</span>
                            <span>{tu.usedCount}/{tu.totalCount}</span>
                          </div>
                          <Progress value={pct} className="h-1.5" />
                        </div>
                      );
                    })}

                    {usage.expiresAt && (
                      <p className={`text-xs ${getExpiryColor(usage.expiresAt)}`}>
                        {t("gabinet.packages.expires", "Expires")}: {new Date(usage.expiresAt).toLocaleDateString("pl-PL")}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <PackagePurchaseDrawer
        patientId={patientId}
        organizationId={organizationId}
        open={purchaseOpen}
        onOpenChange={setPurchaseOpen}
      />
    </>
  );
}
