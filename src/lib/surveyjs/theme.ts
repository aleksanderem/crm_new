import type { ITheme } from "survey-core";

/**
 * Reads a CSS variable value from the document root.
 * Returns the fallback if running outside a browser (SSR) or if the variable is unset.
 */
function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  );
}

/**
 * Builds a SurveyJS theme that maps to the app's CSS custom properties,
 * automatically adapting to light/dark mode since CSS variables resolve at read time.
 */
export function createAppTheme(): ITheme {
  const primary = cssVar("--primary", "oklch(0.54 0.25 272.36)");
  const primaryForeground = cssVar("--primary-foreground", "oklch(1.00 0 0)");
  const background = cssVar("--background", "oklch(0.99 0 0)");
  const foreground = cssVar("--foreground", "oklch(0.23 0.01 255.60)");
  const border = cssVar("--border", "oklch(0.93 0.01 264.60)");
  const muted = cssVar("--muted", "oklch(0.97 0.00 264.70)");
  const mutedForeground = cssVar(
    "--muted-foreground",
    "oklch(0.55 0.02 264.37)",
  );
  const destructive = cssVar("--destructive", "oklch(0.63 0.19 23.03)");
  const ring = cssVar("--ring", "oklch(0.73 0.13 289.02)");
  const radius = cssVar("--radius", "0.775rem");

  return {
    cssVariables: {
      "--sjs-primary-backcolor": primary,
      "--sjs-primary-backcolor-light": muted,
      "--sjs-primary-backcolor-dark": primary,
      "--sjs-primary-forecolor": primaryForeground,
      "--sjs-primary-forecolor-light": mutedForeground,

      "--sjs-general-backcolor": background,
      "--sjs-general-backcolor-dim": muted,
      "--sjs-general-backcolor-dim-light": muted,
      "--sjs-general-forecolor": foreground,
      "--sjs-general-forecolor-light": mutedForeground,
      "--sjs-general-dim-forecolor": foreground,
      "--sjs-general-dim-forecolor-light": mutedForeground,

      "--sjs-border-default": border,
      "--sjs-border-light": border,
      "--sjs-border-inside": border,

      "--sjs-shadow-small": "none",
      "--sjs-shadow-inner": "none",

      "--sjs-corner-radius": radius,
      "--sjs-base-unit": "8px",
      "--sjs-font-size": "14px",

      "--sjs-error-forecolor": destructive,
      "--sjs-focus-border": ring,
    },
    isPanelless: true,
  };
}
