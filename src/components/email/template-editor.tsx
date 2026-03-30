import { useEffect, forwardRef, useImperativeHandle } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import Image from "@tiptap/extension-image";
import { useTranslation } from "react-i18next";
import { useSupabaseEmailBrandConfig } from "@/hooks/use-supabase-email-config";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  VariableMentionCurly,
  updateVariableList,
} from "@/components/gabinet/variable-mention";

interface EmailTemplateEditorProps {
  value: string;
  onChange: (html: string, json: string) => void;
  organizationId: string;
  requiredSources?: string[];
  className?: string;
}

export interface EmailTemplateEditorHandle {
  getHTML: () => string;
  getJSON: () => string;
}

export const EmailTemplateEditor = forwardRef<
  EmailTemplateEditorHandle,
  EmailTemplateEditorProps
>(function EmailTemplateEditor(
  { value, onChange, organizationId, requiredSources, className },
  ref,
) {
  const { t } = useTranslation();

  const { data: brandConfig } = useSupabaseEmailBrandConfig(organizationId);

  // Update variable list when requiredSources change
  useEffect(() => {
    if (requiredSources && requiredSources.length > 0) {
      updateVariableList(requiredSources);
    }
  }, [requiredSources]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      HorizontalRule,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image.configure({ inline: false, allowBase64: true }),
      VariableMentionCurly,
    ],
    content: value || "",
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML(), JSON.stringify(editor.getJSON()));
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none px-6 py-4 focus:outline-none min-h-[300px]",
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
    getHTML: () => editor?.getHTML() ?? "",
    getJSON: () => JSON.stringify(editor?.getJSON() ?? {}),
  }));

  const toolbarButton = (active: boolean) =>
    cn("h-8 px-2 text-xs", active && "bg-accent");

  return (
    <div
      className={cn(
        "mx-auto max-w-[600px] overflow-hidden rounded-lg border border-gray-200 bg-white",
        className,
      )}
    >
      {/* Toolbar */}
      {editor && (
        <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 bg-gray-50 p-2">
          <Button
            type="button"
            variant="ghost"
            className={toolbarButton(editor.isActive("bold"))}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            B
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={toolbarButton(editor.isActive("italic"))}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            I
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={toolbarButton(editor.isActive("underline"))}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            U
          </Button>

          <div className="mx-1 h-5 w-px bg-border" />

          <Button
            type="button"
            variant="ghost"
            className={toolbarButton(
              editor.isActive("heading", { level: 1 }),
            )}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
          >
            H1
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={toolbarButton(
              editor.isActive("heading", { level: 2 }),
            )}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
          >
            H2
          </Button>

          <div className="mx-1 h-5 w-px bg-border" />

          <Button
            type="button"
            variant="ghost"
            className={toolbarButton(editor.isActive("bulletList"))}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            • List
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={toolbarButton(editor.isActive("orderedList"))}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            1. List
          </Button>

          <div className="mx-1 h-5 w-px bg-border" />

          <Button
            type="button"
            variant="ghost"
            className={toolbarButton(
              editor.isActive({ textAlign: "left" }),
            )}
            onClick={() =>
              editor.chain().focus().setTextAlign("left").run()
            }
          >
            Left
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={toolbarButton(
              editor.isActive({ textAlign: "center" }),
            )}
            onClick={() =>
              editor.chain().focus().setTextAlign("center").run()
            }
          >
            Center
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={toolbarButton(
              editor.isActive({ textAlign: "right" }),
            )}
            onClick={() =>
              editor.chain().focus().setTextAlign("right").run()
            }
          >
            Right
          </Button>

          <div className="mx-1 h-5 w-px bg-border" />

          <Button
            type="button"
            variant="ghost"
            className="h-8 px-2 text-xs"
            onClick={() =>
              editor.chain().focus().setHorizontalRule().run()
            }
          >
            HR
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-8 px-2 text-xs"
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
          >
            Image
          </Button>
        </div>
      )}

      {/* Brand header (read-only, faded) */}
      <div className="pointer-events-none border-b border-gray-200 p-6 text-center opacity-60">
        {brandConfig?.logoUrl ? (
          <img src={brandConfig.logoUrl} alt="" className="mx-auto max-h-12" />
        ) : brandConfig?.companyName ? (
          <span className="text-lg font-semibold">{brandConfig.companyName}</span>
        ) : (
          <span className="text-gray-400">
            {t("emailTemplates.editor.headerPlaceholder")}
          </span>
        )}
      </div>

      {/* TipTap editor area */}
      <div className="p-0">
        <EditorContent editor={editor} />
      </div>

      {/* Brand footer (read-only, faded) */}
      <div className="pointer-events-none bg-gray-50 p-6 text-center text-xs text-gray-500 opacity-60">
        {brandConfig?.footerText ?? t("emailTemplates.editor.footerPlaceholder")}
      </div>
    </div>
  );
});
