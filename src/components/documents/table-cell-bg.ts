import { Table } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table";
import { TableHeader } from "@tiptap/extension-table";

export type TableBorderStyle = "all" | "none" | "horizontal" | "outer";

/** Sync custom table attrs to the DOM table element created by TableView. */
function syncTableAttrs(
  node: { attrs: Record<string, unknown> },
  tableEl: HTMLTableElement,
) {
  // border style
  const bs = (node.attrs.borderStyle as string) || "all";
  if (bs !== "all") {
    tableEl.setAttribute("data-border-style", bs);
  } else {
    tableEl.removeAttribute("data-border-style");
  }
  // border color
  const bc = node.attrs.borderColor as string | null;
  if (bc) {
    tableEl.setAttribute("data-border-color", bc);
    tableEl.style.setProperty("--table-border-color", bc);
  } else {
    tableEl.removeAttribute("data-border-color");
    tableEl.style.removeProperty("--table-border-color");
  }
}

/**
 * Extended Table with borderStyle and borderColor attributes.
 * Overrides the NodeView to sync these attributes to the live DOM.
 */
export const TableWithBorders = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      borderStyle: {
        default: "all",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-border-style") || "all",
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.borderStyle || attributes.borderStyle === "all")
            return {};
          return { "data-border-style": attributes.borderStyle };
        },
      },
      borderColor: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-border-color") || null,
        renderHTML: (attributes: Record<string, unknown>) => {
          const result: Record<string, string> = {};
          if (attributes.borderColor) {
            result["data-border-color"] = attributes.borderColor as string;
            result.style = `--table-border-color: ${attributes.borderColor}`;
          }
          return result;
        },
      },
    };
  },

  addNodeView() {
    // Get the parent NodeView constructor (the built-in TableView)
    const parentView = this.parent?.();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!parentView) return (() => ({ dom: document.createElement("div") })) as any;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((...args: Parameters<typeof parentView>) => {
      const view = parentView(...args) as {
        dom: HTMLElement;
        table?: HTMLTableElement;
        contentDOM: HTMLElement;
        update?: (node: any) => boolean;
        ignoreMutation?: (mutation: MutationRecord) => boolean;
      };

      // The TableView wraps table in a div.tableWrapper
      const tableEl = view.dom.querySelector("table") as HTMLTableElement | null;
      if (tableEl) {
        syncTableAttrs(args[0] as unknown as { attrs: Record<string, unknown> }, tableEl);
      }

      // Wrap update to re-sync attrs
      const origUpdate = view.update;
      view.update = (node: any) => {
        const result = origUpdate ? origUpdate.call(view, node) : true;
        if (result && tableEl) {
          syncTableAttrs(node, tableEl);
        }
        return result;
      };

      return view;
    }) as any;
  },
});

/**
 * Extended TableCell with backgroundColor attribute.
 */
export const TableCellBg = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.style.backgroundColor || null,
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.backgroundColor) return {};
          return { style: `background-color: ${attributes.backgroundColor}` };
        },
      },
    };
  },
});

/**
 * Extended TableHeader with backgroundColor attribute.
 */
export const TableHeaderBg = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.style.backgroundColor || null,
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.backgroundColor) return {};
          return { style: `background-color: ${attributes.backgroundColor}` };
        },
      },
    };
  },
});
