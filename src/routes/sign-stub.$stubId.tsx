import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@cvx/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "@/lib/ez-icons";

export const Route = createFileRoute("/sign-stub/$stubId")({
  component: SigningStubPage,
});

function SigningStubPage() {
  const { stubId } = Route.useParams();
  const resolveStub = useAction(api.signingStubs.resolveStub);
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const called = useRef(false);

  useEffect(() => {
    // Guard against React StrictMode double-invoke in development.
    if (called.current) return;
    called.current = true;

    resolveStub({ stubId })
      .then((token) => {
        void navigate({ to: "/sign/$token", params: { token } });
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "";
        if (/already used/i.test(msg)) {
          setError("Ten link do podpisu został już wykorzystany.");
        } else if (/expired/i.test(msg)) {
          setError("Ten link do podpisu wygasł.");
        } else {
          setError("Nie znaleziono dokumentu lub link jest nieprawidłowy.");
        }
      });
  }, [stubId, resolveStub, navigate]);

  return (
    <div className="h-dvh overflow-y-auto bg-muted/30">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-4 py-16">
            {error ? (
              <>
                <AlertTriangle className="h-12 w-12 text-muted-foreground" />
                <p className="text-center text-muted-foreground">{error}</p>
              </>
            ) : (
              <p className="animate-pulse text-muted-foreground">
                Ładowanie dokumentu...
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
