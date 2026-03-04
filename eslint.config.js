import reactRefresh from "eslint-plugin-react-refresh";
import eslintConfigPrettier from "eslint-config-prettier";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

// Sanitize globals keys (some versions have trailing whitespace)
const browserGlobals = Object.fromEntries(
  Object.entries(globals.browser).map(([k, v]) => [k.trim(), v])
);

export default tseslint.config(
  // Global ignores (config object with ONLY ignores)
  {
    ignores: [
      "dist/",
      "status-dashboard/",
      "concord-research/",
      "scripts/",
      "docs/runtime-e2e/",
      "convex/_generated/",
      "e2e/",
      ".eslintrc.cjs",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...browserGlobals },
    },
    plugins: {
      "react-refresh": reactRefresh,
    },
    rules: {
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-empty-interface": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },
  // Convex backend files need Node.js globals
  {
    files: ["convex/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  eslintConfigPrettier,
);
