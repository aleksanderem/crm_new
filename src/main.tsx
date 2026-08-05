import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "@/app";
import { initSentry } from "@/lib/sentry";
import { installGlobalErrorHandlers } from "@/lib/error-reporter";

// Sentry must be initialized before any other code so its SDK-level handlers
// (breadcrumbs, network tracing, etc.) are in place from the very first tick.
// It is a no-op when VITE_SENTRY_DSN is not set.
initSentry();

// Install our own global error handlers after Sentry so both receive events.
installGlobalErrorHandlers();

// Render the app

const rootElement = document.getElementById("root")!;
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
