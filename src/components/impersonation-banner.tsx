/**
 * ImpersonationBanner
 *
 * Persistent amber top banner shown while a platform admin is previewing an
 * organisation in read-only mode ("Wejdź jako").
 *
 * KNOWN LIMITATION (shown in the banner): write actions and Convex-action-backed
 * reads are unavailable during impersonation by design — only Supabase-direct
 * reads (RLS-filtered by the impersonation token's org_id claim) work.
 *
 * "Wyjdź" clears the impersonation state and navigates to /dashboard, which
 * causes SupabaseProvider to fall back to the normal org token.
 */

import { useImpersonation } from "@/components/impersonation-context";
import { Button } from "@/components/ui/button";

export function ImpersonationBanner() {
  const { impersonation, stopImpersonation } = useImpersonation();

  if (!impersonation) return null;

  function handleExit() {
    stopImpersonation();
    // Hard navigate so SupabaseProvider re-mounts with the normal token.
    window.location.assign("/dashboard");
  }

  return (
    <div className="flex items-center justify-between gap-4 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950">
      <span>
        Podgląd jako operator:{" "}
        <span className="font-semibold">{impersonation.orgName}</span>
        {" — tryb tylko-do-odczytu. Zapis i akcje Convex są niedostępne."}
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-7 border-amber-800 bg-transparent text-amber-950 hover:bg-amber-600 hover:text-amber-950"
        onClick={handleExit}
      >
        Wyjdź
      </Button>
    </div>
  );
}
