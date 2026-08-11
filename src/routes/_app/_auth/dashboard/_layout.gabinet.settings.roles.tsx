import { useState, useEffect, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { SectionHeader } from "@untitled/app/section-headers/section-headers";
import { UntitledAlert } from "@/components/ui/untitled-alert";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { RotateCcw } from "@/lib/ez-icons";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";
import { PermissionGate, usePermission } from "@/hooks/use-permission";
import { Skeleton } from "@/components/ui/skeleton";

function GabinetRolesSettingsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/settings/roles"
)({
  component: () => (
    <PermissionGate feature="gabinet_settings" action="view" loadingFallback={<GabinetRolesSettingsSkeleton />}>
      <GabinetRolesSettingsPage />
    </PermissionGate>
  ),
});

type Scope = "none" | "own" | "all";

const GABINET_FEATURES = [
  {
    key: "gabinet_dashboard",
    labelKey: "gabinet.roles.features.dashboard",
    actions: ["view"] as const,
  },
  {
    key: "gabinet_patients",
    labelKey: "gabinet.roles.features.patients",
    actions: ["view", "create", "edit", "delete"] as const,
  },
  {
    key: "gabinet_appointments",
    labelKey: "gabinet.roles.features.appointments",
    actions: ["view", "create", "edit", "delete"] as const,
  },
  {
    key: "gabinet_treatments",
    labelKey: "gabinet.roles.features.treatments",
    actions: ["view", "create", "edit", "delete"] as const,
  },
  {
    key: "gabinet_packages",
    labelKey: "gabinet.roles.features.packages",
    actions: ["view", "create", "edit", "delete"] as const,
  },
  {
    key: "gabinet_employees",
    labelKey: "gabinet.roles.features.employees",
    actions: ["view", "create", "edit", "delete"] as const,
  },
  {
    key: "gabinet_payments",
    labelKey: "gabinet.roles.features.payments",
    actions: ["view", "create", "edit", "delete", "refund"] as const,
  },
  {
    key: "gabinet_reports",
    labelKey: "gabinet.roles.features.reports",
    actions: ["view"] as const,
  },
  {
    key: "gabinet_financial_reports",
    labelKey: "gabinet.roles.features.financial_reports",
    actions: ["view"] as const,
  },
  {
    key: "gabinet_purchase_prices",
    labelKey: "gabinet.roles.features.purchase_prices",
    actions: ["view", "create", "edit"] as const,
  },
  {
    key: "gabinet_photos",
    labelKey: "gabinet.roles.features.photos",
    actions: ["view", "create", "edit", "delete"] as const,
  },
  {
    key: "gabinet_online_booking",
    labelKey: "gabinet.roles.features.online_booking",
    actions: ["view", "create", "edit", "delete"] as const,
  },
  {
    key: "gabinet_inventory",
    labelKey: "gabinet.roles.features.inventory",
    actions: ["view", "create", "edit", "delete"] as const,
  },
  {
    key: "gabinet_settings",
    labelKey: "gabinet.roles.features.settings",
    actions: ["view", "create", "edit", "delete"] as const,
  },
] as const;

const ALL_FEATURES = [
  "leads", "contacts", "companies", "documents", "activities", "calls", "email",
  "products", "pipelines", "gabinet_dashboard", "gabinet_patients", "gabinet_appointments",
  "gabinet_treatments", "gabinet_packages", "gabinet_employees", "gabinet_payments",
  "gabinet_reports", "gabinet_financial_reports", "gabinet_purchase_prices", "gabinet_photos",
  "gabinet_online_booking", "gabinet_inventory", "gabinet_settings", "settings", "team",
  "document_templates", "document_instances", "tagDefinitions", "categoryDefinitions",
] as const;

const ALL_ACTIONS = ["view", "create", "edit", "delete", "approve", "sign", "refund"] as const;

type LocalPerms = Partial<Record<string, Partial<Record<string, Scope>>>>;

function buildLocalPerms(raw: Record<string, Record<string, string>> | null): LocalPerms {
  const result: LocalPerms = {};
  for (const f of GABINET_FEATURES) {
    result[f.key] = {};
    for (const action of f.actions) {
      result[f.key]![action] = (raw?.[f.key]?.[action] as Scope) ?? "none";
    }
  }
  return result;
}

function buildFullPermissions(local: LocalPerms): Record<string, Record<string, string>> {
  const none: Record<string, string> = {};
  for (const action of ALL_ACTIONS) none[action] = "none";

  const result: Record<string, Record<string, string>> = {};
  for (const f of ALL_FEATURES) {
    result[f] = { ...none };
  }
  for (const f of GABINET_FEATURES) {
    for (const action of f.actions) {
      result[f.key][action] = local[f.key]?.[action] ?? "none";
    }
  }
  return result;
}

