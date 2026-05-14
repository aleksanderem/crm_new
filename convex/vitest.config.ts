import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@cvx": path.resolve(__dirname),
    },
  },
  test: {
    include: ["**/*.test.ts", "../tests/convex/**/*.test.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});
