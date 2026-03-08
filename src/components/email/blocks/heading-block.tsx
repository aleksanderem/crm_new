// @ts-nocheck — @tiptap types
import { useCallback, useRef, useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HeadingContent } from "@/lib/email-block-types";

interface HeadingBlockProps {
  content: HeadingContent;
  onChange: (content: HeadingContent) => void;
  isSelected: boolean;
}

function HeadingToolbar({ editor }: { editor: any }) {
  const tbBtn = (active: boolean) =>
    cn("h-7 px-1.5 text-xs", active && "bg-accent");

  return (
    <div className="flex items-center gap-0.5 border-b px-2 py-1">
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
      <div className="mx-0.5 h-4 w-px bg-border" />
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
    </div>
  );
}

export function HeadingBlock({
  content,
  onChange,
  isSelected,
}: HeadingBlockProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emitChange = useCallback(
    (html: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onChange({ html }), 200);
    },
    [onChange],
  );

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: content.html || "<h2>Heading</h2>",
    onUpdate: ({ editor: e }) => emitChange(e.getHTML()),
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none px-3 py-2 focus:outline-none",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (content.html !== current) {
      editor.commands.setContent(content.html || "", { emitUpdate: false });
    }
  }, [editor, content.html]);

  if (!editor) return null;

  return (
    <div className="w-full">
      {isSelected && <HeadingToolbar editor={editor} />}
      <EditorContent
        editor={editor}
        className="bg-white text-black [&_.ProseMirror]:min-h-[40px] [&_.ProseMirror]:outline-none"
      />
    </div>
  );
}
