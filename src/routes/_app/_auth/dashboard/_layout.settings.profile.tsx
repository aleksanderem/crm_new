import React, { useState, useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { changeLanguage } from "i18next";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "~/convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
import { Upload, Sun, Moon, Monitor } from "@/lib/ez-icons";
import { toast } from "sonner";
import { cn } from "@/utils/misc";
import { useConvexUpload } from "@/hooks/use-convex-upload";
import { AVATAR_FALLBACK_GRADIENT } from "@/lib/avatar";
import { useOrganization } from "@/components/org-context";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/profile"
)({
  component: ProfileSettings,
});

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "pl", label: "Polski" },
  { value: "es", label: "Español" },
];

const COMMON_TIMEZONES = (Intl as any).supportedValuesOf
  ? (Intl as any).supportedValuesOf("timeZone") as string[]
  : [
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Anchorage",
      "Pacific/Honolulu",
      "Europe/London",
      "Europe/Berlin",
      "Europe/Paris",
      "Europe/Warsaw",
      "Europe/Moscow",
      "Asia/Tokyo",
      "Asia/Shanghai",
      "Asia/Kolkata",
      "Asia/Dubai",
      "Australia/Sydney",
      "Pacific/Auckland",
      "America/Sao_Paulo",
      "Africa/Cairo",
      "Africa/Johannesburg",
    ];

const THEME_OPTIONS = [
  { value: "light" as const, label: "Light", icon: Sun },
  { value: "dark" as const, label: "Dark", icon: Moon },
  { value: "system" as const, label: "System", icon: Monitor },
];

const PERMISSION_FEATURES = [
  { key: "leads", label: "Leads", group: "CRM" },
  { key: "contacts", label: "Contacts", group: "CRM" },
  { key: "companies", label: "Companies", group: "CRM" },
  { key: "documents", label: "Documents", group: "CRM" },
  { key: "activities", label: "Activities", group: "CRM" },
  { key: "calls", label: "Calls", group: "CRM" },
  { key: "email", label: "Email", group: "CRM" },
  { key: "products", label: "Products", group: "CRM" },
  { key: "pipelines", label: "Pipelines", group: "CRM" },
  { key: "gabinet_dashboard", label: "Dashboard", group: "Gabinet" },
  { key: "gabinet_patients", label: "Patients", group: "Gabinet" },
  { key: "gabinet_appointments", label: "Appointments", group: "Gabinet" },
  { key: "gabinet_treatments", label: "Treatments", group: "Gabinet" },
  { key: "gabinet_packages", label: "Packages", group: "Gabinet" },
  { key: "gabinet_employees", label: "Employees", group: "Gabinet" },
  { key: "gabinet_payments", label: "Payments", group: "Gabinet" },
  { key: "gabinet_reports", label: "Reports", group: "Gabinet" },
  { key: "gabinet_financial_reports", label: "Financial Reports", group: "Gabinet" },
  { key: "gabinet_purchase_prices", label: "Purchase Prices", group: "Gabinet" },
  { key: "gabinet_photos", label: "Patient Photos", group: "Gabinet" },
  { key: "gabinet_online_booking", label: "Online Booking", group: "Gabinet" },
  { key: "gabinet_inventory", label: "Inventory", group: "Gabinet" },
  { key: "gabinet_settings", label: "Settings", group: "Gabinet" },
  { key: "settings", label: "Settings", group: "Organization" },
  { key: "team", label: "Team", group: "Organization" },
] as const;

const PERMISSION_ACTIONS = ["view", "create", "edit", "delete"] as const;

function ScopeCell({ scope }: { scope: string }) {
  if (scope === "all")
    return <span className="text-xs font-semibold text-green-600 dark:text-green-400">All</span>;
  if (scope === "own")
    return <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">Own</span>;
  return <span className="text-xs text-muted-foreground">—</span>;
}

