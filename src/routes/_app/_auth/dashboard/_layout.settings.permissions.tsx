import { useState, useEffect, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { FEATURES, ACTIONS, type Action } from "@cvx/_helpers/permissionTypes";
import { useOrganization } from "@/components/org-context";
import { useSupabaseOrgSettings } from "@/hooks/use-supabase-organizations";
import { SectionHeader } from "@untitled/app/section-headers/section-headers";
import { UntitledAlert } from "@/components/ui/untitled-alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useRole } from "@/hooks/use-permission";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/permissions"
)({
  component: PermissionsSettings,
});

// Label map for display in the permission matrix — single place to update when features are added.
// Keys must match the FEATURES array in convex/_helpers/permissionTypes.ts.
const FEATURE_LABELS: Record<string, { labelKey: string; label: string }> = {
  leads: { labelKey: "permissions.features.leads", label: "Leads" },
  contacts: { labelKey: "permissions.features.contacts", label: "Contacts" },
  companies: { labelKey: "permissions.features.companies", label: "Companies" },
  documents: { labelKey: "permissions.features.documents", label: "Documents" },
  activities: { labelKey: "permissions.features.activities", label: "Activities" },
  calls: { labelKey: "permissions.features.calls", label: "Calls" },
  email: { labelKey: "permissions.features.email", label: "Email" },
  products: { labelKey: "permissions.features.products", label: "Products" },
  pipelines: { labelKey: "permissions.features.pipelines", label: "Pipelines" },
  gabinet_dashboard: { labelKey: "permissions.features.gabinet_dashboard", label: "Gabinet: Dashboard" },
  gabinet_patients: { labelKey: "permissions.features.gabinet_patients", label: "Gabinet: Patients" },
  gabinet_appointments: { labelKey: "permissions.features.gabinet_appointments", label: "Gabinet: Appointments" },
  gabinet_treatments: { labelKey: "permissions.features.gabinet_treatments", label: "Gabinet: Treatments" },
  gabinet_packages: { labelKey: "permissions.features.gabinet_packages", label: "Gabinet: Packages" },
  gabinet_employees: { labelKey: "permissions.features.gabinet_employees", label: "Gabinet: Employees" },
  gabinet_payments: { labelKey: "permissions.features.gabinet_payments", label: "Gabinet: Payments" },
  gabinet_receipts: { labelKey: "permissions.features.gabinet_receipts", label: "Gabinet: Receipts" },
  gabinet_reports: { labelKey: "permissions.features.gabinet_reports", label: "Gabinet: Reports" },
  gabinet_financial_reports: { labelKey: "permissions.features.gabinet_financial_reports", label: "Gabinet: Financial Reports" },
  gabinet_purchase_prices: { labelKey: "permissions.features.gabinet_purchase_prices", label: "Gabinet: Purchase Prices" },
  gabinet_photos: { labelKey: "permissions.features.gabinet_photos", label: "Gabinet: Patient Photos" },
  gabinet_online_booking: { labelKey: "permissions.features.gabinet_online_booking", label: "Gabinet: Online Booking" },
  gabinet_inventory: { labelKey: "permissions.features.gabinet_inventory", label: "Gabinet: Inventory" },
  gabinet_settings: { labelKey: "permissions.features.gabinet_settings", label: "Gabinet: Settings" },
  settings: { labelKey: "permissions.features.settings", label: "Settings" },
  team: { labelKey: "permissions.features.team", label: "Team" },
  document_templates: { labelKey: "permissions.features.document_templates", label: "Document Templates" },
  document_instances: { labelKey: "permissions.features.document_instances", label: "Document Instances" },
  tagDefinitions: { labelKey: "permissions.features.tagDefinitions", label: "Tags" },
  categoryDefinitions: { labelKey: "permissions.features.categoryDefinitions", label: "Categories" },
};

type PermissionLevel = "none" | "own" | "all";

type PermissionsMap = Record<string, Record<Action, PermissionLevel>>;

const DEFAULT_PERMISSION: Record<Action, PermissionLevel> = {
  view: "all",
  create: "all",
  edit: "all",
  delete: "all",
  approve: "none",
  sign: "none",
  refund: "none",
};

