/// <reference types="vite/client" />

// Latest committed Supabase migration version, injected by vite.config.ts at
// build time. Used by the boot health check banner (#1576).
declare const __EXPECTED_SCHEMA_VERSION__: string;

declare namespace JSX {
  interface IntrinsicElements {
    "easier-icon": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        name?: string;
        variant?: "stroke" | "solid" | "bulk" | "duotone" | "twotone";
        corners?: "rounded" | "sharp" | "standard";
        size?: number;
        color?: string;
        "stroke-width"?: number;
      },
      HTMLElement
    >;
  }
}
