import { useState, useEffect, useCallback } from "react";
import { useQuery as useConvexQuery, useMutation } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RotateCcw } from "@/lib/ez-icons";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";

type Scope = "none" | "own" | "all";
type LocalPerms = Partial<Record<string, Partial<Record<string, Scope>>>>;

const EMPLOYEE_PERMISSION_FEATURES = [
  { key: "gabinet_dashboard", labelKey: "gabinet.roles.features.dashboard", actions: ["view"] as const },
  { key: "gabinet_patients", labelKey: "gabinet.roles.features.patients", actions: ["view", "create", "edit", "delete"] as const },
  { key: "gabinet_appointments", labelKey: "gabinet.roles.features.appointments", actions: ["view", "create", "edit", "delete"] as const },
  { key: "gabinet_treatments", labelKey: "gabinet.roles.features.treatments", actions: ["view", "create", "edit", "delete"] as const },
  { key: "gabinet_packages", labelKey: "gabinet.roles.features.packages", actions: ["view", "create", "edit", "delete"] as const },
  { key: "gabinet_employees", labelKey: "gabinet.roles.features.employees", actions: ["view", "create", "edit", "delete"] as const },
  { key: "gabinet_payments", labelKey: "gabinet.roles.features.payments", actions: ["view", "create", "edit", "delete", "refund"] as const },
  { key: "gabinet_reports", labelKey: "gabinet.roles.features.reports", actions: ["view"] as const },
  { key: "gabinet_financial_reports", labelKey: "gabinet.roles.features.financial_reports", actions: ["view"] as const },
  { key: "gabinet_purchase_prices", labelKey: "gabinet.roles.features.purchase_prices", actions: ["view", "create", "edit"] as const },
  { key: "gabinet_photos", labelKey: "gabinet.roles.features.photos", actions: ["view", "create", "edit", "delete"] as const },
  { key: "gabinet_online_booking", labelKey: "gabinet.roles.features.online_booking", actions: ["view", "create", "edit", "delete"] as const },
  { key: "gabinet_inventory", labelKey: "gabinet.roles.features.inventory", actions: ["view", "create", "edit", "delete"] as const },
  { key: "gabinet_settings", labelKey: "gabinet.roles.features.settings", actions: ["view", "create", "edit", "delete"] as const },
] as const;

const ALL_PERMS_FEATURES = [
  "leads", "contacts", "companies", "documents", "activities", "calls", "email",
  "products", "pipelines", "gabinet_dashboard", "gabinet_patients", "gabinet_appointments",
  "gabinet_treatments", "gabinet_packages", "gabinet_employees", "gabinet_payments",
  "gabinet_reports", "gabinet_financial_reports", "gabinet_purchase_prices", "gabinet_photos",
  "gabinet_online_booking", "gabinet_inventory", "gabinet_settings", "settings", "team",
  "document_templates", "document_instances", "tagDefinitions", "categoryDefinitions",
] as const;

const ALL_PERMS_ACTIONS = ["view", "create", "edit", "delete", "approve", "sign", "refund"] as const;

function buildEmpLocalPerms(
  raw: Record<string, Record<string, string>> | null,
  roleDefaults?: Record<string, Record<string, string>> | null,
): LocalPerms {
  const result: LocalPerms = {};
  for (const f of EMPLOYEE_PERMISSION_FEATURES) {
    result[f.key] = {};
    for (const action of f.actions) {
      // When no override row exists yet, pre-populate from the role-level defaults
      // so the admin sees the current effective values rather than all-none.
      const fallback = raw === null
        ? ((roleDefaults?.[f.key]?.[action] as Scope) ?? "none")
        : "none";
      result[f.key]![action] = (raw?.[f.key]?.[action] as Scope) ?? fallback;
    }
  }
  return result;
}

function buildEmpFullPermissions(local: LocalPerms): Record<string, Record<string, string>> {
  const none: Record<string, string> = {};
  for (const action of ALL_PERMS_ACTIONS) none[action] = "none";
  const result: Record<string, Record<string, string>> = {};
  for (const f of ALL_PERMS_FEATURES) {
    result[f] = { ...none };
  }
  for (const f of EMPLOYEE_PERMISSION_FEATURES) {
    for (const action of f.actions) {
      result[f.key][action] = local[f.key]?.[action] ?? "none";
    }
  }
  return result;
}

