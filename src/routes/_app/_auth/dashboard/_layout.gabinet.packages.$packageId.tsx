import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useOrganization } from "@/components/org-context";
import {
  useSupabaseGabinetTreatmentPackagesList,
  useSupabaseGabinetPackageUsageActive,
  useSupabaseGabinetPackageUsageUnassigned,
} from "@/hooks/use-supabase-gabinet-packages";
import { useSupabaseGabinetTreatmentsList } from "@/hooks/use-supabase-gabinet-treatments";
import { useSupabaseGabinetPatientsList } from "@/hooks/use-supabase-gabinet-patients";
import { useTagDefinitions } from "@/hooks/use-tag-definitions";
import { useCategoryDefinitions } from "@/hooks/use-category-definitions";
import { EntityDetailLayout } from "@/components/crm/entity-detail-layout";
import { EmptyState } from "@/components/layout/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { plateJsonToText } from "@/components/gabinet/rich-text-editor";
import { PermissionGate } from "@/hooks/use-permission";
import { Skeleton } from "@/components/ui/skeleton";
import { Gift, Package } from "@/lib/ez-icons";
import type { MappedGabinetPackageUsage } from "@/lib/supabase/mappers/gabinet/package-usage";

function PackageDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-md" />
        <Skeleton className="h-7 w-56" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/packages/$packageId",
)({
  component: () => (
    <PermissionGate
      feature="gabinet_packages"
      action="view"
      loadingFallback={<PackageDetailSkeleton />}
    >
      <PackageDetail />
    </PermissionGate>
  ),
});

function usageProgress(usage: MappedGabinetPackageUsage): {
  used: number;
  total: number;
} {
  let used = 0;
  let total = 0;
  for (const tu of usage.treatmentsUsed) {
    used += tu.usedCount;
    total += tu.totalCount;
  }
  return { used, total };
}

