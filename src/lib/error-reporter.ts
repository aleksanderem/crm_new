// Frontend error reporter — sends errors to Sentry AND pushes them into the
// Convex `errorLogs` table so they're visible in /admin/errors.
//
// Usage:
//   import { reportError, installGlobalErrorHandlers } from "@/lib/error-reporter";
//   installGlobalErrorHandlers();          // once, from main.tsx
//   reportError(err, { scope: "manual" }); // anywhere on demand
//
// Failure to report must NEVER bubble — error reporting itself can't break
// the app. We swallow every exception inside this module.
import { ConvexHttpClient } from "convex/browser";
import { api } from "@cvx/_generated/api";
import { Sentry } from "@/lib/sentry";

const ENDPOINT = import.meta.env.VITE_CONVEX_URL as string | undefined;

// One-shot client used only to push error reports. It bypasses the React
// query client because the React tree may itself be broken when an error
// fires (e.g. inside an Error Boundary).
let _client: ConvexHttpClient | null = null;
function client(): ConvexHttpClient | null {
  if (!ENDPOINT) return null;
  if (!_client) _client = new ConvexHttpClient(ENDPOINT);
  return _client;
}

type Source = "convex" | "frontend";
type Level = "error" | "warn";

export type ReportContext = {
  scope?: string;
  fnName?: string;
  level?: Level;
  source?: Source;
  argsJson?: string;
  organizationId?: string;
  requestId?: string;
};

const MAX_STACK = 8000;
const MAX_MESSAGE = 4000;
const MAX_ARGS = 4000;

// Rate limit: drop duplicates of the same error within a short window so a
// runaway loop doesn't write 1000 identical rows.
const recentKeys = new Map<string, number>();
const DEDUP_WINDOW_MS = 5000;

function isDuplicate(key: string): boolean {
  const now = Date.now();
  // GC old entries every call so the map stays small
  for (const [k, t] of recentKeys) {
    if (now - t > DEDUP_WINDOW_MS) recentKeys.delete(k);
  }
  const prev = recentKeys.get(key);
  recentKeys.set(key, now);
  return prev !== undefined && now - prev < DEDUP_WINDOW_MS;
}

function asMessage(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack };
  }
  if (typeof err === "string") return { message: err };
  try {
    return { message: JSON.stringify(err) };
  } catch {
    return { message: String(err) };
  }
}

export async function reportError(
  err: unknown,
  ctx: ReportContext = {},
): Promise<void> {
  try {
    const { message, stack } = asMessage(err);
    const dedupKey = `${ctx.scope ?? ""}|${ctx.fnName ?? ""}|${message}`;
    if (isDuplicate(dedupKey)) return;

    // Forward to Sentry first (no-op when DSN is not configured).
    try {
      const errObj =
        err instanceof Error ? err : new Error(message);
      Sentry.withScope((scope) => {
        if (ctx.scope) scope.setTag("app.scope", ctx.scope);
        if (ctx.fnName) scope.setTag("app.fnName", ctx.fnName);
        if (ctx.organizationId)
          scope.setTag("app.organizationId", ctx.organizationId);
        if (ctx.source) scope.setTag("app.source", ctx.source);
        if (ctx.level === "warn") {
          scope.setLevel("warning");
        }
        Sentry.captureException(errObj);
      });
    } catch {
      // Sentry errors must not propagate.
    }

    const c = client();
    if (!c) return;

    await c.mutation(api.errorLogs.record, {
      source: ctx.source ?? "frontend",
      scope: ctx.scope,
      fnName: ctx.fnName,
      level: ctx.level ?? "error",
      message: message.slice(0, MAX_MESSAGE),
      stack: stack?.slice(0, MAX_STACK),
      url: typeof window !== "undefined" ? window.location.href : undefined,
      userAgent:
        typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      argsJson: ctx.argsJson?.slice(0, MAX_ARGS),
      requestId: ctx.requestId,
      organizationId: ctx.organizationId as never,
    });
  } catch {
    // Logger errors are not real errors.
  }
}

// Detect "stale chunk" errors that happen after a deploy regenerates hashed
// asset filenames: the user's cached index.html references a lazy chunk that
// no longer exists, so the dynamic import 404s. Issue #1368.
export function isChunkLoadError(err: unknown): boolean {
  const msg =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg)
  );
}

// Reload when a stale chunk is detected, so the browser fetches the new
// index.html (and the chunk hashes it references). A time-boxed sessionStorage
// marker guards against an infinite reload loop if the failure persists
// immediately after reload, while still allowing recovery from later deploys
// in long-running tab sessions (e.g. active testing on the dev deployment).
// Issue #1536 — the original one-shot guard from #1368 left users stuck on
// the error UI after a second deploy in the same session.
const CHUNK_RELOAD_KEY = "chunk-reload-attempted-v1";
const CHUNK_RELOAD_COOLDOWN_MS = 30_000;
export function maybeReloadForStaleChunk(err: unknown): boolean {
  if (typeof window === "undefined") return false;
  if (!isChunkLoadError(err)) return false;
  try {
    const prev = sessionStorage.getItem(CHUNK_RELOAD_KEY);
    if (prev) {
      const ts = Number.parseInt(prev, 10);
      // If we already reloaded recently and the chunk error came back inside
      // the cooldown window, assume the reload didn't fix it (CDN still
      // serving a stale index.html, missing chunk on server, etc.) and stop
      // looping. Outside the cooldown, treat this as a fresh stale-chunk
      // situation from a later deploy and reload again.
      if (Number.isFinite(ts) && Date.now() - ts < CHUNK_RELOAD_COOLDOWN_MS) {
        return false;
      }
    }
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    // sessionStorage may be unavailable (private mode, etc.) — proceed anyway.
  }
  window.location.reload();
  return true;
}

let installed = false;
export function installGlobalErrorHandlers(): void {
  if (installed) return;
  installed = true;
  if (typeof window === "undefined") return;

  // Uncaught synchronous errors
  window.addEventListener("error", (event) => {
    const err = event.error ?? new Error(event.message || "window.onerror");
    if (maybeReloadForStaleChunk(err)) return;
    reportError(err, {
      scope: "window.onerror",
      fnName: event.filename
        ? `${event.filename}:${event.lineno}:${event.colno}`
        : undefined,
    });
  });

  // Unhandled promise rejections (most async failures land here)
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    if (maybeReloadForStaleChunk(reason)) return;
    reportError(reason, { scope: "unhandledrejection" });
  });
}
