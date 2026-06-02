import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";

type Status = "sent" | "failed" | "skipped";
type Source =
  | "signing"
  | "automation"
  | "manual_compose"
  | "auto_generate"
  | "event_trigger"
  | "system";
type Provider =
  | "resend"
  | "mailgun"
  | "google"
  | "microsoft"
  | "gmail"
  | "dev_intercept";

const STATUS_COLORS: Record<Status, string> = {
  sent: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  skipped: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
};

const SOURCES: Source[] = [
  "signing",
  "automation",
  "manual_compose",
  "auto_generate",
  "event_trigger",
  "system",
];

const PROVIDERS: Provider[] = [
  "resend",
  "mailgun",
  "google",
  "microsoft",
  "gmail",
  "dev_intercept",
];

interface MailSendLogTabProps {
  organizationId: Id<"organizations">;
}

export function MailSendLogTab({ organizationId }: MailSendLogTabProps) {
  const { t, i18n } = useTranslation();

  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<Source | "all">("all");
  const [providerFilter, setProviderFilter] = useState<Provider | "all">("all");
  const [recipient, setRecipient] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data: entries } = useQuery(
    convexQuery(api.emailSendLog.list, {
      organizationId,
      limit: 200,
      status: statusFilter !== "all" ? statusFilter : undefined,
      source: sourceFilter !== "all" ? sourceFilter : undefined,
      provider: providerFilter !== "all" ? providerFilter : undefined,
      recipient: recipient.trim() || undefined,
      startDate: startDate ? new Date(startDate).getTime() : undefined,
      endDate: endDate ? new Date(endDate + "T23:59:59").getTime() : undefined,
    }),
  );

  const formatTimestamp = (ts: number) =>
    new Date(ts).toLocaleString(i18n.language, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("settings.mail.logs.filters", "Filtry")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("settings.mail.logs.status", "Status")}
              </label>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as Status | "all")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("settings.mail.logs.allStatuses", "Wszystkie statusy")}
                  </SelectItem>
                  <SelectItem value="sent">
                    {t("settings.mail.logs.statusValue.sent", "Wysłano")}
                  </SelectItem>
                  <SelectItem value="failed">
                    {t("settings.mail.logs.statusValue.failed", "Błąd")}
                  </SelectItem>
                  <SelectItem value="skipped">
                    {t("settings.mail.logs.statusValue.skipped", "Pominięto")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("settings.mail.logs.source", "Źródło")}
              </label>
              <Select
                value={sourceFilter}
                onValueChange={(v) => setSourceFilter(v as Source | "all")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("settings.mail.logs.allSources", "Wszystkie źródła")}
                  </SelectItem>
                  {SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`settings.mail.logs.sourceValue.${s}`, s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("settings.mail.logs.provider", "Dostawca")}
              </label>
              <Select
                value={providerFilter}
                onValueChange={(v) => setProviderFilter(v as Provider | "all")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("settings.mail.logs.allProviders", "Wszyscy dostawcy")}
                  </SelectItem>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {t(`settings.mail.logs.providerValue.${p}`, p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("settings.mail.logs.recipient", "Odbiorca")}
              </label>
              <Input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="email@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("settings.mail.logs.startDate", "Od")}
              </label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("settings.mail.logs.endDate", "Do")}
              </label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  {t("settings.mail.logs.col.timestamp", "Czas")}
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  {t("settings.mail.logs.col.status", "Status")}
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  {t("settings.mail.logs.col.source", "Źródło")}
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  {t("settings.mail.logs.col.provider", "Dostawca")}
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  {t("settings.mail.logs.col.recipient", "Odbiorca")}
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  {t("settings.mail.logs.col.subject", "Temat")}
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  {t("settings.mail.logs.col.error", "Błąd")}
                </th>
              </tr>
            </thead>
            <tbody>
              {entries === undefined ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    {t("settings.mail.logs.loading", "Ładowanie...")}
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    {t("settings.mail.logs.empty", "Brak wpisów w dzienniku.")}
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr
                    key={entry._id}
                    className="border-b last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                      {formatTimestamp(entry.sentAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge
                        variant="secondary"
                        className={STATUS_COLORS[entry.status as Status] ?? ""}
                      >
                        {t(
                          `settings.mail.logs.statusValue.${entry.status}`,
                          entry.status,
                        )}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs">
                      {t(
                        `settings.mail.logs.sourceValue.${entry.source}`,
                        entry.source,
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs">
                      {entry.provider
                        ? t(
                            `settings.mail.logs.providerValue.${entry.provider}`,
                            entry.provider,
                          )
                        : "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs">
                      {entry.recipientName ? (
                        <span>
                          <span className="font-medium">
                            {entry.recipientName}
                          </span>{" "}
                          <span className="text-muted-foreground">
                            &lt;{entry.recipientEmail}&gt;
                          </span>
                        </span>
                      ) : (
                        entry.recipientEmail
                      )}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-xs">
                      {entry.subject ?? "—"}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-xs text-red-600 dark:text-red-400">
                      {entry.errorMessage ?? ""}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
