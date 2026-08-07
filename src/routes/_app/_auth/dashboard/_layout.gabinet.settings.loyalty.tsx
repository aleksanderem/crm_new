import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useSupabaseGabinetLoyaltyTiersList } from "@/hooks/use-supabase-gabinet-loyalty-tiers";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { SectionHeader } from "@untitled/app/section-headers/section-headers";
import { UntitledAlert } from "@/components/ui/untitled-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Pencil } from "@/lib/ez-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";
import { PermissionGate, usePermission } from "@/hooks/use-permission";
import { Skeleton } from "@/components/ui/skeleton";
import type { GabinetLoyaltyTierRow } from "@/lib/supabase/database.types";

function LoyaltyTiersSettingsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/settings/loyalty"
)({
  component: () => (
    <PermissionGate feature="gabinet_settings" action="view" loadingFallback={<LoyaltyTiersSettingsSkeleton />}>
      <LoyaltyTiersSettings />
    </PermissionGate>
  ),
});

function LoyaltyTiersSettings() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const { allowed: canEdit } = usePermission("gabinet_settings", "edit");
  const [editingTier, setEditingTier] = useState<GabinetLoyaltyTierRow | null>(null);
  const [seeding, setSeeding] = useState(false);

  const upsertTier = useAction(api.gabinet.loyaltyTiers.upsert);
  const seedDefaultsAction = useAction(api.gabinet.loyaltyTiers.seedDefaults);

  const queryClient = useQueryClient();

  const { data: tiers } = useSupabaseGabinetLoyaltyTiersList(organizationId);

  const handleSeedDefaults = async () => {
    setSeeding(true);
    try {
      await seedDefaultsAction({ organizationId });
      toast.success(t("gabinet.loyalty.tierSettings.seeded"));
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetLoyaltyTiers.list(organizationId) });
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "common.errors.saveFailed",
          defaultValue: "Nie udało się przywrócić domyślnych wartości.",
        }),
      );
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <SectionHeader.Root className="pt-4">
        <SectionHeader.Group>
          <SectionHeader.Heading className="flex-1">
            {t("gabinet.loyalty.tierSettings.title")}
          </SectionHeader.Heading>
          {canEdit && (
            <SectionHeader.Actions>
              <Button variant="outline" onClick={handleSeedDefaults} disabled={seeding}>
                {t("gabinet.loyalty.tierSettings.seedDefaults")}
              </Button>
            </SectionHeader.Actions>
          )}
        </SectionHeader.Group>
        <UntitledAlert>{t("gabinet.loyalty.tierSettings.description")}</UntitledAlert>
      </SectionHeader.Root>

      <div className="space-y-2">
        {tiers?.map((tier) => (
          <Card key={tier.id}>
            <CardContent className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                {tier.color && (
                  <span
                    className="h-4 w-4 rounded-full shrink-0"
                    style={{ backgroundColor: tier.color }}
                  />
                )}
                <div>
                  <p className="text-sm font-medium">{tier.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("gabinet.loyalty.tierSettings.threshold")}: {tier.threshold}
                  </p>
                </div>
              </div>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setEditingTier(tier)}
                >
                  <Pencil className="h-4 w-4" variant="stroke" />
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {editingTier && (
        <TierEditDialog
          open={!!editingTier}
          onClose={() => setEditingTier(null)}
          tier={editingTier}
          onSubmit={async (data) => {
            await upsertTier({
              organizationId,
              tier: editingTier.tier as "bronze" | "silver" | "gold" | "platinum",
              name: data.name,
              threshold: data.threshold,
              color: data.color,
            });
            toast.success(t("gabinet.loyalty.tierSettings.saved"));
            void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetLoyaltyTiers.list(organizationId) });
            setEditingTier(null);
          }}
          t={t}
        />
      )}
    </div>
  );
}

function TierEditDialog({
  open,
  onClose,
  tier,
  onSubmit,
  t,
}: {
  open: boolean;
  onClose: () => void;
  tier: GabinetLoyaltyTierRow;
  onSubmit: (data: { name: string; threshold: number; color?: string }) => Promise<void>;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const [name, setName] = useState(tier.name);
  const [threshold, setThreshold] = useState(String(tier.threshold));
  const [color, setColor] = useState(tier.color ?? "#888888");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    const parsedThreshold = parseInt(threshold, 10);
    if (!name.trim() || isNaN(parsedThreshold)) return;
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        threshold: parsedThreshold,
        color: color || undefined,
      });
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "common.errors.saveFailed",
          defaultValue: "Nie udało się zapisać poziomu lojalnościowego.",
        }),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("gabinet.loyalty.tierSettings.edit")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t("common.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>{t("gabinet.loyalty.tierSettings.threshold")}</Label>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t("gabinet.loyalty.tierSettings.thresholdHint")}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>{t("gabinet.employees.color")}</Label>
            <input
              type="color"
              className="h-9 w-16 cursor-pointer rounded border bg-transparent"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || isNaN(parseInt(threshold, 10)) || saving}
          >
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
