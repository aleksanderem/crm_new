/**
 * ImpersonationContext
 *
 * Manages read-only support impersonation state ("Wejdź jako").
 *
 * When active, a platform admin is previewing an organisation's data through
 * that org's Supabase JWT. This token carries the TARGET org's `org_id` claim
 * so Supabase-direct reads (RLS-filtered) return that org's rows.
 *
 * KNOWN LIMITATION: write mutations and Convex-action-backed reads are
 * unavailable during impersonation by design. Every Convex mutation calls
 * verifyOrgAccess, which checks teamMemberships for the REAL authenticated
 * user (the admin). Since the admin is NOT a member of the target org,
 * verifyOrgAccess throws "Not a member" — write access is structurally
 * blocked without any special-casing.
 *
 * State is persisted in sessionStorage so a page refresh keeps the preview
 * session alive, but a new browser tab or logout starts fresh.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImpersonationState {
  token: string;
  orgId: string;
  orgName: string;
}

interface ImpersonationContextValue {
  impersonation: ImpersonationState | null;
  startImpersonation: (state: ImpersonationState) => void;
  stopImpersonation: () => void;
}

// ---------------------------------------------------------------------------
// Storage key
// ---------------------------------------------------------------------------

const SESSION_KEY = "quera-impersonation";

function loadFromSession(): ImpersonationState | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "token" in parsed &&
      "orgId" in parsed &&
      "orgName" in parsed &&
      typeof (parsed as Record<string, unknown>).token === "string" &&
      typeof (parsed as Record<string, unknown>).orgId === "string" &&
      typeof (parsed as Record<string, unknown>).orgName === "string"
    ) {
      return parsed as ImpersonationState;
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

function saveToSession(state: ImpersonationState | null): void {
  try {
    if (state === null) {
      sessionStorage.removeItem(SESSION_KEY);
    } else {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
    }
  } catch {
    // ignore storage errors (e.g. private browsing quotas)
  }
}

// ---------------------------------------------------------------------------
// Context — safe no-op default so useImpersonation() outside the provider
// (e.g. login page, patient portal) returns impersonation: null and never throws.
// ---------------------------------------------------------------------------

const ImpersonationContext = createContext<ImpersonationContextValue>({
  impersonation: null,
  startImpersonation: () => {},
  stopImpersonation: () => {},
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const [impersonation, setImpersonation] = useState<ImpersonationState | null>(
    () => loadFromSession(),
  );

  // Keep sessionStorage in sync whenever state changes.
  useEffect(() => {
    saveToSession(impersonation);
  }, [impersonation]);

  const startImpersonation = useCallback((state: ImpersonationState) => {
    setImpersonation(state);
  }, []);

  const stopImpersonation = useCallback(() => {
    setImpersonation(null);
  }, []);

  return (
    <ImpersonationContext.Provider
      value={{ impersonation, startImpersonation, stopImpersonation }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Access the impersonation context.
 *
 * Safe to call anywhere — the context default value is a no-op with
 * `impersonation: null`, so components outside `<ImpersonationProvider>`
 * (e.g. the login page, the patient portal) see no active impersonation
 * and never throw.
 */
export function useImpersonation(): ImpersonationContextValue {
  return useContext(ImpersonationContext);
}
