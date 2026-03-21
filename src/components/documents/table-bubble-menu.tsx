import { BubbleMenu } from "@tiptap/react/menus";
import { useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Rows3,
  Columns3,
  Trash2,
  TableCellsMerge,
  TableCellsSplit,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  PaintBucket,
  Ban,
  Grid3X3,
  SquareDashed,
  GripHorizontal,
  Square,
  Pen,
  Pipette,
  PanelTop,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TableBorderStyle } from "@/components/documents/table-cell-bg";

const CELL_BG_COLORS = [
  { color: null, label: "Brak tła" },
  { color: "#fef3c7", label: "Żółty" },
  { color: "#dbeafe", label: "Niebieski" },
  { color: "#dcfce7", label: "Zielony" },
  { color: "#fce7f3", label: "Różowy" },
  { color: "#f3e8ff", label: "Fioletowy" },
  { color: "#fee2e2", label: "Czerwony" },
  { color: "#f1f5f9", label: "Szary" },
] as const;

function ColorSwatch({
  color,
  label,
  onClick,
  icon,
}: {
  color: string | null;
  label: string;
  onClick: () => void;
  icon?: "ban";
}) {
  return (
    <button
      type="button"
      className="h-5 w-5 shrink-0 rounded-sm border border-border/50 transition-transform hover:scale-125"
      style={color ? { backgroundColor: color } : undefined}
      onClick={onClick}
      title={label}
    >
      {icon === "ban" && (
        <Ban className="h-3 w-3 text-muted-foreground mx-auto" />
      )}
    </button>
  );
}

function CustomColorPicker({
  onColorChange,
  title,
}: {
  onColorChange: (color: string) => void;
  title: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="color"
        className="sr-only"
        onChange={(e) => onColorChange(e.target.value)}
      />
      <button
        type="button"
        className="h-5 w-5 shrink-0 rounded-sm border border-border/50 transition-transform hover:scale-125 flex items-center justify-center bg-gradient-to-br from-red-400 via-green-400 to-blue-400"
        onClick={() => inputRef.current?.click()}
        title={title}
      >
        <Pipette className="h-3 w-3 text-white drop-shadow-sm" />
      </button>
    </>
  );
}

interface TableBubbleMenuProps {
  editor: Editor;
}

