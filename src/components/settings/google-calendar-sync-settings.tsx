import { useState, useEffect } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { useQuery as useTanstackQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { useRole } from "@/hooks/use-permission";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, RefreshCw, Trash2, Plus, Check, AlertTriangle } from "lucide-react";

interface GoogleCalendarSyncSettingsProps {
  organizationId: Id<"organizations">;
}

interface GoogleCalendarInfo {
  id: string;
  summary: string;
  description?: string;
  primary: boolean;
  backgroundColor?: string;
  accessRole?: string;
}

export function GoogleCalendarSyncSettings({
  organizationId,
}: GoogleCalendarSyncSettingsProps) {
  const { t } = useTranslation();
  const { role } = useRole();
  const isAdmin = role === "owner" || role === "admin";

  const activityTypes = useQuery(api.activityTypes.list, { organizationId });
  const myConfigs = useQuery(api.googleCalendarSyncConfigs.listMine, {
    organizationId,
  });
  const allConfigs = useQuery(
    api.googleCalendarSyncConfigs.listAll,
    isAdmin ? { organizationId } : "skip"
  );
  const orgDefault = useQuery(api.googleCalendarSyncConfigs.getOrgDefault, {
    organizationId,
  });
  const myConnection = useQuery(api.oauthConnections.getMyGoogleConnection, {
    organizationId,
  });
  const { data: user } = useTanstackQuery(
    convexQuery(api.app.getCurrentUser, {})
  );

  const createConfig = useMutation(api.googleCalendarSyncConfigs.create);
  const updateConfig = useMutation(api.googleCalendarSyncConfigs.update);
  const removeConfig = useMutation(api.googleCalendarSyncConfigs.remove);
  const syncMy = useAction(api.google.calendarSync.syncMyCalendars);
  const listCalendars = useAction(api.google.calendar.listUserCalendars);

  const [syncing, setSyncing] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [availableCalendars, setAvailableCalendars] = useState<GoogleCalendarInfo[] | null>(null);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [addingCalendarId, setAddingCalendarId] = useState<string | null>(null);

  // Check if connection has the full calendar scope (not just calendar.events)
  const scopeInsufficient = myConnection
    ? !myConnection.scope?.match(/\/auth\/calendar(?:\s|$)/)
    : false;

  // Detect ?success=true from OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "true") {
      // Clean URL
      const url = new URL(window.location.href);
      url.searchParams.delete("success");
      window.history.replaceState({}, "", url.pathname);
      // Auto-open calendar picker
      setShowPicker(true);
    }
  }, []);

  // Fetch available calendars when picker is shown and connection exists
  const hasFetched = availableCalendars !== null;
  useEffect(() => {
    if (showPicker && myConnection && !hasFetched) {
      fetchCalendars();
    }
  }, [showPicker, myConnection, hasFetched]);

  const fetchCalendars = async () => {
    if (!myConnection) return;
    setLoadingCalendars(true);
    try {
      const calendars = await listCalendars({
        organizationId,
        connectionId: myConnection._id,
      });
      setAvailableCalendars(calendars as GoogleCalendarInfo[]);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(t("googleCalendar.settings.fetchCalendarsError") + ": " + message);
      setShowPicker(false);
    } finally {
      setLoadingCalendars(false);
    }
  };

  const convexUrl = import.meta.env.VITE_CONVEX_URL as string;
  const convexSiteUrl = convexUrl.replace(".cloud", ".site");

  const handleConnectGoogle = () => {
    if (!user?._id) return;
    const url = `${convexSiteUrl}/google/oauth/initiate?organizationId=${organizationId}&userId=${user._id}`;
    window.location.href = url;
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const results = await syncMy({ organizationId });
      toast.success(
        t("googleCalendar.settings.syncSuccess", {
          count: results.length,
        })
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(
        t("googleCalendar.settings.syncError", { error: message })
      );
    } finally {
      setSyncing(false);
    }
  };

  const handleAddCalendar = async (cal: GoogleCalendarInfo) => {
    if (!myConnection) return;
    setAddingCalendarId(cal.id);
    try {
      await createConfig({
        organizationId,
        connectionId: myConnection._id,
        googleCalendarId: cal.id,
        googleCalendarName: cal.summary,
        targetModule: "crm",
        visibility: "full",
      });
      toast.success(t("googleCalendar.settings.calendarAdded"));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(message);
    } finally {
      setAddingCalendarId(null);
    }
  };

  const handleUpdateConfig = async (
    configId: Id<"googleCalendarSyncConfigs">,
    patch: {
      targetModule?: "crm" | "gabinet";
      targetActivityType?: string;
      visibility?: "full" | "busy_only" | "hidden";
      syncEnabled?: boolean;
      isOrgDefault?: boolean;
    }
  ) => {
    try {
      await updateConfig({ configId, ...patch });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(message);
    }
  };

  const handleRemoveConfig = async (
    configId: Id<"googleCalendarSyncConfigs">
  ) => {
    try {
      await removeConfig({ configId });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(message);
    }
  };

  const formatLastSync = (ts?: number) => {
    if (!ts) return "—";
    return new Date(ts).toLocaleString();
  };

  const renderSyncStatus = (
    status?: "idle" | "syncing" | "error",
    error?: string
  ) => {
    if (status === "syncing") {
      return (
        <Badge variant="outline" className="text-blue-600">
          {t("googleCalendar.settings.syncStatusSyncing")}
        </Badge>
      );
    }
    if (status === "error") {
      return (
        <Badge variant="destructive" title={error}>
          {t("googleCalendar.settings.syncStatusError")}
        </Badge>
      );
    }
    return (
      <Badge variant="secondary">
        {t("googleCalendar.settings.syncStatusIdle")}
      </Badge>
    );
  };

  // IDs of calendars already connected
  const connectedCalendarIds = new Set(
    myConfigs?.map((c) => c.googleCalendarId) ?? []
  );

  return (
    <div className="flex flex-col gap-6 pb-8">
      {/* Personal calendar section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("googleCalendar.settings.connectCalendar")}</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncNow}
              disabled={syncing || !myConfigs?.length}
            >
              {syncing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {syncing
                ? t("googleCalendar.settings.syncing")
                : t("googleCalendar.settings.syncNow")}
            </Button>
            {myConnection ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowPicker(true);
                  if (!availableCalendars) fetchCalendars();
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t("googleCalendar.settings.addCalendar")}
              </Button>
            ) : (
              <Button size="sm" onClick={handleConnectGoogle}>
                {t("googleCalendar.settings.connectCalendar")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Scope upgrade alert */}
          {scopeInsufficient && (
            <Alert className="mb-4 border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="flex items-center justify-between">
                <span className="text-sm">
                  {t("googleCalendar.settings.scopeUpgradeNeeded")}
                </span>
                <Button size="sm" variant="outline" onClick={handleConnectGoogle}>
                  {t("googleCalendar.settings.reauthorize")}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Calendar picker after OAuth success */}
          {showPicker && (
            <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-4">
              <p className="mb-3 text-sm font-medium">
                {t("googleCalendar.settings.selectCalendarsToConnect")}
              </p>
              {loadingCalendars ? (
                <div className="flex items-center gap-2 py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">
                    {t("googleCalendar.settings.fetchingCalendars")}
                  </span>
                </div>
              ) : availableCalendars && availableCalendars.length > 0 ? (
                <div className="space-y-2">
                  {availableCalendars.map((cal) => {
                    const alreadyConnected = connectedCalendarIds.has(cal.id);
                    return (
                      <div
                        key={cal.id}
                        className="flex items-center justify-between rounded-md border px-3 py-2"
                      >
                        <div className="flex items-center gap-3">
                          {cal.backgroundColor && (
                            <div
                              className="h-3 w-3 rounded-full"
                              style={{ backgroundColor: cal.backgroundColor }}
                            />
                          )}
                          <div>
                            <span className="text-sm font-medium">
                              {cal.summary}
                            </span>
                            {cal.primary && (
                              <Badge variant="outline" className="ml-2 text-xs">
                                {t("googleCalendar.settings.primary")}
                              </Badge>
                            )}
                          </div>
                        </div>
                        {alreadyConnected ? (
                          <Badge variant="secondary">
                            <Check className="mr-1 h-3 w-3" />
                            {t("googleCalendar.settings.enabled")}
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={addingCalendarId === cal.id}
                            onClick={() => handleAddCalendar(cal)}
                          >
                            {addingCalendarId === cal.id ? (
                              <>
                                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                {t("googleCalendar.settings.adding")}
                              </>
                            ) : (
                              <>
                                <Plus className="mr-2 h-3 w-3" />
                                {t("googleCalendar.settings.addCalendar")}
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                  <div className="pt-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowPicker(false)}
                    >
                      {t("common.close")}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("googleCalendar.settings.noCalendarsConnected")}
                </p>
              )}
            </div>
          )}

          {myConfigs === undefined ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : myConfigs.length === 0 && !showPicker ? (
            <p className="text-sm text-muted-foreground">
              {t("googleCalendar.settings.noCalendarsConnected")}
            </p>
          ) : (
            <div className="space-y-4">
              {myConfigs.map((config) => (
                <div
                  key={config._id}
                  className="flex flex-col gap-4 rounded-lg border p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-medium">
                        {config.googleCalendarName}
                      </span>
                      <Badge variant="outline">
                        {config.targetModule === "crm"
                          ? t("googleCalendar.settings.targetModuleCrm")
                          : t("googleCalendar.settings.targetModuleGabinet")}
                      </Badge>
                      {renderSyncStatus(
                        config.syncStatus ?? undefined,
                        config.syncError ?? undefined
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveConfig(config._id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {/* Module selector */}
                    <div className="space-y-2">
                      <Label>
                        {t("googleCalendar.settings.targetModule")}
                      </Label>
                      <Select
                        value={config.targetModule}
                        onValueChange={(value: "crm" | "gabinet") =>
                          handleUpdateConfig(config._id, {
                            targetModule: value,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="crm">
                            {t("googleCalendar.settings.targetModuleCrm")}
                          </SelectItem>
                          <SelectItem value="gabinet">
                            {t("googleCalendar.settings.targetModuleGabinet")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Activity type selector */}
                    <div className="space-y-2">
                      <Label>
                        {t("googleCalendar.settings.activityType")}
                      </Label>
                      <Select
                        value={config.targetActivityType ?? "meeting"}
                        onValueChange={(value: string) =>
                          handleUpdateConfig(config._id, {
                            targetActivityType: value,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(activityTypes ?? []).map((at) => (
                            <SelectItem key={at._id} value={at.key}>
                              {at.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Visibility */}
                    <div className="space-y-2">
                      <Label>
                        {t("googleCalendar.settings.visibility")}
                      </Label>
                      <RadioGroup
                        value={config.visibility}
                        onValueChange={(
                          value: "full" | "busy_only" | "hidden"
                        ) =>
                          handleUpdateConfig(config._id, {
                            visibility: value,
                          })
                        }
                        className="flex flex-col gap-1"
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="full" id={`vis-full-${config._id}`} />
                          <Label htmlFor={`vis-full-${config._id}`} className="font-normal">
                            {t("googleCalendar.settings.visibilityFull")}
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="busy_only" id={`vis-busy-${config._id}`} />
                          <Label htmlFor={`vis-busy-${config._id}`} className="font-normal">
                            {t("googleCalendar.settings.visibilityBusyOnly")}
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="hidden" id={`vis-hidden-${config._id}`} />
                          <Label htmlFor={`vis-hidden-${config._id}`} className="font-normal">
                            {t("googleCalendar.settings.visibilityHidden")}
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>

                    {/* Sync toggle + status */}
                    <div className="space-y-2">
                      <Label>
                        {t("googleCalendar.settings.syncEnabled")}
                      </Label>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={config.syncEnabled}
                          onCheckedChange={(checked: boolean) =>
                            handleUpdateConfig(config._id, {
                              syncEnabled: checked,
                            })
                          }
                        />
                        <span className="text-sm text-muted-foreground">
                          {config.syncEnabled
                            ? t("googleCalendar.settings.enabled")
                            : t("googleCalendar.settings.disabled")}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t("googleCalendar.settings.lastSync")}:{" "}
                        {formatLastSync(config.lastSyncAt ?? undefined)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Admin section */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>
              {t("googleCalendar.settings.employeeCalendars")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Org default info */}
            {orgDefault && (
              <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <p className="text-sm font-medium">
                  {t("googleCalendar.settings.orgDefault")}:{" "}
                  <span className="font-semibold">
                    {orgDefault.googleCalendarName}
                  </span>
                </p>
              </div>
            )}

            {allConfigs === undefined ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : allConfigs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("googleCalendar.settings.noCalendarsConnected")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      {t("googleCalendar.settings.calendarName")}
                    </TableHead>
                    <TableHead>
                      {t("googleCalendar.settings.module")}
                    </TableHead>
                    <TableHead>
                      {t("googleCalendar.settings.visibility")}
                    </TableHead>
                    <TableHead>
                      {t("googleCalendar.settings.syncStatus")}
                    </TableHead>
                    <TableHead>
                      {t("googleCalendar.settings.lastSync")}
                    </TableHead>
                    <TableHead>
                      {t("googleCalendar.settings.syncEnabled")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allConfigs.map((config) => (
                    <TableRow key={config._id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {config.googleCalendarName}
                          {config.isOrgDefault && (
                            <Badge variant="outline" className="text-xs">
                              {t("googleCalendar.settings.orgDefault")}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {config.targetModule === "crm"
                            ? t("googleCalendar.settings.targetModuleCrm")
                            : t("googleCalendar.settings.targetModuleGabinet")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {config.visibility === "full"
                          ? t("googleCalendar.settings.visibilityFull")
                          : config.visibility === "busy_only"
                            ? t("googleCalendar.settings.visibilityBusyOnly")
                            : t("googleCalendar.settings.visibilityHidden")}
                      </TableCell>
                      <TableCell>
                        {renderSyncStatus(
                          config.syncStatus ?? undefined,
                          config.syncError ?? undefined
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatLastSync(config.lastSyncAt ?? undefined)}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={config.syncEnabled}
                          onCheckedChange={(checked: boolean) =>
                            handleUpdateConfig(config._id, {
                              syncEnabled: checked,
                            })
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
