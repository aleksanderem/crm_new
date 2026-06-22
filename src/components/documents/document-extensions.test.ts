import { describe, expect, it, vi } from "vitest";

// @tiptap/html's server bundle statically imports 'happy-dom' (not installed).
// Mock the module so that importing document-renderer.tsx doesn't fail at
// module-load time in the node test environment. None of the tests here call
// generateHTML; they only inspect extension metadata and renderHTML output.
vi.mock("@tiptap/html", () => ({
  generateHTML: vi.fn(),
}));

import { editorExtensions } from "./document-template-editor";
import { renderExtensions } from "./document-renderer";
import { FormFieldNode } from "./form-field-node";

// Guards against the regression fixed in #1907 / #1914: the renderer extension
// list silently drifted from the editor's, so saved templates containing
// columnLayout/column or componentBlock nodes threw "Unknown node type" inside
// generateHTML and surfaced as the route error boundary.
const namesOf = (extensions: ReadonlyArray<{ name: string }>) =>
  extensions.map((extension) => extension.name);

describe("document template / renderer extensions", () => {
  it("editor and renderer expose the same extension names in the same order", () => {
    expect(namesOf(renderExtensions)).toEqual(namesOf(editorExtensions));
  });

  it("editor extension name snapshot stays stable", () => {
    expect(namesOf(editorExtensions)).toMatchInlineSnapshot(`
      [
        "starterKit",
        "underline",
        "horizontalRule",
        "textAlign",
        "table",
        "tableRow",
        "tableHeader",
        "tableCell",
        "image",
        "pageBreak",
        "formField",
        "htmlBlock",
        "componentBlock",
        "columnLayout",
        "column",
        "variableMentionAt",
        "variableMentionCurly",
      ]
    `);
  });
});

// ---------------------------------------------------------------------------
// FormFieldNode.renderHTML — data-filled-by attribute (regression guard)
//
// prepareDocumentForInlineForm relies on the CSS attribute selector
// [data-form-field][data-filled-by='client'] to locate client-facing field
// spans in the rendered HTML and replace them with interactive portals. If
// renderHTML ever stops emitting data-filled-by, all client fields silently
// vanish from the inline form with no runtime error (#2006).
//
// We call renderHTML directly and inspect the returned TipTap spec tuple to
// avoid requiring a browser DOM (generateHTML needs happy-dom in node).
// ---------------------------------------------------------------------------

describe("FormFieldNode.renderHTML", () => {
  // Invoke the renderHTML config method directly with synthetic HTMLAttributes.
  // TipTap passes mergeAttributes-resolved attrs here; for our purposes we can
  // pass the raw attrs since mergeAttributes is a plain object merge.
  const callRenderHTML = (
    filledBy: "client" | "employee",
    fieldId = "field_1",
  ) => {
    const renderHTML = FormFieldNode.config.renderHTML!;
    return renderHTML.call(
      { options: FormFieldNode.config } as never,
      {
        HTMLAttributes: {
          fieldId,
          fieldType: "text",
          label: "Test",
          options: "",
          required: false,
          placeholder: "",
          filledBy,
        },
        node: {} as never,
      },
    );
  };

  it("emits data-filled-by='client' in the attribute tuple for a client field", () => {
    const [, attrs] = callRenderHTML("client") as [string, Record<string, string>, string];
    expect(attrs["data-filled-by"]).toBe("client");
  });

  it("emits data-form-field with the field ID", () => {
    const [, attrs] = callRenderHTML("client", "sig_1") as [string, Record<string, string>, string];
    expect(attrs["data-form-field"]).toBe("sig_1");
  });

  it("emits data-filled-by='employee' for an employee field", () => {
    const [, attrs] = callRenderHTML("employee") as [string, Record<string, string>, string];
    expect(attrs["data-filled-by"]).toBe("employee");
  });

  it("falls back to 'employee' when filledBy is absent", () => {
    const renderHTML = FormFieldNode.config.renderHTML!;
    const [, attrs] = renderHTML.call(
      { options: FormFieldNode.config } as never,
      {
        HTMLAttributes: { fieldId: "x", fieldType: "text", label: "", options: "", required: false, placeholder: "" },
        node: {} as never,
      },
    ) as [string, Record<string, string>, string];
    expect(attrs["data-filled-by"]).toBe("employee");
  });
});
