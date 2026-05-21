import path from "node:path";
import { defineConfig, mergeConfig } from "vitest/config";
import convexConfig from "./convex/vitest.config";

// Pin test.root to ./convex so include/setupFiles paths in convex/vitest.config.ts
// resolve the same way as `cd convex && vitest`.
export default mergeConfig(
  convexConfig,
  defineConfig({
    test: {
      root: path.resolve(__dirname, "convex"),
    },
  }),
);
