import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
import {
  Users,
  Contact,
  Building2,
  TrendingUp,
  FileText,
  Package,
  Mail,
} from "@/lib/ez-icons";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/organization"
)({
  component: OrganizationSettings,
});

const CURRENCIES = [
  { value: "USD", label: "USD - US Dollar" },
  { value: "EUR", label: "EUR - Euro" },
  { value: "GBP", label: "GBP - British Pound" },
  { value: "PLN", label: "PLN - Polish Zloty" },
  { value: "CHF", label: "CHF - Swiss Franc" },
  { value: "JPY", label: "JPY - Japanese Yen" },
  { value: "CAD", label: "CAD - Canadian Dollar" },
  { value: "AUD", label: "AUD - Australian Dollar" },
];

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Warsaw",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Australia/Sydney",
];

function OrganizationSettings() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();

  const { data: org } = useQuery(
    convexQuery(api.organizations.getById, { organizationId })
  );
  const { data: settings } = useQuery(
    convexQuery(api.orgSettings.get, { organizationId })
  );
  const { data: usage } = useQuery(
    convexQuery(api.organizations.getUsageStats, { organizationId })
  );

  const updateOrg = useMutation(api.organizations.update);
  const upsertSettings = useMutation(api.orgSettings.upsert);

  const [orgName, setOrgName] = useState("");
  const [website, setWebsite] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [timezone, setTimezone] = useState("UTC");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (org) {
      setOrgName(org.name ?? "");
      setWebsite(org.website ?? "");
    }
  }, [org]);

  useEffect(() => {
    if (settings) {
      setCurrency(settings.defaultCurrency ?? "USD");
      setTimezone(settings.timezone ?? "UTC");
    }
  }, [settings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateOrg({
        organizationId,
        name: orgName.trim() || undefined,
        website: website.trim() || undefined,
      });
      await upsertSettings({
        organizationId,
        defaultCurrency: currency,
        timezone,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const usageItems = [
    {
      key: "members",
      icon: Users,
      count: usage?.memberCount ?? 0,
      label: t("orgSettings.usageStats.members"),
    },
    {
      key: "contacts",
      icon: Contact,
      count: usage?.contactCount ?? 0,
      label: t("orgSettings.usageStats.contacts"),
    },
    {
      key: "companies",
      icon: Building2,
      count: usage?.companyCount ?? 0,
      label: t("orgSettings.usageStats.companies"),
    },
    {
      key: "deals",
      icon: TrendingUp,
      count: usage?.leadCount ?? 0,
      label: t("orgSettings.usageStats.deals"),
    },
    {
      key: "documents",
      icon: FileText,
      count: usage?.documentCount ?? 0,
      label: t("orgSettings.usageStats.documents"),
    },
    {
      key: "products",
      icon: Package,
      count: usage?.productCount ?? 0,
      label: t("orgSettings.usageStats.products"),
    },
    {
      key: "emails",
      icon: Mail,
      count: usage?.emailCount ?? 0,
      label: t("orgSettings.usageStats.emails"),
    },
  ];

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <PageHeader
        title={t("orgSettings.title")}
        description={t("orgSettings.description")}
      />

      {/* Organization form */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label>{t("orgSettings.orgName")}</Label>
            <Input
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder={t("orgSettings.orgName")}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("orgSettings.website")}</Label>
            <Input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
            />
          </div>

          <div className="space-y-2">
            <Label>{t("orgSettings.currency")}</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger>
                <SelectValue placeholder={t("orgSettings.currencyPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("orgSettings.timezone")}</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger>
                <SelectValue placeholder={t("orgSettings.timezonePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Usage stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("orgSettings.usage")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {usageItems.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.key}
                  className="flex flex-col items-center gap-2 rounded-lg border p-4"
                >
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <span className="text-2xl font-semibold">{item.count}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
