// @ts-nocheck — tippy.js / @tiptap/suggestion lack complete type defs
import {
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import Mention from "@tiptap/extension-mention";
import tippy, { Instance as TippyInstance } from "tippy.js";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TemplateField {
  fieldKey: string;
  label: string;
  type: string;
}

export interface DocumentTemplateEditorHandle {
  insertField: (fieldKey: string, label: string) => void;
  getHTML: () => string | undefined;
}

export interface DocumentTemplateEditorProps {
  content: string;
  onChange: (html: string) => void;
  fields: TemplateField[];
  onInsertFieldRequest?: () => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Field-placeholder Mention extension
// ---------------------------------------------------------------------------

/**
 * Fuzzy-match scoring identical to gabinet variable-mention.
 */
function fuzzyScore(value: string, query: string) {
  if (!query) return 1;
  const v = value.toLowerCase();
  const q = query.toLowerCase();
  if (v.includes(q)) return 2;

  let i = 0;
  for (const ch of v) {
    if (ch === q[i]) i += 1;
    if (i === q.length) return 1;
  }
  return 0;
}

function findFields(fields: TemplateField[], query: string) {
  return fields
    .map((field) => {
      const searchable = [field.fieldKey, field.label, field.type].join(" ");
      return { field, score: fuzzyScore(searchable, query) };
    })
    .filter((row) => row.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.field.fieldKey.localeCompare(b.field.fieldKey)
    )
    .map((row) => row.field)
    .slice(0, 10);
}

/**
 * Build the tippy-based suggestion renderer.
 *
 * Uses imperative DOM construction (same pattern as the gabinet editor) so we
 * don't need a React portal.
 */
function createFieldSuggestionRenderer() {
  return () => {
    let popup: TippyInstance[] = [];
    let container: HTMLDivElement | null = null;
    let selectedIndex = 0;

    const render = (props: any) => {
      if (!container) return;
      const items = props.items as TemplateField[];

      container.innerHTML = "";
      container.className =
        "z-50 max-h-72 min-w-[320px] overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md";

      if (items.length === 0) {
        const empty = document.createElement("div");
        empty.className = "px-2 py-1.5 text-sm text-muted-foreground";
        empty.textContent = "No matching fields";
        container.appendChild(empty);
        return;
      }

      items.forEach((item, idx) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className =
          "flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-accent";
        if (idx === selectedIndex) row.classList.add("bg-accent");
        row.onclick = () =>
          props.command({ id: item.fieldKey, label: item.label });
        row.innerHTML = `<span>${item.label}</span><code class="text-xs text-muted-foreground">{{field:${item.fieldKey}}}</code>`;
        container!.appendChild(row);
      });
    };

    return {
      onStart: (props: any) => {
        container = document.createElement("div");
        selectedIndex = 0;
        render(props);

        popup = tippy("body", {
          getReferenceClientRect: props.clientRect,
          appendTo: () => document.body,
          content: container,
          showOnCreate: true,
          interactive: true,
          trigger: "manual",
          placement: "bottom-start",
        });
      },
      onUpdate(props: any) {
        selectedIndex = 0;
        render(props);
        popup[0]?.setProps({ getReferenceClientRect: props.clientRect });
      },
      onKeyDown(props: any) {
        if (props.event.key === "Escape") {
          popup[0]?.hide();
          return true;
        }

        const count = (props.items as TemplateField[]).length;
        if (!count) return false;

        if (props.event.key === "ArrowUp") {
          selectedIndex = (selectedIndex + count - 1) % count;
          render(props);
          return true;
        }
        if (props.event.key === "ArrowDown") {
          selectedIndex = (selectedIndex + 1) % count;
          render(props);
          return true;
        }
        if (props.event.key === "Enter") {
          const item = props.items[selectedIndex];
          props.command({ id: item.fieldKey, label: item.label });
          return true;
        }

        return false;
      },
      onExit() {
        popup[0]?.destroy();
        popup = [];
        container = null;
      },
    };
  };
}

/**
 * Build a Mention extension configured for `{{` trigger that outputs
 * `{{field:fieldKey}}` placeholders and renders coloured inline badges.
 */
function createFieldMention(fieldsRef: React.RefObject<TemplateField[]>) {
  return Mention.extend({ name: "fieldPlaceholder" }).configure({
    renderHTML: ({ node }: any) => [
      "span",
      {
        class:
          "inline-flex items-center rounded bg-primary/15 px-1.5 py-0.5 font-mono text-xs text-primary border border-primary/25",
        "data-field": node.attrs.id,
        contenteditable: "false",
      },
      node.attrs.label || `{{field:${node.attrs.id}}}`,
    ],
    renderText: ({ node }: any) => `{{field:${node.attrs.id}}}`,
    deleteTriggerWithBackspace: true,
    HTMLAttributes: { class: "field-placeholder-chip" },
    suggestion: {
      char: "{{",
      items: ({ query }: { query: string }) =>
        findFields(fieldsRef.current ?? [], query),
      command: ({ editor, range, props }: any) => {
        editor
          .chain()
          .focus()
          .insertContentAt({ from: range.from, to: range.to }, [
            { type: "fieldPlaceholder", attrs: props },
            { type: "text", text: " " },
          ])
          .run();
      },
      render: createFieldSuggestionRenderer(),
    },
  });
}

// ---------------------------------------------------------------------------
// Editor component
// ---------------------------------------------------------------------------

export const DocumentTemplateEditor = forwardRef<
  DocumentTemplateEditorHandle,
  DocumentTemplateEditorProps
>(function DocumentTemplateEditor(
  { content, onChange, fields, onInsertFieldRequest, className },
  ref
) {
  // Keep fields in a ref so the Mention extension always sees the latest list
  // without needing to re-create the editor.
  const fieldsRef = useRef<TemplateField[]>(fields);
  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);

  // Debounced onChange -------------------------------------------------------
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emitChange = useCallback(
    (html: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onChange(html), 300);
    },
    [onChange]
  );

  // TipTap editor ------------------------------------------------------------
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      HorizontalRule,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      createFieldMention(fieldsRef as React.RefObject<TemplateField[]>),
    ],
    content: content || "",
    onUpdate: ({ editor: e }) => emitChange(e.getHTML()),
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none px-3 py-2 focus:outline-none",
      },
    },
  });

  // Sync external content changes -------------------------------------------
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (content !== current) {
      editor.commands.setContent(content || "", { emitUpdate: false });
    }
  }, [editor, content]);

  // Imperative API -----------------------------------------------------------
  useImperativeHandle(ref, () => ({
    insertField: (fieldKey: string, label: string) => {
      if (!editor) return;
      editor
        .chain()
        .focus()
        .insertContent([
          {
            type: "fieldPlaceholder",
            attrs: { id: fieldKey, label },
          },
          { type: "text", text: " " },
        ])
        .run();
    },
    getHTML: () => editor?.getHTML(),
  }));

  if (!editor) return null;

  // Toolbar helpers ----------------------------------------------------------
  const tbBtn = (active: boolean) =>
    cn("h-8 px-2 text-xs", active && "bg-accent");

  return (
    <div className={cn("rounded-md border", className)}>
      {/* ---- Toolbar ---- */}
      <div className="flex flex-wrap items-center gap-1 border-b p-2">
        {/* Inline formatting */}
        <Button
          type="button"
          variant="ghost"
          className={tbBtn(editor.isActive("bold"))}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          B
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={tbBtn(editor.isActive("italic"))}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          I
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={tbBtn(editor.isActive("underline"))}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          U
        </Button>

        <div className="mx-1 h-5 w-px bg-border" />

        {/* Headings */}
        <Button
          type="button"
          variant="ghost"
          className={tbBtn(editor.isActive("heading", { level: 1 }))}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
        >
          H1
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={tbBtn(editor.isActive("heading", { level: 2 }))}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          H2
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={tbBtn(editor.isActive("heading", { level: 3 }))}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
        >
          H3
        </Button>

        <div className="mx-1 h-5 w-px bg-border" />

        {/* Lists */}
        <Button
          type="button"
          variant="ghost"
          className={tbBtn(editor.isActive("bulletList"))}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          {"• List"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={tbBtn(editor.isActive("orderedList"))}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          {"1. List"}
        </Button>

        <div className="mx-1 h-5 w-px bg-border" />

        {/* Alignment */}
        <Button
          type="button"
          variant="ghost"
          className={tbBtn(editor.isActive({ textAlign: "left" }))}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        >
          Left
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={tbBtn(editor.isActive({ textAlign: "center" }))}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        >
          Center
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={tbBtn(editor.isActive({ textAlign: "right" }))}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        >
          Right
        </Button>

        <div className="mx-1 h-5 w-px bg-border" />

        {/* Table & HR */}
        <Button
          type="button"
          variant="ghost"
          className="h-8 px-2"
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
        >
          Table
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-8 px-2"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          HR
        </Button>

        <div className="mx-1 h-5 w-px bg-border" />

        {/* Insert field button */}
        {onInsertFieldRequest && (
          <Button
            type="button"
            variant="outline"
            className="ml-auto h-8 px-3 text-xs"
            onClick={onInsertFieldRequest}
          >
            + Insert field
          </Button>
        )}
      </div>

      {/* ---- Editor area ---- */}
      <EditorContent
        editor={editor}
        className={cn(
          "bg-white text-black [&_.ProseMirror]:min-h-[220px] [&_.ProseMirror]:outline-none [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-gray-300 [&_td]:p-2 [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-100 [&_th]:p-2"
        )}
      />
    </div>
  );
});
