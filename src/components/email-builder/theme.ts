// ---------------------------------------------------------------------------
// Email Builder — Theme utilities
// ---------------------------------------------------------------------------
// Builds GrapesJS CSS variable overrides from EmailBuilderTheme.
// Reads host app CSS variables when no explicit theme is provided.
// ---------------------------------------------------------------------------

import type { EmailBuilderTheme } from "./types";

/** Detect dark mode from the host document. */
export function isDarkMode(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

/**
 * Read a CSS variable value from :root.
 * Returns empty string if not available (SSR, missing var).
 */
function getCssVar(name: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

/** Resolve oklch(...) to a hex-ish fallback by reading computed style. */
function resolveColor(cssVarName: string, fallback: string): string {
  const v = getCssVar(cssVarName);
  if (!v) return fallback;
  // If the value starts with oklch, we need to resolve it through the browser.
  // Create a temporary element, set the color, and read the computed value.
  if (v.startsWith("oklch")) {
    const el = document.createElement("div");
    el.style.color = v;
    document.body.appendChild(el);
    const resolved = getComputedStyle(el).color;
    document.body.removeChild(el);
    return resolved;
  }
  return v;
}

/** Default light theme. */
const LIGHT_DEFAULTS: EmailBuilderTheme = {
  primaryColor: "#464ffc",
  backgroundColor: "#f5f5f5",
  surfaceColor: "#ffffff",
  borderColor: "#e4e8ef",
  textColor: "#1a1d22",
  mutedTextColor: "#6c727e",
  isDark: false,
  fontFamily: "Poppins, sans-serif",
  borderRadius: "8px",
};

/** Default dark theme. */
const DARK_DEFAULTS: EmailBuilderTheme = {
  primaryColor: "#8b7bef",
  backgroundColor: "#1e1b2e",
  surfaceColor: "#2a2740",
  borderColor: "#3d3757",
  textColor: "#f4f4f6",
  mutedTextColor: "#a8a4b5",
  isDark: true,
  fontFamily: "Poppins, sans-serif",
  borderRadius: "8px",
};

/**
 * Build a complete theme by merging:
 * 1. Defaults (light or dark based on host)
 * 2. Host CSS variables (if available)
 * 3. Explicit overrides from props
 */
export function resolveTheme(
  overrides?: Partial<EmailBuilderTheme>,
): EmailBuilderTheme {
  const dark = overrides?.isDark ?? isDarkMode();
  const defaults = dark ? DARK_DEFAULTS : LIGHT_DEFAULTS;

  // Try to read host CSS variables for tighter integration
  const fromHost: Partial<EmailBuilderTheme> = {};
  const bg = resolveColor("--background", "");
  if (bg) fromHost.backgroundColor = bg;
  const surface = resolveColor("--card", "");
  if (surface) fromHost.surfaceColor = surface;
  const border = resolveColor("--border", "");
  if (border) fromHost.borderColor = border;
  const text = resolveColor("--foreground", "");
  if (text) fromHost.textColor = text;
  const muted = resolveColor("--muted-foreground", "");
  if (muted) fromHost.mutedTextColor = muted;

  return { ...defaults, ...fromHost, isDark: dark, ...overrides };
}

/**
 * Generate CSS variable declarations for GrapesJS theming.
 * These are applied to the editor container element.
 */
export function buildGjsCssVars(theme: EmailBuilderTheme): string {
  return `
    --gjs-primary-color: ${theme.primaryColor};
    --gjs-secondary-color: ${theme.surfaceColor};
    --gjs-tertiary-color: ${theme.borderColor};
    --gjs-quaternary-color: ${theme.backgroundColor};
    --gjs-font-color: ${theme.textColor};
    --gjs-font-color2: ${theme.mutedTextColor};
    --gjs-main-color: ${theme.primaryColor};
    --gjs-highlight-color: ${theme.primaryColor};
    --gjs-font-family: ${theme.fontFamily ?? "Poppins, sans-serif"};
  `.trim();
}
