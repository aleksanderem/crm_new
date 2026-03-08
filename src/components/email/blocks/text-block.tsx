// @ts-nocheck — tippy.js / @tiptap/suggestion lack complete type defs
import { useCallback, useRef, useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Mention from "@tiptap/extension-mention";
import tippy, { Instance as TippyInstance } from "tippy.js";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TextContent, VariableSource } from "@/lib/email-block-types";

interface TextBlockProps {
  content: TextContent;
  onChange: (content: TextContent) => void;
  isSelected: boolean;
  variableSources?: VariableSource[];
}

// ---------------------------------------------------------------------------
// Mention suggestion for variables
// ---------------------------------------------------------------------------

interface SuggestionField {
  key: string;
  label: string;
  sourceKey: string;
  sourceLabel: string;
}

function flattenSources(sources: VariableSource[]): SuggestionField[] {
  return sources.flatMap((s) =>
    s.fields.map((f) => ({
      key: `${s.key}.${f.key}`,
      label: `${s.label} > ${f.label}`,
      sourceKey: s.key,
      sourceLabel: s.label,
    })),
  );
}

function createVariableSuggestionRenderer() {
  return () => {
    let popup: TippyInstance[] = [];
    let container: HTMLDivElement | null = null;
    let selectedIndex = 0;

    const render = (props: any) => {
      if (!container) return;
      const items = props.items as SuggestionField[];
      container.innerHTML = "";
      container.className =
        "z-50 max-h-60 min-w-[280px] overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md";

      if (items.length === 0) {
        const empty = document.createElement("div");
        empty.className = "px-2 py-1.5 text-sm text-muted-foreground";
        empty.textContent = "No matching variables";
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
          props.command({ id: item.key, label: item.label });
        row.innerHTML = `<span>${item.label}</span><code class="ml-2 text-xs text-muted-foreground">{{${item.key}}}</code>`;
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
        const count = (props.items as SuggestionField[]).length;
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
          props.command({ id: item.key, label: item.label });
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

function createVariableMention(
  fieldsRef: React.RefObject<SuggestionField[]>,
) {
  return Mention.extend({ name: "emailVariable" }).configure({
    renderHTML: ({ node }: any) => [
      "span",
      {
        class:
          "inline-flex items-center rounded bg-primary/15 px-1.5 py-0.5 font-mono text-xs text-primary border border-primary/25",
        "data-variable": node.attrs.id,
        contenteditable: "false",
      },
      `{{${node.attrs.id}}}`,
    ],
    renderText: ({ node }: any) => `{{${node.attrs.id}}}`,
    deleteTriggerWithBackspace: true,
    suggestion: {
      char: "{{",
      items: ({ query }: { query: string }) => {
        const all = fieldsRef.current ?? [];
        if (!query) return all.slice(0, 10);
        const q = query.toLowerCase();
        return all
          .filter(
            (f) =>
              f.label.toLowerCase().includes(q) ||
              f.key.toLowerCase().includes(q),
          )
          .slice(0, 10);
      },
      command: ({ editor, range, props }: any) => {
        editor
          .chain()
          .focus()
          .insertContentAt({ from: range.from, to: range.to }, [
            { type: "emailVariable", attrs: props },
            { type: "text", text: " " },
          ])
          .run();
      },
      render: createVariableSuggestionRenderer(),
    },
  });
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

function MiniToolbar({ editor }: { editor: any }) {
  const tbBtn = (active: boolean) =>
    cn("h-7 px-1.5 text-xs", active && "bg-accent");

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b px-2 py-1">
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
      <div className="mx-0.5 h-4 w-px bg-border" />
      <Button
        type="button"
        variant="ghost"
        className={tbBtn(editor.isActive("link"))}
        onClick={() => {
          const url = window.prompt("Link URL:");
          if (url) {
            editor.chain().focus().setLink({ href: url }).run();
          } else {
            editor.chain().focus().unsetLink().run();
          }
        }}
      >
        Link
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TextBlock({
  content,
  onChange,
  isSelected,
  variableSources,
}: TextBlockProps) {
  const fieldsRef = useRef<SuggestionField[]>([]);

  useEffect(() => {
    fieldsRef.current = variableSources
      ? flattenSources(variableSources)
      : [];
  }, [variableSources]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emitChange = useCallback(
    (html: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onChange({ html }), 200);
    },
    [onChange],
  );

  const extensions = [
    StarterKit,
    Underline,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    ...(variableSources && variableSources.length > 0
      ? [createVariableMention(fieldsRef as React.RefObject<SuggestionField[]>)]
      : []),
  ];

  const editor = useEditor({
    extensions,
    content: content.html || "",
    onUpdate: ({ editor: e }) => emitChange(e.getHTML()),
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none px-3 py-2 focus:outline-none min-h-[60px]",
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
      {isSelected && <MiniToolbar editor={editor} />}
      <EditorContent
        editor={editor}
        className="bg-white text-black [&_.ProseMirror]:min-h-[40px] [&_.ProseMirror]:outline-none"
      />
    </div>
  );
}
