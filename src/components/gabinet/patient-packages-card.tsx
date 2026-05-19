import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Package, Plus, Loader2 } from "@/lib/ez-icons";
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
              <Plus className="mr-1 h-[17px] w-[17px]" variant="stroke" />
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

                    <PackageInstallments
                      organizationId={organizationId}
                      packageUsageId={String(usage._id)}
                      currency={pkg?.currency ?? "PLN"}
                    />
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

interface PackageInstallmentsProps {
  organizationId: Id<"organizations">;
  packageUsageId: string;
  currency: string;
}

interface PaymentRow {
  _id: string;
  amount: number;
  currency: string;
  status: "pending" | "completed" | "refunded" | "cancelled";
  notes?: string | null;
  paidAt?: number | null;
}

function PackageInstallments({
  organizationId,
  packageUsageId,
  currency,
}: PackageInstallmentsProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [markingId, setMarkingId] = useState<string | null>(null);

  const listByPackageUsage = useAction(api.payments.listByPackageUsage);
  const markPaid = useAction(api.payments.markPaid);

  const queryKey = ["payments.listByPackageUsage", organizationId, packageUsageId];
  const { data: payments } = useQuery({
    queryKey,
    queryFn: () =>
      listByPackageUsage({
        organizationId,
        packageUsageId,
      }) as unknown as Promise<PaymentRow[]>,
    enabled: !!organizationId && !!packageUsageId,
  });

  const installments = (payments ?? []).filter((p) =>
    typeof p.notes === "string" && p.notes.includes("installment"),
  );

  if (installments.length === 0) return null;

  const paidCount = installments.filter((p) => p.status === "completed").length;
  const totalCount = installments.length;

  const handleMarkPaid = async (paymentId: string) => {
    setMarkingId(paymentId);
    try {
      await markPaid({
        organizationId,
        paymentId,
      });
      toast.success(t("gabinet.payments.markedPaid"));
      await queryClient.invalidateQueries({ queryKey });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t("common.error");
      toast.error(msg);
    } finally {
      setMarkingId(null);
    }
  };

  return (
    <div className="border-t pt-2 mt-2 space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">
          {t("gabinet.packages.installments", "Installments")}
        </span>
        <span className="text-muted-foreground">
          {paidCount}/{totalCount} {t("gabinet.packages.installmentsPaid", "paid")}
        </span>
      </div>
      <div className="space-y-1">
        {installments.map((payment, idx) => {
          const isPending = payment.status === "pending";
          const isMarking = markingId === payment._id;
          return (
            <div
              key={payment._id}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="text-muted-foreground">
                {t("gabinet.packages.installmentIndex", "Installment {{n}}", {
                  n: idx + 1,
                })}
              </span>
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  {payment.amount.toFixed(2)} {payment.currency ?? currency}
                </span>
                {isPending ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs"
                    disabled={isMarking}
                    onClick={() => handleMarkPaid(payment._id)}
                  >
                    {isMarking ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      t("gabinet.payments.markPaid")
                    )}
                  </Button>
                ) : (
                  <Badge
                    variant={
                      payment.status === "completed"
                        ? "secondary"
                        : payment.status === "refunded"
                          ? "destructive"
                          : "outline"
                    }
                    className="text-[10px] py-0 px-1.5"
                  >
                    {t(`gabinet.payments.status.${payment.status}`)}
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
