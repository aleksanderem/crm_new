// ---------------------------------------------------------------------------
// Email Builder — GrapesJS Editor Configuration
// ---------------------------------------------------------------------------
// Builds the EditorConfig object for GrapesJS with MJML plugin,
// merge tags, and themed appearance.
// ---------------------------------------------------------------------------

import type { EditorConfig } from "grapesjs";
import type { MergeTagGroup, EmailBuilderTheme } from "./types";

/**
 * Build GrapesJS EditorConfig.
 *
 * The editor runs in "headless" mode (no built-in panels) because
 * @grapesjs/react custom UI mode renders panels via React providers.
 */
export function buildEditorConfig(opts: {
  theme: EmailBuilderTheme;
  mergeTags: MergeTagGroup[];
  locale: string;
}): EditorConfig {
  const { theme } = opts;

  return {
    // No default container — @grapesjs/react handles mounting
    container: "#gjs-editor-placeholder",

    // Disable built-in panels — we build our own with shadcn/ui
    panels: { defaults: [] },

    // Start with no default content
    fromElement: false,

    // Disable built-in storage (we handle save ourselves)
    storageManager: false,

    // Canvas configuration
    canvas: {
      styles: [
        "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap",
      ],
    },

    // Device manager for responsive preview
    deviceManager: {
      devices: [
        { name: "Desktop", width: "" },
        { name: "Mobile", width: "375px", widthMedia: "480px" },
      ],
    },

    // Style manager sectors
    styleManager: {
      sectors: [
        {
          name: "Dimension",
          open: false,
          buildProps: ["width", "min-height", "padding"],
        },
        {
          name: "Typography",
          open: false,
          buildProps: [
            "font-family",
            "font-size",
            "font-weight",
            "letter-spacing",
            "color",
            "line-height",
            "text-align",
            "text-decoration",
          ],
        },
        {
          name: "Decorations",
          open: false,
          buildProps: [
            "background-color",
            "border-radius",
            "border",
            "box-shadow",
          ],
        },
      ],
    },

    // Block manager categories
    blockManager: {
      custom: true, // We render blocks ourselves via BlocksProvider
    },

    // Editor appearance via CSS variables
    cssIcons: "",
    colorPicker: {
      appendTo: "parent",
      offset: { top: 26, left: -166 },
    },

    // Assign colors from theme (used internally by GrapesJS for some UI)
    protectedCss: `
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: ${theme.fontFamily ?? "Poppins, sans-serif"};
      }
    `,
  };
}