function RolePermissionPanel({
  organizationId,
  roleKey,
  isSystem,
}: {
  organizationId: string;
  roleKey: string;
  isSystem: boolean;
}) {
  const { t } = useTranslation();
  const { allowed: canEdit } = usePermission("gabinet_settings", "edit");
  const rawPerms = useQuery(api.gabinetRoles.getPermissions, {
    organizationId: organizationId as never,
    gabinetRole: roleKey,
  });

  const setPermissions = useAction(api.gabinetRoles.setPermissions);
  const resetPermissions = useAction(api.gabinetRoles.resetPermissionsToDefault);

  const [local, setLocal] = useState<LocalPerms>(() => buildLocalPerms(null));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (rawPerms !== undefined) {
      setLocal(buildLocalPerms(rawPerms as Record<string, Record<string, string>> | null));
      setDirty(false);
    }
  }, [rawPerms, roleKey]);

  const handleChange = useCallback((feature: string, action: string, scope: Scope) => {
    setLocal((prev) => ({
      ...prev,
      [feature]: { ...prev[feature], [action]: scope },
    }));
    setDirty(true);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setPermissions({
        organizationId: organizationId as never,
        gabinetRole: roleKey,
        permissions: buildFullPermissions(local),
      });
      setDirty(false);
      toast.success(t("gabinet.roles.saved", "Permissions saved"));
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.roles.saveError",
          defaultValue: "Failed to save permissions",
        })
      );
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await resetPermissions({
        organizationId: organizationId as never,
        gabinetRole: roleKey,
      });
      toast.success(
        isSystem
          ? t("gabinet.roles.resetToDefault", "Reset to default permissions")
          : t("gabinet.roles.resetCustom", "Permissions cleared")
      );
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.roles.resetError",
          defaultValue: "Failed to reset permissions",
        })
      );
    } finally {
      setResetting(false);
    }
  };

  if (rawPerms === undefined) {
    return <div className="py-8 text-center text-sm text-muted-foreground">{t("common.loading", "Loading…")}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2 pr-6 text-left font-medium text-muted-foreground whitespace-nowrap">
                {t("gabinet.roles.feature", "Feature")}
              </th>
              <th className="px-2 py-2 text-left font-medium text-muted-foreground">
                {t("permissions.actions.view", "View")}
              </th>
              <th className="px-2 py-2 text-left font-medium text-muted-foreground">
                {t("permissions.actions.create", "Create")}
              </th>
              <th className="px-2 py-2 text-left font-medium text-muted-foreground">
                {t("permissions.actions.edit", "Edit")}
              </th>
              <th className="px-2 py-2 text-left font-medium text-muted-foreground">
                {t("permissions.actions.delete", "Delete")}
              </th>
              <th className="px-2 py-2 text-left font-medium text-muted-foreground">
                {t("permissions.actions.refund", "Refund")}
              </th>
            </tr>
          </thead>
          <tbody>
            {GABINET_FEATURES.map((feature) => (
              <tr key={feature.key} className="border-b last:border-0">
                <td className="py-3 pr-6 font-medium whitespace-nowrap">
                  {t(feature.labelKey, feature.key)}
                </td>
                {(["view", "create", "edit", "delete", "refund"] as const).map((action) => {
                  const supported = (feature.actions as readonly string[]).includes(action);
                  const scope = local[feature.key]?.[action] ?? "none";
                  return (
                    <td key={action} className="px-2 py-3">
                      {supported ? (
                        <ScopeSelect
                          value={scope}
                          onChange={(v) => handleChange(feature.key, action, v)}
                          disabled={!canEdit}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground/40">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="flex items-center justify-between pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={resetting}
          >
            <RotateCcw className="mr-2 h-3.5 w-3.5" variant="stroke" />
            {resetting
              ? t("common.loading", "Loading…")
              : isSystem
              ? t("gabinet.roles.resetButton", "Reset to defaults")
              : t("gabinet.roles.clearButton", "Clear permissions")}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!dirty || saving}
          >
            {saving ? t("common.saving", "Saving…") : t("common.save", "Save")}
          </Button>
        </div>
      )}
    </div>
  );
}

function ScopeSelect({ value, onChange, disabled }: { value: Scope; onChange: (v: Scope) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Scope)} disabled={disabled}>
      <SelectTrigger className="h-7 w-24 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{t("permissions.levels.none", "None")}</SelectItem>
        <SelectItem value="own">{t("permissions.levels.own", "Own only")}</SelectItem>
        <SelectItem value="all">{t("permissions.levels.all", "All")}</SelectItem>
      </SelectContent>
    </Select>
  );
}

function GabinetRolesSettingsPage() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();

  const definitions = useQuery(api.gabinetRoles.listDefinitions, { organizationId });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    if (definitions && definitions.length > 0 && !selectedKey) {
      setSelectedKey(definitions[0]!.key);
    }
  }, [definitions, selectedKey]);

  const selectedDef = definitions?.find((d) => d.key === selectedKey);

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <SectionHeader.Root className="pt-4">
        <SectionHeader.Group>
          <SectionHeader.Heading className="flex-1">
            {t("gabinet.roles.title", "Role Permissions")}
          </SectionHeader.Heading>
        </SectionHeader.Group>
        <UntitledAlert>
          {t(
            "gabinet.roles.description",
            "Configure what each gabinet role can view, create, edit and delete. These permissions apply in addition to the user's organization role."
          )}
        </UntitledAlert>
      </SectionHeader.Root>

      {definitions === undefined ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          {t("common.loading", "Loading…")}
        </div>
      ) : definitions.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          {t("gabinet.roles.noRoles", "No roles found.")}
        </div>
      ) : (
        <>
          <Tabs value={selectedKey ?? ""} onValueChange={setSelectedKey}>
            <TabsList className="h-auto flex-wrap gap-1">
              {definitions.map((def) => (
                <TabsTrigger key={def.key} value={def.key} className="gap-2">
                  {def.color && (
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: def.color }}
                    />
                  )}
                  {def.labelPl}
                  {def.isSystem && (
                    <Badge variant="secondary" className="text-[10px] px-1 py-0">
                      {t("gabinet.roles.system", "system")}
                    </Badge>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {selectedKey && selectedDef && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  {selectedDef.color && (
                    <span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: selectedDef.color }}
                    />
                  )}
                  {selectedDef.labelPl}
                  {selectedDef.isSystem && (
                    <Badge variant="secondary" className="text-xs">
                      {t("gabinet.roles.system", "system")}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RolePermissionPanel
                  key={selectedKey}
                  organizationId={organizationId}
                  roleKey={selectedKey}
                  isSystem={selectedDef.isSystem}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
