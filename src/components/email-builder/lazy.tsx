// ---------------------------------------------------------------------------
// Email Builder — Lazy Loading Wrapper
// ---------------------------------------------------------------------------
// Use this instead of importing EmailBuilder directly to ensure
// GrapesJS (~600KB gzipped) is only loaded when needed.
// ---------------------------------------------------------------------------

import { lazy, Suspense, forwardRef } from "react";
import type { EmailBuilderProps, EmailBuilderHandle } from "./types";

const LazyEmailBuilder = lazy(() =>
  import("./email-builder").then((m) => ({ default: m.EmailBuilder })),
);

/**
 * Lazy-loaded EmailBuilder with Suspense.
 * Drop-in replacement for EmailBuilder with automatic code splitting.
 */
export const EmailBuilderLazy = forwardRef<
  EmailBuilderHandle,
  EmailBuilderProps & { fallback?: React.ReactNode }
>(function EmailBuilderLazy({ fallback, ...props }, ref) {
  return (
    <Suspense
      fallback={
        fallback ?? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--muted-foreground, #6c727e)",
              fontSize: "14px",
            }}
          >
            Loading editor...
          </div>
        )
      }
    >
      <LazyEmailBuilder ref={ref} {...props} />
    </Suspense>
  );
});
