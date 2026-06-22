import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Mock document-renderer to avoid loading TipTap's server-side DOM dependency
// (happy-dom), which is not installed. InlineFieldControl does not use any
// exports from document-renderer at runtime; the dependency is type-only here.
vi.mock("./document-renderer", () => ({
  prepareDocumentForInlineForm: vi.fn(() => ""),
}));

import { InlineFieldControl } from "./inline-document-form";
import type { ExtractedFormField } from "./document-renderer";

function makeField(overrides: Partial<ExtractedFormField> = {}): ExtractedFormField {
  return {
    fieldId: "f1",
    fieldType: "text",
    label: "First name",
    options: "",
    required: false,
    placeholder: "",
    filledBy: "client",
    ...overrides,
  };
}

describe("InlineFieldControl", () => {
  describe("standalone text field", () => {
    it("renders the label as a visible question prompt", () => {
      const markup = renderToStaticMarkup(
        <InlineFieldControl
          field={makeField({ label: "Full name" })}
          value=""
          onChange={vi.fn()}
          isStandalone
        />,
      );
      expect(markup).toContain("Full name");
    });

    it("does not show the label as a block prompt when not standalone", () => {
      // When the field is inline inside a sentence the label block is omitted;
      // the label falls back to the input placeholder instead.
      const markup = renderToStaticMarkup(
        <InlineFieldControl
          field={makeField({ label: "Full name" })}
          value=""
          onChange={vi.fn()}
          isStandalone={false}
        />,
      );
      // Block label span has font-weight:500 — must be absent for inline fields
      expect(markup).not.toContain("font-weight:500");
      // Label still surfaces as placeholder text (not as a visible block)
      expect(markup).toContain('placeholder="Full name"');
    });

    it("shows red asterisk inside the label for standalone required fields", () => {
      const markup = renderToStaticMarkup(
        <InlineFieldControl
          field={makeField({ label: "PESEL", required: true })}
          value=""
          onChange={vi.fn()}
          isStandalone
        />,
      );
      // Label must appear
      expect(markup).toContain("PESEL");
      // Red asterisk inline with the label
      expect(markup).toContain('color:#ef4444');
    });

    it("shows inline required asterisk for non-standalone required fields", () => {
      const markup = renderToStaticMarkup(
        <InlineFieldControl
          field={makeField({ label: "PESEL", required: true })}
          value=""
          onChange={vi.fn()}
          isStandalone={false}
        />,
      );
      // Block label span absent (no font-weight:500), but asterisk must appear
      expect(markup).not.toContain("font-weight:500");
      expect(markup).toContain('color:#ef4444');
    });
  });

  describe("standalone select field", () => {
    it("renders the label above the dropdown", () => {
      const markup = renderToStaticMarkup(
        <InlineFieldControl
          field={makeField({ fieldType: "select", label: "Blood type", options: "A,B,AB,O" })}
          value=""
          onChange={vi.fn()}
          isStandalone
        />,
      );
      expect(markup).toContain("Blood type");
    });

    it("renders the select options", () => {
      const markup = renderToStaticMarkup(
        <InlineFieldControl
          field={makeField({ fieldType: "select", label: "Blood type", options: "A,B,AB,O" })}
          value=""
          onChange={vi.fn()}
          isStandalone
        />,
      );
      expect(markup).toContain("<option");
      expect(markup).toContain(">A<");
      expect(markup).toContain(">O<");
    });

    it("does not show label when not standalone", () => {
      const markup = renderToStaticMarkup(
        <InlineFieldControl
          field={makeField({ fieldType: "select", label: "Blood type", options: "A,B" })}
          value=""
          onChange={vi.fn()}
          isStandalone={false}
        />,
      );
      expect(markup).not.toContain("Blood type");
    });
  });

  describe("checkbox field", () => {
    it("always renders the label inline regardless of standalone flag", () => {
      const standaloneMarkup = renderToStaticMarkup(
        <InlineFieldControl
          field={makeField({ fieldType: "checkbox", label: "I agree to terms" })}
          value="false"
          onChange={vi.fn()}
          isStandalone
        />,
      );
      const inlineMarkup = renderToStaticMarkup(
        <InlineFieldControl
          field={makeField({ fieldType: "checkbox", label: "I agree to terms" })}
          value="false"
          onChange={vi.fn()}
          isStandalone={false}
        />,
      );
      expect(standaloneMarkup).toContain("I agree to terms");
      expect(inlineMarkup).toContain("I agree to terms");
    });

    it("renders a checkbox input element", () => {
      const markup = renderToStaticMarkup(
        <InlineFieldControl
          field={makeField({ fieldType: "checkbox", label: "Consent" })}
          value="false"
          onChange={vi.fn()}
        />,
      );
      expect(markup).toContain('type="checkbox"');
    });
  });
});
