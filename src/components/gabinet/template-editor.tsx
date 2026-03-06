import { useEffect, forwardRef, useImperativeHandle } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  TEMPLATE_VARIABLE_CATEGORIES,
  TEMPLATE_VARIABLES,
  VariableMentionAt,
  VariableMentionCurly,
} from "@/components/gabinet/variable-mention";

interface TemplateEditorProps {
  value: string;
  onChange: (value: string) => void;
  minHeightClassName?: string;
}

export const TemplateEditor = forwardRef(function TemplateEditor(
  {
    value,
    onChange,
    minHeightClassName = "min-h-[260px]",
  }: TemplateEditorProps,
  ref: any
) {
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
      VariableMentionAt,
      VariableMentionCurly,
    ],
    content: value || "",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none px-3 py-2 focus:outline-none",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== current) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [editor, value]);

  useImperativeHandle(ref, () => ({
    insertVariable: (key: string) => {
      if (!editor) return;
      editor
        .chain()
        .focus()
        .insertContent([
          {
            type: "variableMentionAt",
            attrs: {
              id: key,
              label: TEMPLATE_VARIABLES.find((v) => v.key === key)?.label ?? key,
            },
          },
          { type: "text", text: " " },
        ])
        .run();
    },
    getHTML: () => editor?.getHTML(),
  }));

  if (!editor) return null;

  const toolbarButton = (active: boolean) => cn("h-8 px-2 text-xs", active && "bg-accent");

  const insertVariable = (key: string) => {
    editor
      .chain()
      .focus()
      .insertContent([
        {
          type: "variableMentionAt",
          attrs: {
            id: key,
            label: TEMPLATE_VARIABLES.find((v) => v.key === key)?.label ?? key,
          },
        },
        { type: "text", text: " " },
      ])
      .run();
  };

  return (
    <div className="rounded-md border">
      <div className="flex flex-wrap items-center gap-1 border-b p-2">
        <Button type="button" variant="ghost" className={toolbarButton(editor.isActive("bold"))} onClick={() => editor.chain().focus().toggleBold().run()}>B</Button>
        <Button type="button" variant="ghost" className={toolbarButton(editor.isActive("italic"))} onClick={() => editor.chain().focus().toggleItalic().run()}>I</Button>
        <Button type="button" variant="ghost" className={toolbarButton(editor.isActive("underline"))} onClick={() => editor.chain().focus().toggleUnderline().run()}>U</Button>

        <div className="mx-1 h-5 w-px bg-border" />

        <Button type="button" variant="ghost" className={toolbarButton(editor.isActive("heading", { level: 1 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</Button>
        <Button type="button" variant="ghost" className={toolbarButton(editor.isActive("heading", { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</Button>
        <Button type="button" variant="ghost" className={toolbarButton(editor.isActive("heading", { level: 3 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</Button>

        <div className="mx-1 h-5 w-px bg-border" />

        <Button type="button" variant="ghost" className={toolbarButton(editor.isActive("bulletList"))} onClick={() => editor.chain().focus().toggleBulletList().run()}>• List</Button>
        <Button type="button" variant="ghost" className={toolbarButton(editor.isActive("orderedList"))} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. List</Button>

        <div className="mx-1 h-5 w-px bg-border" />

        <Button type="button" variant="ghost" className={toolbarButton(editor.isActive({ textAlign: "left" }))} onClick={() => editor.chain().focus().setTextAlign("left").run()}>Left</Button>
        <Button type="button" variant="ghost" className={toolbarButton(editor.isActive({ textAlign: "center" }))} onClick={() => editor.chain().focus().setTextAlign("center").run()}>Center</Button>
        <Button type="button" variant="ghost" className={toolbarButton(editor.isActive({ textAlign: "right" }))} onClick={() => editor.chain().focus().setTextAlign("right").run()}>Right</Button>

        <div className="mx-1 h-5 w-px bg-border" />

        <Button type="button" variant="ghost" className="h-8 px-2" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>Table</Button>
        <Button type="button" variant="ghost" className="h-8 px-2" onClick={() => editor.chain().focus().setHorizontalRule().run()}>HR</Button>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          {TEMPLATE_VARIABLE_CATEGORIES.map((category) => {
            const categoryVariables = TEMPLATE_VARIABLES.filter((v) => v.category === category.id);
            if (!categoryVariables.length) return null;
            return (
              <div key={category.id} className="flex items-center gap-1">
                <span className="px-1 text-[10px] uppercase text-muted-foreground">{category.label}</span>
                {categoryVariables.map((variable) => (
                  <Button
                    key={variable.key}
                    type="button"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => insertVariable(variable.key)}
                  >
                    @{variable.key}
                  </Button>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <EditorContent
        editor={editor}
        className={cn(
          "bg-background [&_.ProseMirror]:min-h-[220px] [&_.ProseMirror]:outline-none [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:bg-muted [&_th]:p-2",
          minHeightClassName
        )}
      />
    </div>
  );
});
