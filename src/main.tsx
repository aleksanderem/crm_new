import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "@/app";
import { installGlobalErrorHandlers } from "@/lib/error-reporter";

// Install global error handlers as early as possible so we catch errors
// that happen during the initial React render and async work after mount.
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
