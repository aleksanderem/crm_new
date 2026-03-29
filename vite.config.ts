import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import path from "path";

export default defineConfig({
  plugins: [tailwindcss(), TanStackRouterVite(), viteReact()],
  server: {
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
  optimizeDeps: {
    include: ["@pdfme/ui", "@pdfme/schemas", "@pdfme/common", "@pdfme/generator"],
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
