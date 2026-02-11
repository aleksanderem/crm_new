import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mail, Calendar, Unplug, ExternalLink } from "lucide-react";
import { useState } from "react";

interface GoogleIntegrationCardProps {
  organizationId: Id<"organizations">;
  userId: string;
  convexSiteUrl: string;
}

export function GoogleIntegrationCard({
  organizationId,
  userId,
  convexSiteUrl,
}: GoogleIntegrationCardProps) {
  const { t } = useTranslation();
  const [disconnecting, setDisconnecting] = useState(false);

  const { data: connection } = useQuery(
    convexQuery(api.oauthConnections.getByProvider, {
      organizationId,
      provider: "google",
    })
  );

  const deactivate = useMutation(api.oauthConnections.deactivate);

  const handleConnect = () => {
    const url = `${convexSiteUrl}/google/oauth/initiate?organizationId=${organizationId}&userId=${userId}`;
    window.location.href = url;
  };

  const handleDisconnect = async () => {
    if (!connection || !window.confirm(t("integrations.confirmDisconnect"))) return;
    setDisconnecting(true);
    try {
      await deactivate({ organizationId, connectionId: connection._id });
    } finally {
      setDisconnecting(false);
    }
  };

  const isConnected = !!connection;

  return (
    <div className="rounded-lg border p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          </div>
          <div>
            <h3 className="font-semibold">{t("integrations.google")}</h3>
            {isConnected ? (
              <p className="text-sm text-muted-foreground">
                {t("integrations.connectedAs")} {connection.providerAccountId}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("integrations.notConnected")}
              </p>
            )}
          </div>
        </div>

        <Badge variant={isConnected ? "default" : "secondary"}>
          {isConnected ? t("integrations.connected") : t("integrations.notConnected")}
        </Badge>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Mail className="h-4 w-4" />
          <span>{t("integrations.gmailEnabled")}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <span>{t("integrations.calendarEnabled")}</span>
        </div>
      </div>

      {isConnected && connection.lastSyncedAt && (
        <p className="mt-3 text-xs text-muted-foreground">
          {t("integrations.lastSynced")}: {new Date(connection.lastSyncedAt).toLocaleString()}
        </p>
      )}

      <div className="mt-4">
        {isConnected ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDisconnect}
            disabled={disconnecting}
          >
            <Unplug className="mr-2 h-4 w-4" />
            {t("integrations.disconnect")}
          </Button>
        ) : (
          <Button size="sm" onClick={handleConnect}>
            <ExternalLink className="mr-2 h-4 w-4" />
            {t("integrations.connect")}
          </Button>
        )}
      </div>
    </div>
  );
}
