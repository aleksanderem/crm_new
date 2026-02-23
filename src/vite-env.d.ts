/// <reference types="vite/client" />

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
