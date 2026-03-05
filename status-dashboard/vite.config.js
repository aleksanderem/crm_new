import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, dirname } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

export default defineConfig({
  plugins: [
    react(),
    {
      name: "serve-status-json",
      configureServer(server) {
        server.middlewares.use("/status.json", (_req, res) => {
          try {
            const data = readFileSync(resolve(projectRoot, "status.json"), "utf-8");
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-store");
            res.end(data);
          } catch {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: "status.json not found" }));
          }
        });
      },
    },
  ],
  server: { port: 4173 },
});