export function TableBubbleMenu({ editor }: TableBubbleMenuProps) {
  const btn =
    "h-7 w-7 p-0 text-muted-foreground hover:text-foreground";
  const btnDanger = cn(btn, "text-destructive hover:text-destructive");

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      deleteRow: e.can().deleteRow(),
      deleteColumn: e.can().deleteColumn(),
      mergeCells: e.can().mergeCells(),
      splitCell: e.can().splitCell(),
      borderStyle: (e.getAttributes("table").borderStyle ?? "all") as TableBorderStyle,
      isInHeader: e.isActive("tableHeader"),
    }),
  });

  const setBorderStyle = (style: TableBorderStyle) =>
    editor.chain().focus().updateAttributes("table", { borderStyle: style }).run();

  const setBorderColor = (color: string | null) =>
    editor.chain().focus().updateAttributes("table", { borderColor: color }).run();

  const setCellBg = (color: string | null) =>
    editor.chain().focus().setCellAttribute("backgroundColor", color).run();

  const setHeaderBg = (color: string | null) => {
    const { state: editorState } = editor;
    const { tr, doc, selection } = editorState;
    doc.nodesBetween(0, doc.content.size, (node, pos) => {
      if (node.type.name === "table") {
        const end = pos + node.nodeSize;
        if (selection.from >= pos && selection.from <= end) {
          node.descendants((child, childPos) => {
            if (child.type.name === "tableHeader") {
              tr.setNodeMarkup(pos + 1 + childPos, undefined, {
                ...child.attrs,
                backgroundColor: color,
              });
            }
          });
          return false;
        }
      }
    });
    editor.view.dispatch(tr);
  };

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: e }) => e.isActive("table")}
    >
      <div className="flex flex-col gap-0.5 rounded-lg border bg-popover p-1 shadow-md">
        {/* Row 1: Structure / layout */}
        <div className="flex items-center gap-0.5">
          <Button type="button" variant="ghost" className={btn}
            onClick={() => editor.chain().focus().addRowBefore().run()}
            title="Wiersz powyżej">
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="ghost" className={btn}
            onClick={() => editor.chain().focus().addRowAfter().run()}
            title="Wiersz poniżej">
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="ghost" className={btnDanger}
            disabled={!state.deleteRow}
            onClick={() => editor.chain().focus().deleteRow().run()}
            title="Usuń wiersz">
            <Rows3 className="h-3.5 w-3.5" />
          </Button>

          <div className="mx-0.5 h-5 w-px bg-border" />

          <Button type="button" variant="ghost" className={btn}
            onClick={() => editor.chain().focus().addColumnBefore().run()}
            title="Kolumna z lewej">
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="ghost" className={btn}
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            title="Kolumna z prawej">
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="ghost" className={btnDanger}
            disabled={!state.deleteColumn}
            onClick={() => editor.chain().focus().deleteColumn().run()}
            title="Usuń kolumnę">
            <Columns3 className="h-3.5 w-3.5" />
          </Button>

          <div className="mx-0.5 h-5 w-px bg-border" />

          <Button type="button" variant="ghost" className={btn}
            disabled={!state.mergeCells}
            onClick={() => editor.chain().focus().mergeCells().run()}
            title="Scal komórki">
            <TableCellsMerge className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="ghost" className={btn}
            disabled={!state.splitCell}
            onClick={() => editor.chain().focus().splitCell().run()}
            title="Rozdziel komórkę">
            <TableCellsSplit className="h-3.5 w-3.5" />
          </Button>

          <div className="mx-0.5 h-5 w-px bg-border" />

          <Button type="button" variant="ghost" className={btnDanger}
            onClick={() => editor.chain().focus().deleteTable().run()}
            title="Usuń tabelę">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Row 2: Cell background */}
        <div className="flex items-center gap-0.5">
          <PaintBucket className="ml-0.5 mr-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {CELL_BG_COLORS.map(({ color, label }) => (
            <ColorSwatch
              key={label}
              color={color}
              label={label}
              onClick={() => setCellBg(color)}
              icon={color === null ? "ban" : undefined}
            />
          ))}
          <CustomColorPicker
            onColorChange={(c) => setCellBg(c)}
            title="Własny kolor tła"
          />
        </div>

        {/* Row 2.5: Header background (when cursor in th) */}
        {state.isInHeader && (
          <div className="flex items-center gap-0.5">
            <PanelTop className="ml-0.5 mr-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {CELL_BG_COLORS.map(({ color, label }) => (
              <ColorSwatch
                key={label}
                color={color}
                label={`Nagłówek: ${label}`}
                onClick={() => setHeaderBg(color)}
                icon={color === null ? "ban" : undefined}
              />
            ))}
            <CustomColorPicker
              onColorChange={(c) => setHeaderBg(c)}
              title="Własny kolor nagłówka"
            />
          </div>
        )}

        {/* Row 3: Border style + color */}
        <div className="flex items-center gap-0.5">
          <Pen className="ml-0.5 mr-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />

          <Button type="button" variant="ghost"
            className={cn("h-6 w-6 p-0 text-muted-foreground hover:text-foreground", state.borderStyle === "all" && "bg-accent")}
            onClick={() => setBorderStyle("all")}
            title="Wszystkie obramowania">
            <Grid3X3 className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="ghost"
            className={cn("h-6 w-6 p-0 text-muted-foreground hover:text-foreground", state.borderStyle === "outer" && "bg-accent")}
            onClick={() => setBorderStyle("outer")}
            title="Obramowanie zewnętrzne">
            <Square className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="ghost"
            className={cn("h-6 w-6 p-0 text-muted-foreground hover:text-foreground", state.borderStyle === "horizontal" && "bg-accent")}
            onClick={() => setBorderStyle("horizontal")}
            title="Linie poziome">
            <GripHorizontal className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="ghost"
            className={cn("h-6 w-6 p-0 text-muted-foreground hover:text-foreground", state.borderStyle === "none" && "bg-accent")}
            onClick={() => setBorderStyle("none")}
            title="Bez obramowania">
            <SquareDashed className="h-3.5 w-3.5" />
          </Button>

          <div className="mx-0.5 h-5 w-px bg-border" />

          <ColorSwatch
            color={null}
            label="Domyślny kolor krawędzi"
            onClick={() => setBorderColor(null)}
            icon="ban"
          />
          <CustomColorPicker
            onColorChange={(c) => setBorderColor(c)}
            title="Własny kolor krawędzi"
          />
        </div>
      </div>
    </BubbleMenu>
  );
}
