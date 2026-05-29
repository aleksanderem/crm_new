import path from "node:path";
import { defineConfig } from "vitest/config";

// Frontend (src/) unit tests. Kept separate from convex/vitest.config.ts so
// neither suite drags in the other's setup files, aliases, or include globs.
// `cd convex && vitest run` pins the test root to convex/, so src/**/*.test.ts
// were silently uncollected before this config existed (#1034).
export default defineConfig({
  resolve: {
    alias: {
      "~": __dirname,
      "@": path.resolve(__dirname, "src"),
      "@cvx": path.resolve(__dirname, "convex"),
    },
  },
  test: {
    root: __dirname,
    include: ["src/**/*.test.ts"],
  },
});
