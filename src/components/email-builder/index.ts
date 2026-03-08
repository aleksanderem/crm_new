// ---------------------------------------------------------------------------
// Email Builder — Public API
// ---------------------------------------------------------------------------
// Barrel export for the GrapesJS Studio SDK email builder.
// Import everything from "@/components/email-builder".
// ---------------------------------------------------------------------------

// EmailBuilder is intentionally NOT re-exported here to preserve
// code-splitting via lazy.tsx. Use EmailBuilderLazy instead, or
// import EmailBuilder directly from "./email-builder" if you need it.
export { EmailBuilderLazy } from "./lazy";
export type {
  EmailBuilderProps,
  EmailBuilderHandle,
  EmailBuilderOutput,
  MergeTagGroup,
  MergeTagField,
} from "./types";
