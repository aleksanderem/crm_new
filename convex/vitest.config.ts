import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@cvx": path.resolve(__dirname),
      "~": path.resolve(__dirname, ".."),
    },
  },
  test: {
    include: ["**/*.test.ts", "../tests/convex/**/*.test.ts"],
    setupFiles: ["../tests/convex/_setup.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});
