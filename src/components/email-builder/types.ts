// ---------------------------------------------------------------------------
// Email Builder — Public Types
// ---------------------------------------------------------------------------
// Self-contained type definitions for the modular GrapesJS email builder.
// No project-specific imports — these types can be used in any React project.
// ---------------------------------------------------------------------------

import type { ProjectData } from "grapesjs";

/** A single merge-tag field within a group. */
export interface MergeTagField {
  key: string;
  label: string;
}

/** A group of merge-tag fields (e.g. "Patient", "Contact"). */
export interface MergeTagGroup {
  key: string;
  label: string;
  fields: MergeTagField[];
}

/** Theme configuration for the email builder. */
export interface EmailBuilderTheme {
  /** Main accent color (buttons, highlights). */
  primaryColor: string;
  /** Editor background. */
  backgroundColor: string;
  /** Panel / surface background. */
  surfaceColor: string;
  /** Border color for panels and inputs. */
  borderColor: string;
  /** Primary text color. */
  textColor: string;
  /** Muted / secondary text color. */
  mutedTextColor: string;
  /** Whether to apply dark mode styles. */
  isDark: boolean;
  /** Font family for the editor chrome (not the email content). */
  fontFamily?: string;
  /** Border radius for UI elements. */
  borderRadius?: string;
}

/** Output returned by getOutput(). */
export interface EmailBuilderOutput {
  /** GrapesJS project JSON (for re-loading the design later). */
  projectData: ProjectData;
  /** Compiled HTML string ready for email sending. */
  html: string;
}

/** Props for the EmailBuilder component. */
export interface EmailBuilderProps {
  /** Initial design to load (from a previous save). */
  initialProjectData?: ProjectData | null;
  /** Merge tag groups available in the editor. */
  mergeTags?: MergeTagGroup[];
  /** Theme overrides. If omitted, reads from host app CSS variables. */
  theme?: Partial<EmailBuilderTheme>;
  /** Editor locale (default: "en"). */
  locale?: string;
  /** Additional CSS class for the root container. */
  className?: string;
  /** Called when the editor is fully ready. */
  onReady?: () => void;
  /** Called on every design change (debounced). */
  onChange?: (output: EmailBuilderOutput) => void;
  /** React node rendered at the top of the left sidebar, above the block palette. */
  sidebarHeader?: React.ReactNode;
  /** When provided, the left sidebar (sidebarHeader + blocks) is portaled into this DOM element
   *  instead of rendering inline. Used to render into the app's Column 2 sidebar slot. */
  sidebarPortalTarget?: HTMLElement | null;
}

/** Imperative handle exposed via React.forwardRef. */
export interface EmailBuilderHandle {
  /** Export the current design + compiled HTML. */
  getOutput: () => Promise<EmailBuilderOutput>;
  /** Load a design into the editor. */
  loadProject: (data: ProjectData) => void;
}