function buildPermissionsMap(overrides: Record<string, Record<string, string>> | null): PermissionsMap {
  const map: PermissionsMap = {};
  for (const featureKey of FEATURES) {
    const featureOverrides = overrides?.[featureKey];
    const featurePerms = {} as Record<Action, PermissionLevel>;
    for (const action of ACTIONS) {
      featurePerms[action] = (featureOverrides?.[action] as PermissionLevel) ?? DEFAULT_PERMISSION[action];
    }
    map[featureKey] = featurePerms;
  }
  return map;
}

function PermissionsSettings() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const { role, loading: roleLoading } = useRole();

  const isAdmin = role === "owner" || role === "admin";

  const getOrgPermissionOverrides = useAction(api.permissions.getOrgPermissionOverrides);
  const [overrides, setOverrides] = useState<{ member: unknown; viewer: unknown } | undefined>(undefined);

  useEffect(() => {
    if (!isAdmin) return;
    getOrgPermissionOverrides({ organizationId })
      .then(setOverrides)
      .catch(() => setOverrides({ member: null, viewer: null }));
  }, [organizationId, isAdmin, getOrgPermissionOverrides]);

  const { data: orgSettings } = useSupabaseOrgSettings(organizationId);
  const resourceSharingEnabled = orgSettings?.resourceSharingEnabled ?? true;

  const updatePermissions = useAction(api.permissions.updateOrgPermissions);
  const setResourceSharing = useAction(api.permissions.setResourceSharingEnabled);

  const [memberPerms, setMemberPerms] = useState<PermissionsMap>(() => buildPermissionsMap(null));
  const [viewerPerms, setViewerPerms] = useState<PermissionsMap>(() => buildPermissionsMap(null));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (overrides) {
      setMemberPerms(buildPermissionsMap(overrides.member as Record<string, Record<string, string>> | null));
      setViewerPerms(buildPermissionsMap(overrides.viewer as Record<string, Record<string, string>> | null));
      setDirty(false);
    }
  }, [overrides]);

  const handlePermChange = useCallback(
    (role: "member" | "viewer", featureKey: string, action: Action, value: PermissionLevel) => {
      const setter = role === "member" ? setMemberPerms : setViewerPerms;
      setter((prev) => ({
        ...prev,
        [featureKey]: { ...prev[featureKey], [action]: value },
      }));
      setDirty(true);
    },
    []
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      await updatePermissions({ organizationId, role: "member", permissions: memberPerms });
      await updatePermissions({ organizationId, role: "viewer", permissions: viewerPerms });
      setDirty(false);
      toast.success(t("permissions.saved", "Permissions saved"));
    } catch {
      toast.error(t("permissions.saveError", "Failed to save permissions"));
    } finally {
      setSaving(false);
    }
  };

  const handleResourceSharingToggle = async (checked: boolean) => {
    try {
      await setResourceSharing({ organizationId, enabled: checked });
      toast.success(
        checked
          ? t("permissions.sharingEnabled", "Resource sharing enabled")
          : t("permissions.sharingDisabled", "Resource sharing disabled")
      );
    } catch {
      toast.error(t("permissions.sharingError", "Failed to update resource sharing"));
    }
  };

  if (roleLoading) return null;

  if (!isAdmin) {
    return (
      <div className="flex h-full w-full flex-col gap-6">
        <SectionHeader.Root className="pt-4">
          <SectionHeader.Group>
            <SectionHeader.Heading className="flex-1">
              {t("permissions.title", "Permissions")}
            </SectionHeader.Heading>
          </SectionHeader.Group>
        </SectionHeader.Root>
        <p className="text-sm text-muted-foreground">
          {t("permissions.adminOnly", "Only owners and admins can view and edit permission settings.")}
        </p>
      </div>
    );
  }

  if (overrides === undefined) {
    return null;
  }

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <SectionHeader.Root className="pt-4">
        <SectionHeader.Group>
          <SectionHeader.Heading className="flex-1">
            {t("permissions.title", "Permissions")}
          </SectionHeader.Heading>
          <SectionHeader.Actions>
            <Button onClick={handleSave} disabled={!dirty || saving} size="sm">
              {saving ? t("permissions.saving", "Saving...") : t("permissions.save", "Save changes")}
            </Button>
          </SectionHeader.Actions>
        </SectionHeader.Group>
        <UntitledAlert>{t("permissions.description", "Configure what each role can do")}</UntitledAlert>
      </SectionHeader.Root>

      {/* Permission Matrix */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("permissions.matrixTitle", "Role permissions")}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4 text-left font-medium text-muted-foreground">
                  {t("permissions.feature", "Feature")}
                </th>
                <th className="px-2 py-2 text-center font-medium text-muted-foreground">
                  {t("permissions.owner", "Owner")}
                </th>
                <th className="px-2 py-2 text-center font-medium text-muted-foreground">
                  {t("permissions.admin", "Admin")}
                </th>
                <th className="px-2 py-2 text-center font-medium text-muted-foreground">
                  {t("permissions.member", "Member")}
                </th>
                <th className="px-2 py-2 text-center font-medium text-muted-foreground">
                  {t("permissions.viewer", "Viewer")}
                </th>
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((featureKey) => {
                const featureLabel = FEATURE_LABELS[featureKey] ?? {
                  labelKey: `permissions.features.${featureKey}`,
                  label: featureKey,
                };
                return (
                  <tr key={featureKey} className="border-b last:border-0">
                    <td className="py-3 pr-4 font-medium whitespace-nowrap">
                      {t(featureLabel.labelKey, featureLabel.label)}
                    </td>
                    {/* Owner — always All */}
                    <td className="px-2 py-3">
                      <div className="flex flex-wrap justify-center gap-1">
                        {ACTIONS.map((action) => (
                          <span
                            key={action}
                            className="inline-block rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                          >
                            {t(`permissions.actions.${action}`, action)}: {t("permissions.levels.all", "All")}
                          </span>
                        ))}
                      </div>
                    </td>
                    {/* Admin — always All */}
                    <td className="px-2 py-3">
                      <div className="flex flex-wrap justify-center gap-1">
                        {ACTIONS.map((action) => (
                          <span
                            key={action}
                            className="inline-block rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                          >
                            {t(`permissions.actions.${action}`, action)}: {t("permissions.levels.all", "All")}
                          </span>
                        ))}
                      </div>
                    </td>
                    {/* Member — editable */}
                    <td className="px-2 py-3">
                      <PermissionCell
                        perms={memberPerms[featureKey]}
                        onChange={(action, value) =>
                          handlePermChange("member", featureKey, action, value)
                        }
                      />
                    </td>
                    {/* Viewer — editable */}
                    <td className="px-2 py-3">
                      <PermissionCell
                        perms={viewerPerms[featureKey]}
                        onChange={(action, value) =>
                          handlePermChange("viewer", featureKey, action, value)
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Resource Sharing */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("permissions.resourceSharing", "Resource Sharing")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium">
                {t("permissions.guestInvites", "External guest invites")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t(
                  "permissions.guestInvitesDescription",
                  "Allow team members to invite external guests to view shared resources"
                )}
              </p>
            </div>
            <Switch
              checked={resourceSharingEnabled ?? true}
              onCheckedChange={handleResourceSharingToggle}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PermissionCell({
  perms,
  onChange,
}: {
  perms: Record<Action, PermissionLevel> | undefined;
  onChange: (action: Action, value: PermissionLevel) => void;
}) {
  const { t } = useTranslation();
  if (!perms) return null;

  return (
    <div className="grid grid-cols-2 gap-1">
      {ACTIONS.map((action) => (
        <Select
          key={action}
          value={perms[action]}
          onValueChange={(val) => onChange(action, val as PermissionLevel)}
        >
          <SelectTrigger className="h-7 w-full min-w-[90px] text-xs">
            <span className="truncate">
              <span className="text-muted-foreground">
                {t(`permissions.actions.${action}`, action)}:
              </span>{" "}
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("permissions.levels.none", "None")}</SelectItem>
            <SelectItem value="own">{t("permissions.levels.own", "Own only")}</SelectItem>
            <SelectItem value="all">{t("permissions.levels.all", "All")}</SelectItem>
          </SelectContent>
        </Select>
      ))}
    </div>
  );
}
