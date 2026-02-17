import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@cvx": path.resolve(__dirname),
    },
  },
  test: {
    server: { deps: { inline: ["convex-test"] } },
  },
});
