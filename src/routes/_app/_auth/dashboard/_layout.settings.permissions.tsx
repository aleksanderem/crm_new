import { useState, useEffect, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
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

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/permissions"
)({
  component: PermissionsSettings,
});

const FEATURES = [
  { key: "leads", labelKey: "permissions.features.leads", label: "Leads" },
  { key: "contacts", labelKey: "permissions.features.contacts", label: "Contacts" },
  { key: "companies", labelKey: "permissions.features.companies", label: "Companies" },
  { key: "documents", labelKey: "permissions.features.documents", label: "Documents" },
  { key: "activities", labelKey: "permissions.features.activities", label: "Activities" },
  { key: "calls", labelKey: "permissions.features.calls", label: "Calls" },
  { key: "email", labelKey: "permissions.features.email", label: "Email" },
  { key: "products", labelKey: "permissions.features.products", label: "Products" },
  { key: "pipelines", labelKey: "permissions.features.pipelines", label: "Pipelines" },
  { key: "gabinet_patients", labelKey: "permissions.features.gabinet_patients", label: "Gabinet: Patients" },
  { key: "gabinet_appointments", labelKey: "permissions.features.gabinet_appointments", label: "Gabinet: Appointments" },
  { key: "gabinet_treatments", labelKey: "permissions.features.gabinet_treatments", label: "Gabinet: Treatments" },
  { key: "gabinet_packages", labelKey: "permissions.features.gabinet_packages", label: "Gabinet: Packages" },
  { key: "gabinet_employees", labelKey: "permissions.features.gabinet_employees", label: "Gabinet: Employees" },
  { key: "settings", labelKey: "permissions.features.settings", label: "Settings" },
  { key: "team", labelKey: "permissions.features.team", label: "Team" },
] as const;

const ACTIONS = ["view", "create", "edit", "delete"] as const;
type Action = (typeof ACTIONS)[number];
type PermissionLevel = "none" | "own" | "all";

type PermissionsMap = Record<string, Record<Action, PermissionLevel>>;

const DEFAULT_PERMISSION: Record<Action, PermissionLevel> = {
  view: "all",
  create: "all",
  edit: "all",
  delete: "all",
};

function buildPermissionsMap(overrides: Record<string, Record<string, string>> | null): PermissionsMap {
  const map: PermissionsMap = {};
  for (const feature of FEATURES) {
    const featureOverrides = overrides?.[feature.key];
    map[feature.key] = {
      view: (featureOverrides?.view as PermissionLevel) ?? DEFAULT_PERMISSION.view,
      create: (featureOverrides?.create as PermissionLevel) ?? DEFAULT_PERMISSION.create,
      edit: (featureOverrides?.edit as PermissionLevel) ?? DEFAULT_PERMISSION.edit,
      delete: (featureOverrides?.delete as PermissionLevel) ?? DEFAULT_PERMISSION.delete,
    };
  }
  return map;
}

function PermissionsSettings() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();

  const overrides = useQuery(api.permissions.getOrgPermissionOverrides, { organizationId });
  const resourceSharingEnabled = useQuery(api.permissions.getResourceSharingEnabled, { organizationId });

  const updatePermissions = useMutation(api.permissions.updateOrgPermissions);
  const setResourceSharing = useMutation(api.permissions.setResourceSharingEnabled);

  const [memberPerms, setMemberPerms] = useState<PermissionsMap>(() => buildPermissionsMap(null));
  const [viewerPerms, setViewerPerms] = useState<PermissionsMap>(() => buildPermissionsMap(null));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (overrides) {
      setMemberPerms(buildPermissionsMap(overrides.member));
      setViewerPerms(buildPermissionsMap(overrides.viewer));
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

  if (overrides === undefined) {
    return null;
  }

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <PageHeader
        title={t("permissions.title", "Permissions")}
        description={t("permissions.description", "Configure what each role can do")}
        actions={
          <Button onClick={handleSave} disabled={!dirty || saving} size="sm">
            {saving ? t("permissions.saving", "Saving...") : t("permissions.save", "Save changes")}
          </Button>
        }
      />

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
              {FEATURES.map((feature) => (
                <tr key={feature.key} className="border-b last:border-0">
                  <td className="py-3 pr-4 font-medium whitespace-nowrap">
                    {t(feature.labelKey, feature.label)}
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
                      perms={memberPerms[feature.key]}
                      onChange={(action, value) =>
                        handlePermChange("member", feature.key, action, value)
                      }
                    />
                  </td>
                  {/* Viewer — editable */}
                  <td className="px-2 py-3">
                    <PermissionCell
                      perms={viewerPerms[feature.key]}
                      onChange={(action, value) =>
                        handlePermChange("viewer", feature.key, action, value)
                      }
                    />
                  </td>
                </tr>
              ))}
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