function EmpScopeSelect({ value, onChange }: { value: Scope; onChange: (v: Scope) => void }) {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Scope)}>
      <SelectTrigger className="h-7 w-24 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{t("permissions.levels.none", "Brak")}</SelectItem>
        <SelectItem value="own">{t("permissions.levels.own", "Własne")}</SelectItem>
        <SelectItem value="all">{t("permissions.levels.all", "Wszystkie")}</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function EmployeePermissionsTab({
  organizationId,
  userId,
  gabinetRole,
  t,
}: {
  organizationId: Id<"organizations">;
  userId: Id<"users">;
  gabinetRole: string;
  t: TFunction;
}) {
  const rawPerms = useConvexQuery(api.gabinetRoles.getEmployeePermissions, {
    organizationId,
    userId,
  });

  const rolePerms = useConvexQuery(api.gabinetRoles.getPermissions, {
    organizationId,
    gabinetRole,
  });

  const setEmpPermissions = useMutation(api.gabinetRoles.setEmployeePermissions);
  const resetEmpPermissions = useMutation(api.gabinetRoles.resetEmployeePermissions);

  const [local, setLocal] = useState<LocalPerms>(() => buildEmpLocalPerms(null, null));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (rawPerms !== undefined && rolePerms !== undefined) {
      setLocal(
        buildEmpLocalPerms(
          rawPerms as Record<string, Record<string, string>> | null,
          rolePerms as Record<string, Record<string, string>> | null,
        ),
      );
      setDirty(false);
    }
  }, [rawPerms, rolePerms]);

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
      await setEmpPermissions({
        organizationId,
        userId,
        permissions: buildEmpFullPermissions(local),
      });
      setDirty(false);
      toast.success(t("gabinet.employees.permissions.saved", "Uprawnienia zapisane"));
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.employees.permissions.saveError",
          defaultValue: "Nie udało się zapisać uprawnień",
        })
      );
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await resetEmpPermissions({ organizationId, userId });
      toast.success(t("gabinet.employees.permissions.reset", "Przywrócono uprawnienia roli"));
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.employees.permissions.resetError",
          defaultValue: "Nie udało się zresetować uprawnień",
        })
      );
    } finally {
      setResetting(false);
    }
  };

  if (rawPerms === undefined || rolePerms === undefined) {
    return <div className="py-8 text-center text-sm text-muted-foreground">{t("common.loading", "Ładowanie…")}</div>;
  }

  const hasOverride = rawPerms !== null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {t("gabinet.employees.permissions.title", "Uprawnienia pracownika")}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {t(
              "gabinet.employees.permissions.description",
              "Indywidualne nadpisania uprawnień dla tego pracownika. Zapisane wartości zastępują uprawnienia roli — możliwe jest zarówno podwyższenie jak i ograniczenie dostępu. Brak nadpisania oznacza stosowanie uprawnień roli."
            )}
          </p>
          {hasOverride && (
            <Badge variant="secondary" className="w-fit">
              {t("gabinet.employees.permissions.overrideActive", "Aktywne nadpisanie uprawnień")}
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 pr-6 text-left font-medium text-muted-foreground whitespace-nowrap">
                    {t("gabinet.roles.feature", "Funkcja")}
                  </th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">
                    {t("permissions.actions.view", "Widok")}
                  </th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">
                    {t("permissions.actions.create", "Tworzenie")}
                  </th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">
                    {t("permissions.actions.edit", "Edycja")}
                  </th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">
                    {t("permissions.actions.delete", "Usuwanie")}
                  </th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">
                    {t("permissions.actions.refund", "Zwrot")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {EMPLOYEE_PERMISSION_FEATURES.map((feature) => (
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
                            <EmpScopeSelect
                              value={scope}
                              onChange={(v) => handleChange(feature.key, action, v)}
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

          <div className="flex items-center justify-between pt-4 border-t mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={resetting || !hasOverride}
            >
              <RotateCcw className="mr-2 h-3.5 w-3.5" variant="stroke" />
              {resetting
                ? t("common.loading", "Ładowanie…")
                : t("gabinet.employees.permissions.resetButton", "Przywróć uprawnienia roli")}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
              {saving ? t("common.saving", "Zapisywanie…") : t("common.save", "Zapisz")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
