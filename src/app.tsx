import { ConvexReactClient } from "convex/react";
import { RouterProvider } from "@tanstack/react-router";
import { ConvexQueryClient } from "@convex-dev/react-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { router } from "@/router";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { Sentry } from "@/lib/sentry";
import "@/i18n";

// Convex client
const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

const convexQueryClient = new ConvexQueryClient(convex);
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryKeyHashFn: convexQueryClient.hashFn(),
      queryFn: convexQueryClient.queryFn(),
    },
  },
});

convexQueryClient.connect(queryClient);

function InnerApp() {
  return <RouterProvider router={router} context={{ queryClient }} />;
}

const helmetContext = {};

export default function App() {
  return (
    <Sentry.ErrorBoundary fallback={<SentryFallback />}>
      <HelmetProvider context={helmetContext}>
        <ConvexAuthProvider client={convex}>
          <QueryClientProvider client={queryClient}>
            <InnerApp />
          </QueryClientProvider>
        </ConvexAuthProvider>
      </HelmetProvider>
    </Sentry.ErrorBoundary>
  );
}

function SentryFallback() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "12px",
        fontFamily: "system-ui, sans-serif",
        padding: "24px",
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
        Something went wrong
      </h1>
      <p style={{ color: "#666", margin: 0, maxWidth: "420px" }}>
        An unexpected error occurred. The error has been reported automatically.
        Please refresh the page to try again.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          marginTop: "8px",
          padding: "8px 20px",
          borderRadius: "6px",
          border: "1px solid #d1d5db",
          background: "#fff",
          cursor: "pointer",
          fontSize: "0.875rem",
        }}
      >
        Refresh
      </button>
    </div>
  );
}
