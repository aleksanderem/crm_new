import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import {
  maybeReloadForStaleChunk,
  reportError,
} from "@/lib/error-reporter";

export function RouteErrorBoundary({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const router = useRouter();

  // Push the error into the global errorLogs table on first render of the
  // boundary. reportError de-duplicates the same key within a 5s window so a
  // re-rendering boundary won't spam the table.
  useEffect(() => {
    // Stale chunk after a deploy → reload once instead of showing the
    // generic error UI. Issue #1368.
    if (maybeReloadForStaleChunk(error)) return;
    reportError(error, {
      scope: "route-error-boundary",
      fnName:
        typeof window !== "undefined" ? window.location.pathname : undefined,
    });
  }, [error]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive" />
      <div>
        <p className="text-sm font-medium">Something went wrong</p>
        <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={reset}>
          Try again
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => router.history.back()}
        >
          Go back
        </Button>
      </div>
    </div>
  );
}
