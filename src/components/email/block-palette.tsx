import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { BLOCK_PALETTE, type BlockPaletteItem } from "@/lib/email-block-types";
import { GripVertical } from "@/lib/ez-icons";

// Group labels
const GROUP_LABELS: Record<string, string> = {
  content: "Content",
  media: "Media",
  layout: "Layout",
};

// Simple icon indicators for each block type (using text since we lack
// dedicated icons for all types).
const BLOCK_ICONS: Record<string, string> = {
  text: "Aa",
  heading: "H",
  image: "Img",
  button: "Btn",
  divider: "---",
  columns: "||",
  spacer: "↕",
};

// ---------------------------------------------------------------------------
// Draggable palette item
// ---------------------------------------------------------------------------

function PaletteItem({ item }: { item: BlockPaletteItem }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${item.type}`,
    data: { type: item.type, fromPalette: true },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "flex cursor-grab items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-accent",
        isDragging && "opacity-40",
      )}
    >
      <GripVertical
        className="h-3.5 w-3.5 text-muted-foreground"
        variant="stroke"
      />
      <span className="w-6 text-center font-mono text-xs text-muted-foreground">
        {BLOCK_ICONS[item.type]}
      </span>
      <span>{item.label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Palette sidebar
// ---------------------------------------------------------------------------

export function BlockPalette({ className }: { className?: string }) {
  const grouped = BLOCK_PALETTE.reduce<Record<string, BlockPaletteItem[]>>(
    (acc, item) => {
      const group = acc[item.group] ?? [];
      return { ...acc, [item.group]: [...group, item] };
    },
    {},
  );

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Blocks
      </p>
      {Object.entries(grouped).map(([group, items]) => (
        <div key={group}>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            {GROUP_LABELS[group] ?? group}
          </p>
          <div className="space-y-1">
            {items.map((item) => (
              <PaletteItem key={item.type} item={item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
