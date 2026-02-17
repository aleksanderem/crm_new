import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

interface PackageUsageSelectorProps {
  patientId: string;
  treatmentId: string;
  organizationId: Id<"organizations">;
  onSelect: (packageUsageId: string | null) => void;
  selectedUsageId?: string | null;
}

export function PackageUsageSelector({
  patientId,
  treatmentId,
  organizationId,
  onSelect,
  selectedUsageId,
}: PackageUsageSelectorProps) {
  const { t } = useTranslation();

  const { data: usages } = useQuery(
    convexQuery(api["gabinet/packages"].getPatientPackages, {
      organizationId,
      patientId: patientId as Id<"gabinetPatients">,
    })
  );

  const { data: allPackages } = useQuery(
    convexQuery(api["gabinet/packages"].listActive, { organizationId })
  );

  const packageMap = new Map(
    (allPackages ?? []).map((p) => [p._id, p.name])
  );

  if (!patientId || !treatmentId || !usages) return null;

  // Find active usages that have remaining uses for this treatment
  const eligibleUsages = usages.filter((u) => {
    if (u.status !== "active") return false;
    if (u.expiresAt && u.expiresAt < Date.now()) return false;
    const entry = u.treatmentsUsed.find((tu) => tu.treatmentId === treatmentId);
    return entry && entry.usedCount < entry.totalCount;
  });

  if (eligibleUsages.length === 0) return null;

  return (
    <div className="space-y-2">
      {eligibleUsages.map((usage) => {
        const entry = usage.treatmentsUsed.find((tu) => tu.treatmentId === treatmentId)!;
        const pkgName = packageMap.get(usage.packageId) ?? t("common.unknown");
        const remaining = entry.totalCount - entry.usedCount;
        const isChecked = selectedUsageId === usage._id;

        return (
          <label
            key={usage._id}
            className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
          >
            <Checkbox
              checked={isChecked}
              onCheckedChange={(checked) => {
                onSelect(checked ? usage._id : null);
              }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">
                {t("gabinet.packages.usePackage", "Use package")}: {pkgName}
              </p>
              <p className="text-xs text-muted-foreground">
                {remaining}/{entry.totalCount} {t("gabinet.packages.remaining", "remaining")}
              </p>
            </div>
            {isChecked && (
              <Badge variant="secondary">
                {t("gabinet.packages.coveredByPackage", "Covered by package")}
              </Badge>
            )}
          </label>
        );
      })}
    </div>
  );
}
