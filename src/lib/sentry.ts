// Sentry error-monitoring initializer.
//
// Call initSentry() as early as possible in main.tsx — before ReactDOM.render
// and before installGlobalErrorHandlers() — so Sentry's own SDK handlers
// are registered first and can enrich events with release / environment info.
//
// If VITE_SENTRY_DSN is empty or missing (local dev, test, CI) every Sentry
// call below is a no-op thanks to the early return. No errors, no network
// requests, no overhead.
import * as Sentry from "@sentry/react";

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

export function initSentry(): void {
  if (!DSN) return;

  Sentry.init({
    dsn: DSN,
    // Vite bakes these in at build time via define / import.meta.env
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_RELEASE ?? undefined,

    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    // 10 % of transactions sampled for performance monitoring.
    // Raise to 1.0 during debugging; lower to 0 to disable perf entirely.
    tracesSampleRate: 0.1,

    // 10 % of sessions captured for Session Replay (errors always captured).
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

// Re-export the parts of the Sentry API that error-reporter.ts uses, so
// import sites don't need to import @sentry/react directly.
export { Sentry };
