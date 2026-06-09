import { Node, mergeAttributes } from "@tiptap/core";
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  NodeViewContent,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { cn } from "@/lib/utils";
import { GripVertical, Copy, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

// ---------------------------------------------------------------------------
// Column node — editable cell inside a column layout
// ---------------------------------------------------------------------------

export const ColumnNode = Node.create({
  name: "column",
  group: "column",
  content: "block+",
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-column="true"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-column": "true",
        class: "column-cell",
      }),
      0,
    ];
  },
});

// ---------------------------------------------------------------------------
// Column Layout NodeView — grid with toolbar controls
// ---------------------------------------------------------------------------

function ColumnLayoutNodeView({
  node,
  selected,
  editor,
  deleteNode,
}: ReactNodeViewProps) {
  const { t } = useTranslation();
  const columns = (node.attrs.columns ?? 2) as number;

  const handleDuplicate = () => {
    editor
      .chain()
      .focus()
      .command(({ tr, dispatch }) => {
        if (!dispatch) return false;
        let nodePos: number | null = null;
        tr.doc.descendants((n, p) => {
          if (nodePos !== null) return false;
          if (n === node) {
            nodePos = p;
            return false;
          }
        });
        if (nodePos === null) return false;

        const copy = node.copy(node.content);
        tr.insert(nodePos + node.nodeSize, copy);
        return true;
      })
      .run();
  };

  return (
    <NodeViewWrapper
      className={cn("group/columns my-3", selected && "ring-2 ring-primary rounded-md")}
      data-column-layout={columns}
    >
      {/* Toolbar — visible on hover */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover/columns:opacity-100 transition-opacity mb-1">
        <button
          type="button"
          className="flex h-6 w-6 cursor-grab items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 active:cursor-grabbing"
          contentEditable={false}
          draggable
          data-drag-handle=""
          title={t("documentsEditor.column.drag")}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <span className="text-[10px] text-gray-400 select-none" contentEditable={false}>
          {columns === 1 ? "1 kolumna" : `${columns} kolumny`}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          contentEditable={false}
          onClick={handleDuplicate}
          title={t("documentsEditor.column.duplicateSection")}
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-500"
          contentEditable={false}
          onClick={deleteNode}
          title={t("documentsEditor.column.deleteSection")}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Grid content — NodeViewContent becomes the grid container */}
      <NodeViewContent
        className={cn(
          "rounded-md border border-dashed border-gray-300 p-3",
          // ProseMirror inserts an extra wrapper div between NodeViewContent
          // and the actual column nodes. Apply grid to that wrapper via >div.
          columns >= 2 && "[&>div]:grid [&>div]:gap-4",
          columns === 2 && "[&>div]:grid-cols-2",
          columns === 3 && "[&>div]:grid-cols-3",
          columns === 4 && "[&>div]:grid-cols-4",
          "[&_.column-cell]:min-h-[3rem] [&_.column-cell]:rounded [&_.column-cell]:border [&_.column-cell]:border-dashed [&_.column-cell]:border-gray-200 [&_.column-cell]:p-2",
        )}
      />
    </NodeViewWrapper>
  );
}

// ---------------------------------------------------------------------------
// Column Layout TipTap extension
// ---------------------------------------------------------------------------

export const ColumnLayoutNode = Node.create({
  name: "columnLayout",
  group: "block",
  content: "column+",
  defining: true,
  draggable: true,

  addAttributes() {
    return {
      columns: { default: 2 },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-column-layout]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const cols = HTMLAttributes.columns ?? 2;
    return [
      "div",
      mergeAttributes(
        {},
        {
          "data-column-layout": cols,
          style: `display:grid;grid-template-columns:repeat(${cols},1fr);gap:1rem`,
        },
      ),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ColumnLayoutNodeView);
  },

  addCommands() {
    return {
      insertColumnLayout:
        (columns: number) =>
        ({ chain }) => {
          const columnNodes = Array.from({ length: columns }, () => ({
            type: "column",
            content: [{ type: "paragraph" }],
          }));

          return chain()
            .insertContent({
              type: this.name,
              attrs: { columns },
              content: columnNodes,
            })
            .run();
        },
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    columnLayout: {
      insertColumnLayout: (columns: number) => ReturnType;
    };
  }
}
