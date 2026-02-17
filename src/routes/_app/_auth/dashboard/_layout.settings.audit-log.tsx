import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import { useOrganization } from "@/components/org-context";
import { useRole } from "@/hooks/use-permission";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
import { useQuery as useTanstackQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/audit-log"
)({
  component: AuditLogSettings,
});

const ACTION_TYPES = [
  "permission_changed",
  "member_invited",
  "member_joined",
  "resource_shared",
  "entity_deleted",
  "status_changed",
  "payment_created",
  "payment_completed",
  "payment_refunded",
] as const;

const ACTION_LABELS: Record<string, string> = {
  permission_changed: "Permission Changed",
  member_invited: "Member Invited",
  member_joined: "Member Joined",
  resource_shared: "Resource Shared",
  entity_deleted: "Entity Deleted",
  status_changed: "Status Changed",
  payment_created: "Payment Created",
  payment_completed: "Payment Completed",
  payment_refunded: "Payment Refunded",
};

const ACTION_COLORS: Record<string, string> = {
  permission_changed: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  member_invited: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  member_joined: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  resource_shared: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  entity_deleted: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  status_changed: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  payment_created: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  payment_completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  payment_refunded: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

function parseDetails(details: string | undefined | null): string {
  if (!details) return "—";
  try {
    const parsed = JSON.parse(details);
    if (typeof parsed === "object" && parsed !== null) {
      return Object.entries(parsed)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
    }
    return String(parsed);
  } catch {
    return details;
  }
}

function AuditLogSettings() {
  const { t, i18n } = useTranslation();
  const { organizationId } = useOrganization();
  const { role, loading: roleLoading } = useRole();

  const [actionFilter, setActionFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data: members } = useTanstackQuery(
    convexQuery(api.organizations.getMembers, { organizationId })
  );

  const entries = useQuery(
    api.auditLog.list,
    role === "admin" || role === "owner"
      ? {
          organizationId,
          limit: 100,
          actionFilter: actionFilter !== "all" ? actionFilter : undefined,
          userFilter:
            userFilter !== "all"
              ? (userFilter as Id<"users">)
              : undefined,
          startDate: startDate
            ? new Date(startDate).getTime()
            : undefined,
          endDate: endDate
            ? new Date(endDate + "T23:59:59").getTime()
            : undefined,
        }
      : "skip"
  );

  const formatTimestamp = (ts: number) => {
    return new Date(ts).toLocaleString(i18n.language, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (roleLoading) return null;

  if (role !== "admin" && role !== "owner") {
    return (
      <div className="flex h-full w-full flex-col gap-6">
        <PageHeader
          title={t("auditLog.title", "Audit Log")}
          description={t("auditLog.description", "Track all important actions in your organization")}
        />
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {t("auditLog.accessDenied", "You do not have permission to view the audit log. Only admins and owners can access this page.")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <PageHeader
        title={t("auditLog.title", "Audit Log")}
        description={t("auditLog.description", "Track all important actions in your organization")}
      />

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("auditLog.filters", "Filters")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("auditLog.actionType", "Action Type")}
              </label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("auditLog.allActions", "All Actions")}
                  </SelectItem>
                  {ACTION_TYPES.map((action) => (
                    <SelectItem key={action} value={action}>
                      {ACTION_LABELS[action] ?? action}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("auditLog.user", "User")}
              </label>
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("auditLog.allUsers", "All Users")}
                  </SelectItem>
                  {members?.map((member) => (
                    <SelectItem
                      key={member.userId}
                      value={member.userId as string}
                    >
                      {member.user?.name ?? member.user?.email ?? "Unknown"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("auditLog.startDate", "Start Date")}
              </label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("auditLog.endDate", "End Date")}
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

      {/* Log Table */}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  {t("auditLog.timestamp", "Timestamp")}
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  {t("auditLog.userCol", "User")}
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  {t("auditLog.action", "Action")}
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  {t("auditLog.entity", "Entity")}
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  {t("auditLog.details", "Details")}
                </th>
              </tr>
            </thead>
            <tbody>
              {entries === undefined ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    {t("auditLog.loading", "Loading...")}
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    {t("auditLog.noEntries", "No audit log entries found")}
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry._id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                      {formatTimestamp(entry.createdAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {entry.user?.name ?? entry.user?.email ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="secondary"
                        className={ACTION_COLORS[entry.action] ?? ""}
                      >
                        {ACTION_LABELS[entry.action] ?? entry.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs">
                      {entry.entityType ? (
                        <span>
                          <span className="font-medium capitalize">{entry.entityType}</span>
                          {entry.entityId && (
                            <span className="ml-1 text-muted-foreground">
                              {entry.entityId.slice(0, 12)}...
                            </span>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-xs text-muted-foreground">
                      {parseDetails(entry.details)}
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
