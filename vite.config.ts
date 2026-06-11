import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import path from "path";
import { readdirSync } from "node:fs";

// Latest committed migration version (e.g. "00012"), read from supabase/migrations/
// at config load time. The frontend boot health check (#1576) compares this against
// the version returned by public.app_schema_version() to detect a stale schema.
function latestMigrationVersion(): string {
  const dir = path.resolve(__dirname, "./supabase/migrations");
  const versions = readdirSync(dir)
    .map((f) => /^(\d+)_.+\.sql$/.exec(f)?.[1])
    .filter((v): v is string => !!v)
    .sort();
  return versions.at(-1) ?? "";
}

export default defineConfig({
  define: {
    __EXPECTED_SCHEMA_VERSION__: JSON.stringify(latestMigrationVersion()),
  },
  plugins: [tailwindcss(), TanStackRouterVite(), viteReact()],
  server: {
    host: true,
    watch: {
      ignored: ["**/.bg-shell/**", "**/.gsd/**"],
    },
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "~": __dirname,
      "@": path.resolve(__dirname, "./src"),
      "@cvx": path.resolve(__dirname, "./convex"),
      "@untitled/base": path.resolve(__dirname, "./src/components/base"),
      "@untitled/app": path.resolve(__dirname, "./src/components/application"),
      "@untitled/foundations": path.resolve(__dirname, "./src/components/foundations"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-charts": ["recharts"],
          "vendor-react": ["react", "react-dom"],
          "vendor-convex": ["convex", "@convex-dev/react-query"],
        },
      },
    },
  },
});
