import { useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export function RouteErrorBoundary({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const router = useRouter();
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
