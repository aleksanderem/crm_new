import { useState, useCallback } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "@/lib/ez-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  createBlock,
  type EmailBlock,
  type BlockType,
  type VariableSource,
} from "@/lib/email-block-types";
import { BlockPalette } from "./block-palette";
import { BlockRenderer } from "./block-renderer";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EmailBlockBuilderProps {
  blocks: EmailBlock[];
  onChange: (blocks: EmailBlock[]) => void;
  variableSources?: VariableSource[];
  className?: string;
}

// ---------------------------------------------------------------------------
// Sortable block wrapper
// ---------------------------------------------------------------------------

function SortableBlock({
  block,
  isSelected,
  onSelect,
  onContentChange,
  onDuplicate,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  variableSources,
}: {
  block: EmailBlock;
  isSelected: boolean;
  onSelect: () => void;
  onContentChange: (content: Record<string, unknown>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  variableSources?: VariableSource[];
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative rounded-lg border transition-colors",
        isSelected
          ? "border-blue-500 shadow-sm"
          : "border-transparent hover:border-blue-300",
      )}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="absolute left-0 top-0 bottom-0 flex w-6 cursor-grab items-center justify-center rounded-l-lg text-muted-foreground hover:bg-muted"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" variant="stroke" />
      </button>

      {/* Action bar (top-right, visible on hover or selection) */}
      <div
        className={cn(
          "absolute -top-3 right-2 z-10 flex items-center gap-0.5 rounded border bg-background px-1 py-0.5 shadow-sm transition-opacity",
          isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            onMoveUp();
          }}
          disabled={isFirst}
          title="Move up"
        >
          <span className="text-xs">↑</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            onMoveDown();
          }}
          disabled={isLast}
          title="Move down"
        >
          <span className="text-xs">↓</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
          title="Duplicate"
        >
          <span className="text-xs">⧉</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete"
        >
          <Trash2 className="h-3 w-3" variant="stroke" />
        </Button>
      </div>

      {/* Block content */}
      <div className="ml-6">
        <BlockRenderer
          block={block}
          isSelected={isSelected}
          onContentChange={onContentChange}
          variableSources={variableSources}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Canvas drop zone
// ---------------------------------------------------------------------------

function CanvasDropZone({
  children,
  isEmpty,
}: {
  children: React.ReactNode;
  isEmpty: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "canvas" });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-[200px] flex-1 rounded-lg border-2 border-dashed p-4 transition-colors",
        isOver ? "border-blue-400 bg-blue-50/50" : "border-muted-foreground/20",
        isEmpty && "flex items-center justify-center",
      )}
    >
      {isEmpty ? (
        <p className="text-sm text-muted-foreground">
          Drag blocks here to start building your email
        </p>
      ) : (
        children
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function EmailBlockBuilder({
  blocks,
  onChange,
  variableSources,
  className,
}: EmailBlockBuilderProps) {
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  // ---- Handlers ----

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      if (!over) return;

      const activeData = active.data.current;

      // Dragging from palette → create new block
      if (activeData?.fromPalette) {
        const blockType = activeData.type as BlockType;
        const newBlock = createBlock(blockType);

        // Find insertion index
        const overIndex = blocks.findIndex((b) => b.id === over.id);
        if (overIndex >= 0) {
          const updated = [...blocks];
          updated.splice(overIndex, 0, newBlock);
          onChange(updated);
        } else {
          // Dropped on canvas itself
          onChange([...blocks, newBlock]);
        }
        setSelectedBlockId(newBlock.id);
        return;
      }

      // Reordering within canvas
      if (active.id !== over.id) {
        const oldIndex = blocks.findIndex((b) => b.id === active.id);
        const newIndex = blocks.findIndex((b) => b.id === over.id);
        if (oldIndex >= 0 && newIndex >= 0) {
          onChange(arrayMove(blocks, oldIndex, newIndex));
        }
      }
    },
    [blocks, onChange],
  );

  const handleContentChange = useCallback(
    (blockId: string, content: Record<string, unknown>) => {
      onChange(blocks.map((b) => (b.id === blockId ? { ...b, content } : b)));
    },
    [blocks, onChange],
  );

  const handleDuplicate = useCallback(
    (blockId: string) => {
      const idx = blocks.findIndex((b) => b.id === blockId);
      if (idx === -1) return;
      const original = blocks[idx];
      const duplicate = createBlock(original.type);
      const duplicateWithContent = {
        ...duplicate,
        content: JSON.parse(JSON.stringify(original.content)),
      };
      const updated = [...blocks];
      updated.splice(idx + 1, 0, duplicateWithContent);
      onChange(updated);
      setSelectedBlockId(duplicateWithContent.id);
    },
    [blocks, onChange],
  );

  const handleDelete = useCallback(
    (blockId: string) => {
      onChange(blocks.filter((b) => b.id !== blockId));
      if (selectedBlockId === blockId) {
        setSelectedBlockId(null);
      }
    },
    [blocks, onChange, selectedBlockId],
  );

  const handleMoveUp = useCallback(
    (blockId: string) => {
      const idx = blocks.findIndex((b) => b.id === blockId);
      if (idx <= 0) return;
      onChange(arrayMove(blocks, idx, idx - 1));
    },
    [blocks, onChange],
  );

  const handleMoveDown = useCallback(
    (blockId: string) => {
      const idx = blocks.findIndex((b) => b.id === blockId);
      if (idx === -1 || idx >= blocks.length - 1) return;
      onChange(arrayMove(blocks, idx, idx + 1));
    },
    [blocks, onChange],
  );

  const handleCanvasClick = useCallback(() => {
    setSelectedBlockId(null);
  }, []);

  // Active block for overlay
  const activeBlock = activeId ? blocks.find((b) => b.id === activeId) : null;
  const isPaletteItem = activeId?.startsWith("palette-");

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className={cn("flex gap-4", className)} onClick={handleCanvasClick}>
        {/* Left sidebar — block palette */}
        <div className="w-60 shrink-0">
          <BlockPalette />
        </div>

        {/* Main canvas */}
        <CanvasDropZone isEmpty={blocks.length === 0}>
          <SortableContext
            items={blocks.map((b) => b.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {blocks.map((block, idx) => (
                <SortableBlock
                  key={block.id}
                  block={block}
                  isSelected={selectedBlockId === block.id}
                  onSelect={() => setSelectedBlockId(block.id)}
                  onContentChange={(content) =>
                    handleContentChange(block.id, content)
                  }
                  onDuplicate={() => handleDuplicate(block.id)}
                  onDelete={() => handleDelete(block.id)}
                  onMoveUp={() => handleMoveUp(block.id)}
                  onMoveDown={() => handleMoveDown(block.id)}
                  isFirst={idx === 0}
                  isLast={idx === blocks.length - 1}
                  variableSources={variableSources}
                />
              ))}
            </div>
          </SortableContext>
        </CanvasDropZone>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {isPaletteItem ? (
          <div className="rounded-md border bg-background px-4 py-2 text-sm shadow-lg">
            {activeId?.replace("palette-", "")} block
          </div>
        ) : activeBlock ? (
          <div className="rounded-md border bg-background px-4 py-2 text-sm shadow-lg opacity-80">
            {activeBlock.type} block
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
