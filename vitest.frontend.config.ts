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
  // Provide safe placeholder values so that modules which eagerly read
  // import.meta.env.VITE_SUPABASE_* at load time (e.g. src/lib/supabase/client.ts)
  // do not throw during tests that don't actually use Supabase.
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("http://localhost:54321"),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify("test-anon-key-placeholder"),
  },
  test: {
    root: __dirname,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
