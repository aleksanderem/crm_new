/**
 * CompanyOverviewTab — rich "Overview" tab for company detail pages.
 *
 * Shows: key info grid, OpenStreetMap embed (if address), pipeline stats,
 * recent activity mini-timeline, and custom fields.
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Building2,
  Globe,
  Phone,
  Mail,
  MapPin,
  TrendingUp,
  Users,
  FileText,
  Calendar,
} from "lucide-react";
import type { MappedCompany } from "@/lib/supabase/mappers/companies";

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
  return [a.street, a.city, a.state, a.zip, a.country]
    .filter(Boolean)
    .join(", ");
}

function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("pl-PL", { style: "currency", currency }).format(value);
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

  const mapQuery = addressStr ? encodeURIComponent(addressStr) : null;

  const winRate = dealSummary.totalDeals > 0
    ? Math.round((dealSummary.wonDeals / dealSummary.totalDeals) * 100)
    : 0;

  return (
    <div className="space-y-6 p-1">
      {/* Key Info Grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        <InfoItem icon={<Building2 className="h-4 w-4" />} label={t("detail.fields.industry", "Branża")} value={company.industry} />
        <InfoItem icon={<Users className="h-4 w-4" />} label={t("detail.fields.size", "Wielkość")} value={company.size} />
        <InfoItem
          icon={<Globe className="h-4 w-4" />}
          label={t("detail.fields.website", "Strona WWW")}
          value={company.website}
          href={company.website}
        />
        <InfoItem
          icon={<Globe className="h-4 w-4" />}
          label={t("detail.fields.domain", "Domena")}
          value={company.domain}
          href={company.domain ? `https://${company.domain}` : undefined}
        />
        <InfoItem icon={<Phone className="h-4 w-4" />} label={t("detail.fields.phone", "Telefon")} value={company.phone} />
        <InfoItem icon={<Mail className="h-4 w-4" />} label={t("detail.fields.created", "Utworzono")} value={new Date(company.createdAt).toLocaleDateString("pl-PL")} />
        {addressStr && (
          <div className="sm:col-span-2">
            <InfoItem icon={<MapPin className="h-4 w-4" />} label={t("detail.fields.address", "Adres")} value={addressStr} />
          </div>
        )}
      </div>

      {/* Custom Fields */}
      {customFields.length > 0 && (
        <>
          <Separator />
          <div>
            <h3 className="text-sm font-semibold mb-3">{t("detail.customFields", "Pola niestandardowe")}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {customFields.map((cf) => (
                <div key={cf.label} className="space-y-0.5">
                  <dt className="text-xs text-muted-foreground">{cf.label}</dt>
                  <dd className="text-sm">{cf.value || "—"}</dd>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Map */}
      {mapQuery && (
        <>
          <Separator />
          <Card className="overflow-hidden">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                {t("detail.location", "Lokalizacja")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <iframe
                title="Company location"
                width="100%"
                height="250"
                style={{ border: 0 }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${mapQuery}&layer=mapnik&marker=true`}
                allow="geolocation"
              />
              <a
                href={`https://www.openstreetmap.org/search?query=${mapQuery}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
              >
                {t("detail.viewLargerMap", "Pokaż większą mapę")} →
              </a>
            </CardContent>
          </Card>
        </>
      )}

      {/* Pipeline Stats */}
      <Separator />
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          {t("detail.pipelineStats", "Pipeline")}
        </h3>
        <div className="grid gap-3 sm:grid-cols-4">
          <StatCard
            label={t("detail.stats.totalDeals", "Transakcje")}
            value={String(dealSummary.totalDeals)}
            sub={`${dealSummary.openDeals} ${t("detail.stats.open", "otwartych")}`}
          />
          <StatCard
            label={t("detail.stats.totalValue", "Wartość pipeline")}
            value={formatCurrency(dealSummary.totalValue, dealSummary.currency)}
          />
          <StatCard
            label={t("detail.stats.wonValue", "Wygrane")}
            value={formatCurrency(dealSummary.wonValue, dealSummary.currency)}
            sub={`${dealSummary.wonDeals} ${t("detail.stats.deals", "transakcji")}`}
            variant="success"
          />
          <StatCard
            label={t("detail.stats.winRate", "Win rate")}
            value={`${winRate}%`}
            sub={
              <Progress value={winRate} className="h-1.5 mt-1" />
            }
          />
        </div>
      </div>

      {/* Contacts count */}
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard
          label={t("detail.stats.contacts", "Kontakty")}
          value={String(contactCount)}
          sub={t("detail.stats.linkedContacts", "powiązanych")}
        />
      </div>

      {/* Recent Activity */}
      {recentActivities.length > 0 && (
        <>
          <Separator />
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {t("detail.recentActivity", "Ostatnia aktywność")}
            </h3>
            <div className="space-y-2">
              {recentActivities.slice(0, 5).map((a) => (
                <div key={a._id} className="flex items-start gap-3 text-sm">
                  <div className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{a.description ?? a.action ?? "Activity"}</p>
                    <p className="text-xs text-muted-foreground">{timeAgo(a.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Notes preview */}
      {company.notes && (
        <>
          <Separator />
          <div>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {t("detail.notes.title", "Notatki")}
            </h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">
              {company.notes}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function InfoItem({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string | null;
  href?: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 text-muted-foreground shrink-0">{icon}</div>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="text-sm truncate">
          {href && value ? (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              {value}
            </a>
          ) : (
            value ?? "—"
          )}
        </dd>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  variant,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  variant?: "success" | "danger";
}) {
  return (
    <Card className="py-0">
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-lg font-bold tabular-nums ${variant === "success" ? "text-emerald-600" : variant === "danger" ? "text-red-600" : ""}`}>
          {value}
        </p>
        {sub && (
          typeof sub === "string" ? (
            <p className="text-xs text-muted-foreground">{sub}</p>
          ) : sub
        )}
      </CardContent>
    </Card>
  );
}