function ProgressBar({ used, total }: { used: number; total: number }) {
  if (total === 0) return <span className="text-fg-quaternary">—</span>;
  const percent = Math.round((used / total) * 100);
  const remainingRatio = 1 - used / total;
  const barColor =
    remainingRatio <= 0.1
      ? "bg-red-500"
      : remainingRatio < 0.3
        ? "bg-amber-500"
        : "bg-emerald-500";
  return (
    <div className="w-32 space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="tabular-nums">
          {used} / {total}
        </span>
        <span className="text-fg-quaternary tabular-nums">{percent}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function PackageDetail() {
  const { packageId } = Route.useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { organizationId } = useOrganization();

  const { data: packagesData, isLoading } =
    useSupabaseGabinetTreatmentPackagesList(organizationId);
  const { data: treatmentsData } =
    useSupabaseGabinetTreatmentsList(organizationId);
  const { data: patientsData } = useSupabaseGabinetPatientsList(organizationId);
  const { data: activeUsagesData } =
    useSupabaseGabinetPackageUsageActive(organizationId);
  const { data: unassignedUsagesData } =
    useSupabaseGabinetPackageUsageUnassigned(organizationId);
  const { tags } = useTagDefinitions(organizationId);
  const { categories } = useCategoryDefinitions(
    organizationId,
    "gabinetPackage",
  );

  const pkg = useMemo(
    () => (packagesData ?? []).find((p) => p._id === packageId),
    [packagesData, packageId],
  );

  const treatmentNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const tr of treatmentsData ?? []) map.set(tr._id, tr.name);
    return map;
  }, [treatmentsData]);

  const patientNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of patientsData ?? [])
      map.set(p._id, `${p.firstName} ${p.lastName}`);
    return map;
  }, [patientsData]);

  const pkgActiveUsages = useMemo(
    () => (activeUsagesData ?? []).filter((u) => u.packageId === packageId),
    [activeUsagesData, packageId],
  );

  const pkgGiftUsages = useMemo(
    () => (unassignedUsagesData ?? []).filter((u) => u.packageId === packageId),
    [unassignedUsagesData, packageId],
  );

  const perTreatmentProgress = useMemo(() => {
    const agg: Record<string, { usedCount: number; totalCount: number }> = {};
    for (const u of pkgActiveUsages) {
      for (const tu of u.treatmentsUsed) {
        if (!agg[tu.treatmentId]) {
          agg[tu.treatmentId] = { usedCount: 0, totalCount: 0 };
        }
        agg[tu.treatmentId].usedCount += tu.usedCount;
        agg[tu.treatmentId].totalCount += tu.totalCount;
      }
    }
    return agg;
  }, [pkgActiveUsages]);

  const categoryName = pkg?.categoryId
    ? (categories.find((c) => c._id === pkg.categoryId)?.name ?? null)
    : null;

  const pkgTags = useMemo(
    () =>
      (pkg?.tagIds ?? [])
        .map((id) => tags.find((tg) => tg._id === id))
        .filter(Boolean) as { _id: string; name: string }[],
    [pkg?.tagIds, tags],
  );

  const descriptionText = pkg?.description
    ? plateJsonToText(pkg.description)
    : null;

  const fields = useMemo(
    () => [
      {
        fieldKey: "totalPrice",
        label: t("gabinet.packages.totalPrice", "Cena"),
        value: pkg ? `${pkg.totalPrice} ${pkg.currency ?? "PLN"}` : "—",
      },
      {
        fieldKey: "validityDays",
        label: t("gabinet.packages.validityDays", "Ważność (dni)"),
        value: pkg?.validityDays
          ? `${pkg.validityDays} ${t("gabinet.packages.days", "dni")}`
          : "—",
      },
      {
        fieldKey: "discountPercent",
        label: t("gabinet.packages.discountPercent", "Rabat"),
        value: pkg?.discountPercent ? `${pkg.discountPercent}%` : "—",
      },
      {
        fieldKey: "loyaltyPoints",
        label: t("gabinet.packages.loyaltyPoints", "Punkty lojalnościowe"),
        value: pkg?.loyaltyPointsAwarded ?? "—",
      },
      {
        fieldKey: "category",
        label: t("common.category", "Kategoria"),
        value: categoryName ?? "—",
      },
      {
        fieldKey: "tags",
        label: t("common.tags", "Tagi"),
        value: pkgTags.length ? (
          <span className="flex flex-wrap gap-1">
            {pkgTags.map((tg) => (
              <Badge key={tg._id} variant="secondary" className="text-xs">
                {tg.name}
              </Badge>
            ))}
          </span>
        ) : (
          "—"
        ),
      },
      {
        fieldKey: "createdAt",
        label: t("common.created", "Utworzono"),
        value: pkg ? new Date(pkg.createdAt).toLocaleDateString("pl-PL") : "—",
      },
      ...(descriptionText
        ? [
            {
              fieldKey: "description",
              label: t("gabinet.packages.descriptionLabel", "Opis"),
              value: (
                <span className="whitespace-pre-line">{descriptionText}</span>
              ),
            },
          ]
        : []),
    ],
    [pkg, categoryName, pkgTags, descriptionText, t],
  );

  const treatmentsTab = (
    <div className="flex flex-col gap-2">
      {(pkg?.treatments ?? []).length === 0 ? (
        <EmptyState
          icon={Package}
          title={t("gabinet.packages.noTreatments", "Brak zabiegów w pakiecie")}
          description={t(
            "gabinet.packages.noTreatmentsDescription",
            "Dodaj zabiegi do pakietu w panelu edycji.",
          )}
        />
      ) : (
        (pkg?.treatments ?? []).map((tr) => {
          const name =
            treatmentNameMap.get(tr.treatmentId) ??
            t("gabinet.packages.treatment", "Zabieg");
          const progress = perTreatmentProgress[tr.treatmentId];
          return (
            <div
              key={tr.treatmentId}
              className="flex items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <Button
                  variant="link"
                  className="h-auto p-0 font-medium"
                  onClick={() =>
                    navigate({
                      to: `/dashboard/gabinet/treatments/${tr.treatmentId}`,
                    })
                  }
                >
                  {name}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {t("gabinet.packages.perPackageQty", "Ilość w pakiecie")}:{" "}
                  {tr.quantity}
                </p>
              </div>
              {progress ? (
                <ProgressBar
                  used={progress.usedCount}
                  total={progress.totalCount}
                />
              ) : (
                <span className="text-xs text-fg-quaternary">
                  {t("gabinet.packages.noActiveUses", "brak aktywnych użyć")}
                </span>
              )}
            </div>
          );
        })
      )}
    </div>
  );

  const usagesTab = (
    <div className="flex flex-col gap-2">
      {pkgActiveUsages.length === 0 ? (
        <EmptyState
          icon={Package}
          title={t("gabinet.packages.noUsages", "Brak aktywnych wykupień")}
          description={t(
            "gabinet.packages.noUsagesDescription",
            "Sprzedane pakiety przypisane do pacjentów pojawią się tutaj.",
          )}
        />
      ) : (
        pkgActiveUsages.map((usage) => {
          const { used, total } = usageProgress(usage);
          const patientName = usage.patientId
            ? (patientNameMap.get(usage.patientId) ??
              t("gabinet.packages.unknownPatient", "Nieznany pacjent"))
            : t("gabinet.packages.unassigned", "Nieprzypisany");
          return (
            <div
              key={usage._id}
              className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-0.5">
                {usage.patientId ? (
                  <Button
                    variant="link"
                    className="h-auto p-0 font-medium"
                    onClick={() =>
                      navigate({
                        to: `/dashboard/gabinet/patients/${usage.patientId}`,
                      })
                    }
                  >
                    {patientName}
                  </Button>
                ) : (
                  <span className="font-medium">{patientName}</span>
                )}
                <p className="text-xs text-muted-foreground">
                  {t("gabinet.packages.purchasedAt", "Zakupiono")}:{" "}
                  {new Date(usage.purchasedAt).toLocaleDateString("pl-PL")}
                  {usage.expiresAt && (
                    <>
                      {" "}
                      · {t("gabinet.packages.expiresAt", "Ważny do")}:{" "}
                      {new Date(usage.expiresAt).toLocaleDateString("pl-PL")}
                    </>
                  )}{" "}
                  · {usage.paidAmount} PLN
                </p>
              </div>
              <ProgressBar used={used} total={total} />
            </div>
          );
        })
      )}
    </div>
  );

  const giftsTab = (
    <div className="flex flex-col gap-2">
      {pkgGiftUsages.length === 0 ? (
        <EmptyState
          icon={Gift}
          title={t(
            "gabinet.packages.giftEmptyTitle",
            "Brak nieprzypisanych voucherów",
          )}
          description={t(
            "gabinet.packages.giftEmptyDetailDescription",
            "Vouchery podarunkowe tego pakietu pojawią się tutaj.",
          )}
        />
      ) : (
        pkgGiftUsages.map((usage) => (
          <div
            key={usage._id}
            className="flex flex-col gap-1 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 space-y-0.5">
              {usage.voucherCode && (
                <p className="font-mono text-sm font-medium">
                  {usage.voucherCode}
                </p>
              )}
              {(usage.giftRecipientName || usage.giftRecipientEmail) && (
                <p className="text-xs text-muted-foreground">
                  {[
                    usage.giftRecipientName,
                    usage.giftRecipientPhone,
                    usage.giftRecipientEmail,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {t("gabinet.packages.purchasedAt", "Zakupiono")}:{" "}
                {new Date(usage.purchasedAt).toLocaleDateString("pl-PL")} ·{" "}
                {usage.paidAmount} PLN
              </p>
            </div>
            <Badge variant="secondary" className="w-fit shrink-0">
              {t("gabinet.packages.unassigned", "Nieprzypisany")}
            </Badge>
          </div>
        ))
      )}
    </div>
  );

  return (
    <EntityDetailLayout
      isLoading={isLoading}
      notFound={!pkg && !isLoading}
      onBack={() => navigate({ to: "/dashboard/gabinet/packages" })}
      title={pkg?.name ?? ""}
      subtitle={
        <span className="flex items-center gap-2">
          {categoryName ?? t("gabinet.packages.package", "Pakiet")}
          {pkg && !pkg.isActive && (
            <Badge variant="outline" className="text-xs">
              {t("common.inactive", "Nieaktywny")}
            </Badge>
          )}
        </span>
      }
      avatarFallback={pkg?.name?.slice(0, 2).toUpperCase()}
      onEdit={() =>
        navigate({
          to: "/dashboard/gabinet/packages",
          search: { edit: packageId },
        })
      }
      fields={fields}
      expandedFieldCount={6}
      tabs={[
        {
          label: t("gabinet.packages.tabTreatments", "Zabiegi"),
          count: pkg?.treatments.length ?? 0,
          content: treatmentsTab,
        },
        {
          label: t("gabinet.packages.tabUsages", "Aktywne wykupienia"),
          count: pkgActiveUsages.length,
          content: usagesTab,
        },
        {
          label: t("gabinet.packages.tabGifts", "Vouchery"),
          count: pkgGiftUsages.length,
          content: giftsTab,
        },
      ]}
    />
  );
}
