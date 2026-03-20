import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { HeroUIProvider } from "@heroui/system";
import "./index.css";
import App from "@/app";

// Render the app

const rootElement = document.getElementById("root")!;
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <HeroUIProvider>
        <App />
      </HeroUIProvider>
    </StrictMode>,
  );
}
