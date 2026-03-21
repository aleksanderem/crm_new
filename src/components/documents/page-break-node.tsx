import { Node, mergeAttributes } from "@tiptap/core";

/**
 * Custom TipTap node for page breaks in document templates.
 * Renders as a visual dashed separator in the editor with a label,
 * and as `page-break-after: always` in print/PDF output.
 */
export const PageBreakNode = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,

  parseHTML() {
    return [{ tag: 'div[data-page-break="true"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-page-break": "true",
        style: [
          "page-break-after: always",
          "display: flex",
          "align-items: center",
          "gap: 12px",
          "margin: 24px 0",
          "user-select: none",
          "cursor: default",
        ].join(";"),
      }),
      [
        "span",
        {
          style:
            "flex: 1; border-top: 2px dashed #d1d5db; display: block;",
        },
      ],
      [
        "span",
        {
          style:
            "font-size: 11px; color: #9ca3af; white-space: nowrap; text-transform: uppercase; letter-spacing: 0.05em;",
          contenteditable: "false",
        },
        "↓ podział strony ↓",
      ],
      [
        "span",
        {
          style:
            "flex: 1; border-top: 2px dashed #d1d5db; display: block;",
        },
      ],
    ];
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ chain }) => {
          return chain()
            .insertContent({ type: this.name })
            .run();
        },
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageBreak: {
      setPageBreak: () => ReturnType;
    };
  }
}
