import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

const PAGE_SIZE = 50;

interface MailSendLogTabProps {
  organizationId: Id<"organizations">;
}

export function MailSendLogTab({ organizationId }: MailSendLogTabProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<Source | "all">("all");
  const [providerFilter, setProviderFilter] = useState<Provider | "all">("all");
  const [recipient, setRecipient] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Cursor stack for keyset Prev/Next. `null` is the first page. Every Next
  // pushes the previous result's `continueCursor`; Prev pops back.
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [isExporting, setIsExporting] = useState(false);

  const filters = useMemo(
    () => ({
      organizationId,
      status: statusFilter !== "all" ? statusFilter : undefined,
      source: sourceFilter !== "all" ? sourceFilter : undefined,
      provider: providerFilter !== "all" ? providerFilter : undefined,
      recipient: recipient.trim() || undefined,
      startDate: startDate ? new Date(startDate).getTime() : undefined,
      endDate: endDate ? new Date(endDate + "T23:59:59").getTime() : undefined,
    }),
    [
      organizationId,
      statusFilter,
      sourceFilter,
      providerFilter,
      recipient,
      startDate,
      endDate,
    ],
  );

  // Reset to the first page whenever any filter changes.
  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    setCursorStack([null]);
  }, [filterKey]);

  const currentCursor = cursorStack[cursorStack.length - 1];
  const pageNumber = cursorStack.length;

  const resetFilters = () => {
    setStatusFilter("all");
    setSourceFilter("all");
    setProviderFilter("all");
    setRecipient("");
    setStartDate("");
    setEndDate("");
  };

  const { data, isLoading } = useQuery(
    convexQuery(api.emailSendLog.list, {
      ...filters,
      paginationOpts: { numItems: PAGE_SIZE, cursor: currentCursor },
    }),
  );

  const entries = data?.page;
  const isDone = data?.isDone ?? false;

  const formatTimestamp = (ts: number) =>
    new Date(ts).toLocaleString(i18n.language, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  const handlePrev = () => {
    if (cursorStack.length > 1) {
      setCursorStack((prev) => prev.slice(0, -1));
    }
  };

  const handleNext = () => {
    if (data && !data.isDone && data.continueCursor) {
      setCursorStack((prev) => [...prev, data.continueCursor]);
    }
  };

  const escapeCsv = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return "";
    const s = String(value);
    if (/[",\n\r]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await queryClient.fetchQuery(
        convexQuery(api.emailSendLog.exportRows, filters),
      );

      const header = [
        "sentAt",
        "status",
        "source",
        "provider",
        "recipientEmail",
        "recipientName",
        "fromEmail",
        "subject",
        "templateId",
        "errorMessage",
        "relatedEntityType",
        "relatedEntityId",
      ];
      const csvLines = [header.join(",")];
      for (const r of result.rows) {
        csvLines.push(
          [
            new Date(r.sentAt).toISOString(),
            r.status,
            r.source,
            r.provider ?? "",
            r.recipientEmail,
            r.recipientName ?? "",
            r.fromEmail ?? "",
            r.subject ?? "",
            r.templateId ?? "",
            r.errorMessage ?? "",
            r.relatedEntityType ?? "",
            r.relatedEntityId ?? "",
          ]
            .map(escapeCsv)
            .join(","),
        );
      }

      const csv = csvLines.join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      a.download = `mail-send-log-${ts}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (result.truncated) {
        toast.warning(
          t("settings.mail.logs.exportTruncated", {
            cap: result.cap,
            defaultValue: `Eksport ograniczony do {{cap}} najnowszych wpisów.`,
          }),
        );
      } else {
        toast.success(
          t("settings.mail.logs.exportSuccess", {
            count: result.rows.length,
            defaultValue: `Wyeksportowano {{count}} wpisów.`,
          }),
        );
      }
    } catch (e) {
      console.error("[mail-send-log] export failed", e);
      toast.error(
        t("settings.mail.logs.exportError", "Nie udało się wyeksportować dziennika."),
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">
            {t("settings.mail.logs.filters", "Filtry")}
          </CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={isExporting}
          >
            <Download className="mr-2 h-4 w-4" />
            {isExporting
              ? t("settings.mail.logs.exporting", "Eksportowanie...")
              : t("settings.mail.logs.exportCsv", "Eksportuj CSV")}
          </Button>
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

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {t("settings.mail.logs.page", { page: pageNumber, defaultValue: "Strona {{page}}" })}
          {entries !== undefined && (
            <>
              {" · "}
              {t("settings.mail.logs.shown", {
                count: entries.length,
                defaultValue: "{{count}} wpisów",
              })}
            </>
          )}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePrev}
            disabled={pageNumber <= 1 || isLoading}
          >
            {t("settings.mail.logs.prev", "Poprzednia")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleNext}
            disabled={isDone || isLoading || !data?.continueCursor}
          >
            {t("settings.mail.logs.next", "Następna")}
          </Button>
          {(statusFilter !== "all" ||
            sourceFilter !== "all" ||
            providerFilter !== "all" ||
            recipient ||
            startDate ||
            endDate) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetFilters}
            >
              {t("settings.mail.logs.resetFilters", "Wyczyść filtry")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
