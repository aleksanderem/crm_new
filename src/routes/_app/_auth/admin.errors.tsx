import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/_auth/admin/errors")({
  component: AdminErrors,
});

type SourceFilter = "all" | "convex" | "frontend";

function AdminErrors() {
  const getIsPlatformAdmin = useAction(api.app.getIsPlatformAdmin);
  const { data: adminStatus, isLoading: viewerLoading } = useQuery({
    queryKey: ["isPlatformAdmin"],
    queryFn: () => getIsPlatformAdmin({}),
  });

  const [source, setSource] = useState<SourceFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const listErrors = useAction(api.errorLogs.list);
  const errorsQuery = useQuery({
    queryKey: ["errorLogs", "list", source],
    queryFn: () => listErrors({ limit: 200, source: source === "all" ? undefined : source }),
    enabled: Boolean(adminStatus?.isPlatformAdmin),
    refetchInterval: 5000,
  });

  if (viewerLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!adminStatus?.isPlatformAdmin) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <Card>
          <CardHeader>
            <CardTitle>403 — Platform admin required</CardTitle>
            <CardDescription>
              This page is only accessible to platform administrators.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/dashboard" className="text-sm underline">
              Back to dashboard
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const errors = errorsQuery.data ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Platform admin · Errors</h1>
          <p className="text-sm text-muted-foreground">
            Recent uncaught errors from the Convex backend and the frontend.
            Auto-refreshes every 5s.
          </p>
        </div>
        <Link to="/admin" className="text-sm underline">
          ← Back
        </Link>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Errors ({errors.length})</CardTitle>
            <CardDescription>
              Click a row to expand stack trace and context.
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <Select value={source} onValueChange={(v) => setSource(v as SourceFilter)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="convex">Convex (server)</SelectItem>
                <SelectItem value="frontend">Frontend (browser)</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              onClick={() => errorsQuery.refetch()}
              disabled={errorsQuery.isFetching}
            >
              {errorsQuery.isFetching ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {errorsQuery.isLoading && (
              <div className="p-6 text-sm text-muted-foreground">Loading…</div>
            )}
            {!errorsQuery.isLoading && errors.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground">
                No errors recorded. Either everything's fine, or logging hasn't
                been wired into the surface you're hitting yet.
              </div>
            )}
            {errors.map((e) => {
              const isOpen = expandedId === e._id;
              return (
                <div key={e._id} className="p-4">
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 text-left"
                    onClick={() => setExpandedId(isOpen ? null : e._id)}
                  >
                    <div className="flex w-32 shrink-0 flex-col gap-1">
                      <span className="text-xs font-mono text-muted-foreground">
                        {new Date(e.ts).toLocaleString()}
                      </span>
                      <div className="flex gap-1">
                        <Badge variant={e.source === "convex" ? "default" : "secondary"}>
                          {e.source}
                        </Badge>
                        {e.level === "warn" && <Badge variant="outline">warn</Badge>}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{e.message}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {e.scope && <span className="font-mono">{e.scope}</span>}
                        {e.fnName && <span className="font-mono">· {e.fnName}</span>}
                        {e._user && (
                          <span>
                            · {e._user.email ?? e._user.name ?? "(unknown user)"}
                          </span>
                        )}
                        {e.url && (
                          <span className="truncate">· {e.url}</span>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {isOpen ? "▾" : "▸"}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="mt-3 space-y-3 rounded-md bg-muted/40 p-3 text-xs">
                      {e.stack && (
                        <div>
                          <div className="mb-1 font-semibold text-muted-foreground">
                            Stack
                          </div>
                          <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px]">
                            {e.stack}
                          </pre>
                        </div>
                      )}
                      {e.argsJson && (
                        <div>
                          <div className="mb-1 font-semibold text-muted-foreground">
                            Args
                          </div>
                          <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px]">
                            {e.argsJson}
                          </pre>
                        </div>
                      )}
                      {e.userAgent && (
                        <div>
                          <span className="font-semibold text-muted-foreground">
                            User-Agent:
                          </span>{" "}
                          <span className="font-mono">{e.userAgent}</span>
                        </div>
                      )}
                      <div className="font-mono text-[10px] text-muted-foreground">
                        id: {e._id}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
