/**
 * CompanyOverviewTab — rich "Overview" tab for company detail pages.
 *
 * Uses shadcn-studio statistics cards and charts for a polished dashboard feel.
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Building2,
  Globe,
  Phone,
  MapPin,
  Users as UsersIcon,
  Calendar,
  TrendingUp,
  FileText,
  ExternalLink,
} from "lucide-react";
import type { MappedCompany } from "@/lib/supabase/mappers/companies";

// Studio statistics cards
import StatisticsOrderCard from "@/components/shadcn-studio/blocks/statistics-order-card";
import StatisticsProfitCard from "@/components/shadcn-studio/blocks/statistics-profit-card";
import StatisticsImpressionCard from "@/components/shadcn-studio/blocks/statistics-impression-card";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CompanyAddress {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

interface DealSummary {
  totalDeals: number;
  totalValue: number;
  wonValue: number;
  openDeals: number;
  wonDeals: number;
  lostDeals: number;
  currency: string;
}

interface ActivityItem {
  _id: string;
  description?: string;
  action?: string;
  createdAt: number;
}

interface CustomFieldEntry {
  label: string;
  value: string;
}

interface CompanyOverviewTabProps {
  company: MappedCompany;
  contactCount: number;
  dealSummary: DealSummary;
  recentActivities: ActivityItem[];
  customFields: CustomFieldEntry[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseAddress(raw: unknown): CompanyAddress | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const parts = {
    street: (a.street ?? a.line1 ?? a.address1) as string | undefined,
    city: (a.city ?? a.locality) as string | undefined,
    state: (a.state ?? a.region ?? a.province) as string | undefined,
    zip: (a.zip ?? a.postalCode ?? a.postal_code) as string | undefined,
    country: (a.country) as string | undefined,
  };
  if (!parts.street && !parts.city && !parts.country) return null;
  return parts;
}

function addressToString(a: CompanyAddress): string {
  return [a.street, a.city, a.state, a.zip, a.country].filter(Boolean).join(", ");
}

function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("pl-PL", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${value.toLocaleString("pl-PL")} ${currency}`;
  }
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}min temu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h temu`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d temu`;
  return `${Math.floor(days / 30)}mies. temu`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CompanyOverviewTab({
  company,
  contactCount,
  dealSummary,
  recentActivities,
  customFields,
}: CompanyOverviewTabProps) {
  const { t } = useTranslation();
  const address = useMemo(() => parseAddress(company.address), [company.address]);
  const addressStr = address ? addressToString(address) : null;

  const winRate = dealSummary.totalDeals > 0
    ? Math.round((dealSummary.wonDeals / dealSummary.totalDeals) * 100)
    : 0;

  // Mini sparkline data for stats cards (simulated from recent activity counts)
  const activitySparkline = useMemo(() => {
    const days = ["Pn", "Wt", "Śr", "Cz", "Pt", "Sb", "Nd"];
    return days.map((day, i) => ({
      day,
      orders: recentActivities.filter((a) => {
        const d = new Date(a.createdAt);
        return d.getDay() === (i + 1) % 7;
      }).length,
    }));
  }, [recentActivities]);

  return (
    <div className="space-y-6 p-1">

      {/* ── KPI Stats Row ─────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatisticsOrderCard
          title={t("detail.stats.totalDeals", "Transakcje")}
          description={t("detail.stats.pipeline", "Pipeline")}
          value={String(dealSummary.totalDeals)}
          changePercentage={`${dealSummary.openDeals} ${t("detail.stats.open", "otwartych")}`}
          chartData={activitySparkline}
        />
        <StatisticsProfitCard
          title={t("detail.stats.wonValue", "Wygrane")}
          description={t("detail.stats.totalWon", "Łącznie")}
          value={formatCurrency(dealSummary.wonValue, dealSummary.currency)}
          changePercentage={`${dealSummary.wonDeals} ${t("detail.stats.deals", "transakcji")}`}
        />
        <StatisticsImpressionCard
          title={t("detail.stats.contacts", "Kontakty")}
          description={t("detail.stats.linked", "Powiązane")}
          value={String(contactCount)}
          changePercentage={t("detail.stats.linkedContacts", "powiązanych")}
        />
        <Card className="flex flex-col justify-between gap-0 py-0">
          <CardHeader className="gap-0 pb-2">
            <CardTitle className="text-lg font-semibold">{t("detail.stats.winRate", "Win rate")}</CardTitle>
            <p className="text-muted-foreground text-sm">{t("detail.stats.conversionRate", "Konwersja")}</p>
          </CardHeader>
          <CardContent className="pb-4">
            <p className="text-3xl font-bold tabular-nums">{winRate}%</p>
            <div className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${winRate}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Company Info ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            {t("detail.companyInfo", "Dane firmy")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoField label={t("detail.fields.industry", "Branża")} value={company.industry} icon={<Building2 className="h-3.5 w-3.5" />} />
            <InfoField label={t("detail.fields.size", "Wielkość")} value={company.size} icon={<UsersIcon className="h-3.5 w-3.5" />} />
            <InfoField label={t("detail.fields.phone", "Telefon")} value={company.phone} icon={<Phone className="h-3.5 w-3.5" />} />
            <InfoField
              label={t("detail.fields.website", "Strona WWW")}
              value={company.website}
              icon={<Globe className="h-3.5 w-3.5" />}
              href={company.website}
            />
            <InfoField
              label={t("detail.fields.domain", "Domena")}
              value={company.domain}
              icon={<Globe className="h-3.5 w-3.5" />}
              href={company.domain ? `https://${company.domain}` : undefined}
            />
            <InfoField
              label={t("detail.fields.created", "Utworzono")}
              value={new Date(company.createdAt).toLocaleDateString("pl-PL", { year: "numeric", month: "long", day: "numeric" })}
              icon={<Calendar className="h-3.5 w-3.5" />}
            />
            {addressStr && (
              <div className="sm:col-span-2 lg:col-span-3">
                <InfoField label={t("detail.fields.address", "Adres")} value={addressStr} icon={<MapPin className="h-3.5 w-3.5" />} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Custom Fields ─────────────────────────────────────────────── */}
      {customFields.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{t("detail.customFields", "Pola niestandardowe")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {customFields.map((cf) => (
                <InfoField key={cf.label} label={cf.label} value={cf.value || "—"} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Recent Activity ───────────────────────────────────────────── */}
      {recentActivities.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              {t("detail.recentActivity", "Ostatnia aktywność")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentActivities.slice(0, 5).map((a) => (
                <div key={a._id} className="flex items-start gap-3">
                  <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                    <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                      {(a.action ?? "A")[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{a.description ?? a.action ?? "Activity"}</p>
                    <p className="text-xs text-muted-foreground">{timeAgo(a.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Notes preview ─────────────────────────────────────────────── */}
      {company.notes && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              {t("detail.notes.title", "Notatki")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">{company.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function InfoField({
  icon,
  label,
  value,
  href,
}: {
  icon?: React.ReactNode;
  label: string;
  value?: string | null;
  href?: string;
}) {
  return (
    <div className="space-y-0.5">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon && <span className="shrink-0">{icon}</span>}
        {label}
      </dt>
      <dd className="text-sm">
        {href && value ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
            {value}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          value ?? "—"
        )}
      </dd>
    </div>
  );
}
