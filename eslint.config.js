import reactRefresh from "eslint-plugin-react-refresh";
import eslintConfigPrettier from "eslint-config-prettier";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import noProviderAndConsumerHook from "./eslint-rules/no-provider-and-consumer-hook.js";
import noUntranslatedLiteral from "./eslint-rules/no-untranslated-literal.js";

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
      local: {
        rules: {
          "no-provider-and-consumer-hook": noProviderAndConsumerHook,
          "no-untranslated-literal": noUntranslatedLiteral,
        },
      },
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
      "local/no-provider-and-consumer-hook": "error",
    },
  },
  // i18n hygiene: report bare English literals in user-facing positions.
  // Scoped to shared UI primitives (the SidePanel/CommandInput class from
  // #1975 / #1982) — these components render on every screen so a hardcoded
  // default leaks an English string into PL workspaces. Severity is `warn`
  // so it surfaces in PR review without blocking existing accumulated debt.
  // To expand scope later: add more globs to `files` or raise severity.
  {
    files: [
      "src/components/ui/**/*.{ts,tsx}",
      "src/components/crm/side-panel.tsx",
      "src/components/data-table/**/*.{ts,tsx}",
      "src/components/shared/**/*.{ts,tsx}",
    ],
    rules: {
      "local/no-untranslated-literal": "warn",
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
