import {
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { TableRow } from "@tiptap/extension-table-row";
import {
  TableWithBorders as Table,
  TableHeaderBg as TableHeader,
  TableCellBg as TableCell,
} from "@/components/documents/table-cell-bg";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import Image from "@tiptap/extension-image";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TableBubbleMenu } from "@/components/documents/table-bubble-menu";
import { PageBreakNode } from "@/components/documents/page-break-node";
import {
  VariableMentionAt,
  VariableMentionCurly,
  variableListRef,
  updateVariableList,
  TEMPLATE_VARIABLES,
} from "@/components/gabinet/variable-mention";
import {
  FormFieldNode,
  insertFormField,
  type FormFieldAttrs,
} from "@/components/documents/form-field-node";
import { HtmlBlockNode } from "@/components/documents/html-block-node";
import {
  Bold,
  Italic,
  UnderlineIcon,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  TableIcon,
  Minus,
  FormInput,
  ImageIcon,
  ScissorsLineDashed,
  Code,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DocumentTemplateEditorProps {
  /** TipTap JSON string (from editor.getJSON()) */
  value: string;
  /** Called with updated TipTap JSON string on every change */
  onChange: (json: string) => void;
  /** Entity types to control available variables */
  entityTypes: string[];
  className?: string;
}

export interface DocumentTemplateEditorHandle {
  getJSON: () => JSONContent;
  getHTML: () => string;
  insertVariable: (path: string) => void;
  insertFormField: (attrs?: Partial<FormFieldAttrs>) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const DocumentTemplateEditor = forwardRef<
  DocumentTemplateEditorHandle,
  DocumentTemplateEditorProps
>(function DocumentTemplateEditor({ value, onChange, entityTypes, className }, ref) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Update variable list when entity types change
  useEffect(() => {
    updateVariableList(entityTypes);
  }, [entityTypes]);

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
      Image.configure({ inline: false, allowBase64: true }),
      PageBreakNode,
      FormFieldNode,
      HtmlBlockNode,
      VariableMentionAt,
      VariableMentionCurly,
    ],
    content: value ? JSON.parse(value) : undefined,
    onUpdate: ({ editor: e }) => {
      onChangeRef.current(JSON.stringify(e.getJSON()));
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none px-4 py-3 focus:outline-none",
      },
    },
  });

  // Sync external value changes (e.g. loading saved template)
  useEffect(() => {
    if (!editor || !value) return;
    try {
      const incoming = JSON.parse(value);
      const current = editor.getJSON();
      // Only update if structurally different (avoid cursor reset)
      if (JSON.stringify(incoming) !== JSON.stringify(current)) {
        editor.commands.setContent(incoming, false);
      }
    } catch {
      // Invalid JSON — ignore
    }
  }, [editor, value]);

  const doInsertVariable = useCallback(
    (path: string) => {
      if (!editor) return;
      const found = variableListRef.current.find((v) => v.key === path);
      editor
        .chain()
        .focus()
        .insertContent([
          {
            type: "variableMentionAt",
            attrs: { id: path, label: found?.label ?? path },
          },
          { type: "text", text: " " },
        ])
        .run();
    },
    [editor],
  );

  const doInsertFormField = useCallback(
    (attrs?: Partial<FormFieldAttrs>) => {
      if (!editor) return;
      insertFormField(editor, attrs);
    },
    [editor],
  );

  useImperativeHandle(ref, () => ({
    getJSON: () => editor?.getJSON() ?? { type: "doc", content: [] },
    getHTML: () => editor?.getHTML() ?? "",
    insertVariable: doInsertVariable,
    insertFormField: doInsertFormField,
  }));

  if (!editor) return null;

  const tb = (active: boolean) =>
    cn("h-8 w-8 p-0 text-muted-foreground", active && "bg-accent text-accent-foreground");

  return (
    <div className={cn("flex h-full flex-col", className)}>
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b bg-muted/30 px-2 py-1">
        {/* Text formatting */}
        <Button
          type="button"
          variant="ghost"
          className={tb(editor.isActive("bold"))}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold"
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={tb(editor.isActive("italic"))}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic"
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={tb(editor.isActive("underline"))}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Underline"
        >
          <UnderlineIcon className="h-4 w-4" />
        </Button>

        <div className="mx-1 h-5 w-px bg-border" />

        {/* Headings */}
        <Button
          type="button"
          variant="ghost"
          className={tb(editor.isActive("heading", { level: 1 }))}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          title="Heading 1"
        >
          <Heading1 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={tb(editor.isActive("heading", { level: 2 }))}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Heading 2"
        >
          <Heading2 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={tb(editor.isActive("heading", { level: 3 }))}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="Heading 3"
        >
          <Heading3 className="h-4 w-4" />
        </Button>

        <div className="mx-1 h-5 w-px bg-border" />

        {/* Lists */}
        <Button
          type="button"
          variant="ghost"
          className={tb(editor.isActive("bulletList"))}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet list"
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={tb(editor.isActive("orderedList"))}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Ordered list"
        >
          <ListOrdered className="h-4 w-4" />
        </Button>

        <div className="mx-1 h-5 w-px bg-border" />

        {/* Alignment */}
        <Button
          type="button"
          variant="ghost"
          className={tb(editor.isActive({ textAlign: "left" }))}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          title="Align left"
        >
          <AlignLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={tb(editor.isActive({ textAlign: "center" }))}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          title="Align center"
        >
          <AlignCenter className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={tb(editor.isActive({ textAlign: "right" }))}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          title="Align right"
        >
          <AlignRight className="h-4 w-4" />
        </Button>

        <div className="mx-1 h-5 w-px bg-border" />

        {/* Insert */}
        <Button
          type="button"
          variant="ghost"
          className="h-8 px-2 text-xs text-muted-foreground"
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
          title="Insert table"
        >
          <TableIcon className="mr-1 h-4 w-4" />
          Table
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-8 px-2 text-xs text-muted-foreground"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Horizontal rule"
        >
          <Minus className="mr-1 h-4 w-4" />
          HR
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-8 px-2 text-xs text-muted-foreground"
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.onchange = () => {
              const file = input.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                if (typeof reader.result === "string") {
                  editor
                    .chain()
                    .focus()
                    .setImage({ src: reader.result })
                    .run();
                }
              };
              reader.readAsDataURL(file);
            };
            input.click();
          }}
          title="Wstaw grafikę"
        >
          <ImageIcon className="mr-1 h-4 w-4" />
          Grafika
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-8 px-2 text-xs text-muted-foreground"
          onClick={() => editor.chain().focus().setPageBreak().run()}
          title="Wymuszony podział strony"
        >
          <ScissorsLineDashed className="mr-1 h-4 w-4" />
          Strona
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-8 px-2 text-xs text-muted-foreground"
          onClick={() => doInsertFormField()}
          title="Insert form field"
        >
          <FormInput className="mr-1 h-4 w-4" />
          Form field
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-8 px-2 text-xs text-muted-foreground"
          onClick={() => editor.chain().focus().insertHtmlBlock().run()}
          title="Wstaw blok HTML/CSS"
        >
          <Code className="mr-1 h-4 w-4" />
          HTML
        </Button>
      </div>

      {/* Table bubble menu */}
      <TableBubbleMenu editor={editor} />

      {/* Editor content */}
      <EditorContent
        editor={editor}
        className={cn(
          "min-h-0 flex-1 overflow-auto bg-background",
          "[&_.ProseMirror]:min-h-[400px] [&_.ProseMirror]:outline-none",
          "[&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-[var(--table-border-color,var(--color-border))] [&_td]:p-2 [&_th]:border [&_th]:border-[var(--table-border-color,var(--color-border))] [&_th]:bg-muted [&_th]:p-2",
          "[&_table[data-border-style=none]_td]:border-transparent [&_table[data-border-style=none]_th]:border-transparent",
          "[&_table[data-border-style=horizontal]_td]:border-x-transparent [&_table[data-border-style=horizontal]_th]:border-x-transparent",
          "[&_table[data-border-style=outer]_td]:border-transparent [&_table[data-border-style=outer]_th]:border-transparent [&_table[data-border-style=outer]]:border [&_table[data-border-style=outer]]:border-[var(--table-border-color,var(--color-border))]",
          "[&_img]:max-w-full [&_img]:rounded [&_img]:my-2",
        )}
      />
    </div>
  );
});
