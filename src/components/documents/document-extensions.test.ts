import { describe, expect, it } from "vitest";

import { editorExtensions } from "./document-template-editor";
import { renderExtensions } from "./document-renderer";

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