function ProfileSettings() {
  const { t, i18n } = useTranslation();
  const { data: user } = useQuery(convexQuery(api.app.getCurrentUser, {}));
  const { organizationId } = useOrganization();
  const { data: roleData } = useQuery({
    ...convexQuery(api.permissions.getMyRole, { organizationId: organizationId! }),
    enabled: !!organizationId,
  });
  const { data: gabinetRoleData } = useQuery({
    ...convexQuery(api.permissions.getMyGabinetRole, { organizationId: organizationId! }),
    enabled: !!organizationId,
  });
  const { data: myPermissions } = useQuery({
    ...convexQuery(api.permissions.getMyPermissions, { organizationId: organizationId! }),
    enabled: !!organizationId,
  });

  const { mutateAsync: updateProfile } = useMutation({
    mutationFn: useConvexMutation(api.app.updateProfile),
  });
  const generateUploadUrl = useConvexMutation(api.app.generateUploadUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { mutateAsync: removeUserImage } = useMutation({
    mutationFn: useConvexMutation(api.app.removeUserImage),
  });

  const { startUpload } = useConvexUpload(generateUploadUrl, {
    onUploadComplete: async (uploaded) => {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      await updateProfile({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        imageId: (uploaded[0]!.response as any).storageId,
      });
      toast.success(t("profilePage.avatarUpdated", "Avatar updated"));
    },
  });

  const [name, setName] = useState("");
  const [language, setLanguage] = useState("en");
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name ?? "");
      setLanguage(user.language ?? i18n.resolvedLanguage ?? "en");
      setTheme(user.theme ?? "system");
      setTimezone(
        user.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
      );
    }
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({
        name: name || undefined,
        language,
        theme,
        timezone,
      });
      // Sync i18n language
      if (language !== i18n.resolvedLanguage) {
        changeLanguage(language);
      }
      // Sync theme to DOM
      applyTheme(theme);
      toast.success(t("profilePage.saved", "Profile updated"));
    } catch {
      toast.error(t("profilePage.saveError", "Failed to update profile"));
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="flex h-full w-full flex-col gap-6">
      {/* Avatar */}
      <div className="flex w-full flex-col items-start rounded-lg border border-border bg-card">
        <div className="flex w-full items-start justify-between rounded-lg p-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-medium text-foreground">
              {t("profile.avatar.title")}
            </h2>
            <p className="text-sm font-normal text-muted-foreground">
              {t("profile.avatar.description")}
            </p>
          </div>
          <label
            htmlFor="profile_avatar_field"
            className="group relative flex cursor-pointer overflow-hidden rounded-full transition active:scale-95"
          >
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                className="h-20 w-20 rounded-full object-cover"
                alt={user.username ?? user.email}
              />
            ) : (
              <div className={`h-20 w-20 rounded-full bg-gradient-to-br ${AVATAR_FALLBACK_GRADIENT}`} />
            )}
            <div className="absolute z-10 hidden h-full w-full items-center justify-center bg-primary/40 group-hover:flex">
              <Upload className="h-6 w-6 text-secondary" />
            </div>
          </label>
          <input
            ref={fileInputRef}
            id="profile_avatar_field"
            type="file"
            accept="image/*"
            className="peer sr-only"
            required
            tabIndex={-1}
            onChange={async (event) => {
              if (!event.target.files) return;
              const files = Array.from(event.target.files);
              if (files.length === 0) return;
              startUpload(files);
            }}
          />
        </div>
        <div className="flex min-h-14 w-full items-center justify-between rounded-lg rounded-t-none border-t border-border bg-secondary px-6 dark:bg-card">
          <p className="text-sm font-normal text-muted-foreground">
            {t("profile.avatar.uploadHint")}
          </p>
          {user.avatarUrl && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => removeUserImage({})}
            >
              {t("profile.avatar.reset")}
            </Button>
          )}
        </div>
      </div>

      {/* Name */}
      <div className="flex w-full flex-col items-start rounded-lg border border-border bg-card">
        <div className="flex w-full flex-col gap-4 rounded-lg p-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-medium text-foreground">
              {t("profilePage.name", "Display Name")}
            </h2>
            <p className="text-sm font-normal text-muted-foreground">
              {t(
                "profilePage.nameDescription",
                "Your name as it appears across the application."
              )}
            </p>
          </div>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("profilePage.namePlaceholder", "Your name")}
            className="w-80 bg-transparent"
          />
        </div>
      </div>

      {/* Email (read-only) */}
      <div className="flex w-full flex-col items-start rounded-lg border border-border bg-card">
        <div className="flex w-full flex-col gap-4 rounded-lg p-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-medium text-foreground">
              {t("profilePage.email", "Email Address")}
            </h2>
            <p className="text-sm font-normal text-muted-foreground">
              {t(
                "profilePage.emailDescription",
                "Your email address is managed by your authentication provider."
              )}
            </p>
          </div>
          <Input
            value={user.email ?? ""}
            disabled
            className="w-80 bg-transparent opacity-60"
          />
        </div>
      </div>

      {/* Language */}
      <div className="flex w-full flex-col items-start rounded-lg border border-border bg-card">
        <div className="flex w-full flex-col gap-4 rounded-lg p-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-medium text-foreground">
              {t("profilePage.language", "Language")}
            </h2>
            <p className="text-sm font-normal text-muted-foreground">
              {t(
                "profilePage.languageDescription",
                "Choose your preferred language for the interface."
              )}
            </p>
          </div>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="w-80 bg-transparent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((lang) => (
                <SelectItem key={lang.value} value={lang.value}>
                  {lang.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Theme */}
      <div className="flex w-full flex-col items-start rounded-lg border border-border bg-card">
        <div className="flex w-full flex-col gap-4 rounded-lg p-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-medium text-foreground">
              {t("profilePage.theme", "Theme")}
            </h2>
            <p className="text-sm font-normal text-muted-foreground">
              {t(
                "profilePage.themeDescription",
                "Select a theme for the application."
              )}
            </p>
          </div>
          <div className="flex gap-2">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setTheme(option.value)}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-4 py-2 text-sm transition-colors",
                  theme === option.value
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/40"
                )}
              >
                <option.icon className="h-4 w-4" variant="stroke" />
                {t(`profilePage.themeOptions.${option.value}`, option.label)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Timezone */}
      <div className="flex w-full flex-col items-start rounded-lg border border-border bg-card">
        <div className="flex w-full flex-col gap-4 rounded-lg p-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-medium text-foreground">
              {t("profilePage.timezone", "Timezone")}
            </h2>
            <p className="text-sm font-normal text-muted-foreground">
              {t(
                "profilePage.timezoneDescription",
                "Set your local timezone for accurate date and time display."
              )}
            </p>
          </div>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger className="w-80 bg-transparent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {COMMON_TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex w-full items-center justify-end pb-6">
        <Button onClick={handleSave} disabled={saving}>
          {saving
            ? t("common.saving", "Saving...")
            : t("common.save", "Save")}
        </Button>
      </div>

      {/* Effective Permissions */}
      <div className="flex w-full flex-col items-start rounded-lg border border-border bg-card">
        <div className="flex w-full flex-col gap-4 rounded-lg p-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-medium text-foreground">
              {t("profilePage.permissions", "My Permissions")}
            </h2>
            <p className="text-sm font-normal text-muted-foreground">
              {t(
                "profilePage.permissionsDescription",
                "Your effective access permissions in this organization."
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {roleData && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {t("profilePage.orgRole", "Organization role")}:
                </span>
                <Badge variant="secondary" className="capitalize">{roleData.role}</Badge>
              </div>
            )}
            {gabinetRoleData?.gabinetRole && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {t("profilePage.gabinetRole", "Gabinet role")}:
                </span>
                <Badge
                  variant={gabinetRoleData.isActive ? "default" : "outline"}
                  className="capitalize"
                >
                  {gabinetRoleData.gabinetRole}
                  {!gabinetRoleData.isActive && ` (${t("common.inactive", "inactive")})`}
                </Badge>
              </div>
            )}
          </div>
          {myPermissions && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-2 text-left font-medium text-muted-foreground w-40">
                      {t("profilePage.permFeature", "Feature")}
                    </th>
                    {PERMISSION_ACTIONS.map((action) => (
                      <th key={action} className="pb-2 text-center font-medium text-muted-foreground capitalize w-16">
                        {t(`permissions.actions.${action}`, action)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERMISSION_FEATURES.map((feature, i, arr) => {
                    const prevGroup = i > 0 ? arr[i - 1].group : null;
                    const showGroupRow = prevGroup !== feature.group;
                    return (
                      <React.Fragment key={feature.key}>
                        {showGroupRow && (
                          <tr>
                            <td
                              colSpan={PERMISSION_ACTIONS.length + 1}
                              className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                            >
                              {feature.group}
                            </td>
                          </tr>
                        )}
                        <tr className="border-b border-border/40 last:border-0">
                          <td className="py-1.5 text-foreground">{feature.label}</td>
                          {PERMISSION_ACTIONS.map((action) => (
                            <td key={action} className="py-1.5 text-center">
                              <ScopeCell scope={(myPermissions as Record<string, Record<string, string>>)[feature.key]?.[action] ?? "none"} />
                            </td>
                          ))}
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function applyTheme(theme: "light" | "dark" | "system") {
  if (theme === "system") {
    localStorage.removeItem("theme");
  } else {
    localStorage.theme = theme;
  }
  if (
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
  ) {
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
  } else {
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "light";
  }
}
