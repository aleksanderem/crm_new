import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
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

// Upload source maps to Sentry at build time so production stack traces show
// original TypeScript source instead of minified bundles. This requires
// SENTRY_AUTH_TOKEN (generate at sentry.io → Settings → Auth Tokens).
// When the token is absent (local dev, preview deploys) the plugin is omitted
// and source-map upload is silently skipped — no build error.
const sentryPlugin =
  process.env.SENTRY_AUTH_TOKEN
    ? sentryVitePlugin({
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
        sourcemaps: { filesToDeleteAfterUpload: ["dist/**/*.map"] },
        release: { inject: true },
      })
    : null;

export default defineConfig({
  define: {
    __EXPECTED_SCHEMA_VERSION__: JSON.stringify(latestMigrationVersion()),
  },
  plugins: [
    tailwindcss(),
    TanStackRouterVite(),
    viteReact(),
    ...(sentryPlugin ? [sentryPlugin] : []),
  ],
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
    // Emit source maps so Sentry can upload them when SENTRY_AUTH_TOKEN is set.
    // The Sentry plugin deletes .map files from dist after upload so they never
    // reach end-users; without the token the maps are simply not produced.
    sourcemap: !!process.env.SENTRY_AUTH_TOKEN,
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
