import { useCallback, useMemo } from "react";
import type { Value } from "platejs";
import {
  BoldPlugin,
  ItalicPlugin,
  UnderlinePlugin,
} from "@platejs/basic-nodes/react";
import { Plate, usePlateEditor } from "platejs/react";
import { KEYS } from "platejs";
import {
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
} from "lucide-react";

import { ListKit } from "@/components/editor/plugins/list-kit";
import { Editor, EditorContainer } from "@/components/ui/editor";
import { FixedToolbar } from "@/components/ui/fixed-toolbar";
import { MarkToolbarButton } from "@/components/ui/mark-toolbar-button";
import {
  BulletedListToolbarButton,
  NumberedListToolbarButton,
} from "@/components/ui/list-toolbar-button";
import { ToolbarGroup } from "@/components/ui/toolbar";

// ---------------------------------------------------------------------------
// Helpers: convert between Plate Value and plain-text string
// ---------------------------------------------------------------------------

const makeEmptyValue = (): Value => [{ type: "p", children: [{ text: "" }] }];

/** Parse stored string into Plate Value. Handles JSON or plain text. */
function parseValue(raw: string | undefined): Value {
  if (!raw) return makeEmptyValue();
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // Not JSON — wrap plain text as paragraph(s)
  }
  return raw
    .split("\n")
    .map((line) => ({ type: "p", children: [{ text: line }] }));
}

/** Serialize Plate Value to JSON string for storage. */
function serializeValue(value: Value): string {
  return JSON.stringify(value);
}

/** Check if Plate value is empty (no text content). */
function isValueEmpty(value: Value): boolean {
  return value.every((node: any) => {
    if (!node.children) return true;
    return node.children.every(
      (child: any) => typeof child.text === "string" && child.text === "",
    );
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface RichTextEditorProps {
  /** Raw stored string (JSON or plain text) */
  value: string | undefined;
  /** Called with serialized JSON string on every change */
  onChange: (serialized: string | undefined) => void;
  placeholder?: string;
  /** Minimum height of the editor area (default "120px") */
  minHeight?: string;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = "120px",
}: RichTextEditorProps) {
  const initialValue = useMemo(() => parseValue(value), []);

  const editor = usePlateEditor({
    plugins: [
      BoldPlugin,
      ItalicPlugin,
      UnderlinePlugin,
      ...ListKit,
    ],
    value: initialValue,
  });

  const handleChange = useCallback(
    ({ value: newValue }: { value: Value }) => {
      if (isValueEmpty(newValue)) {
        onChange(undefined);
      } else {
        onChange(serializeValue(newValue));
      }
    },
    [onChange],
  );

  return (
    <div className="overflow-hidden rounded-md border">
      <Plate editor={editor} onChange={handleChange}>
        <FixedToolbar className="justify-start gap-0.5 border-b border-t-0 rounded-t-none p-1">
          <ToolbarGroup>
            <MarkToolbarButton nodeType={KEYS.bold} tooltip="Bold (⌘+B)">
              <BoldIcon className="size-4" />
            </MarkToolbarButton>
            <MarkToolbarButton nodeType={KEYS.italic} tooltip="Italic (⌘+I)">
              <ItalicIcon className="size-4" />
            </MarkToolbarButton>
            <MarkToolbarButton
              nodeType={KEYS.underline}
              tooltip="Underline (⌘+U)"
            >
              <UnderlineIcon className="size-4" />
            </MarkToolbarButton>
          </ToolbarGroup>

          <ToolbarGroup>
            <BulletedListToolbarButton />
            <NumberedListToolbarButton />
          </ToolbarGroup>
        </FixedToolbar>

        <EditorContainer style={{ minHeight }}>
          <Editor
            variant="none"
            className="px-3 py-2 text-sm"
            placeholder={placeholder}
          />
        </EditorContainer>
      </Plate>
    </div>
  );
}

/** Extract plain text from a stored string (Plate JSON or plain text). */
function plateJsonToText(raw: string | undefined): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const extractText = (node: any): string => {
        if (typeof node.text === "string") return node.text;
        if (Array.isArray(node.children)) return node.children.map(extractText).join("");
        return "";
      };
      return parsed.map((block: any) => extractText(block)).join("\n");
    }
  } catch {
    // Not JSON — return as-is
  }
  return raw;
}

export { parseValue, serializeValue, isValueEmpty, plateJsonToText };
