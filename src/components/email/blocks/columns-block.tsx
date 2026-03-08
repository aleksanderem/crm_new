import { useCallback } from "react";
import {
  DndContext,
  DragEndEvent,
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
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import { GripVertical, Trash2 } from "@/lib/ez-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  createBlock,
  type EmailBlock,
  type ColumnsContent,
  type VariableSource,
} from "@/lib/email-block-types";
import { TextBlock } from "./text-block";
import { ImageBlock } from "./image-block";
import { ButtonBlock } from "./button-block";

interface ColumnsBlockProps {
  content: ColumnsContent;
  onChange: (content: ColumnsContent) => void;
  isSelected: boolean;
  variableSources?: VariableSource[];
}

// Only text, image, button allowed inside columns
type SubBlockType = "text" | "image" | "button";
const SUB_BLOCK_TYPES: Array<{ type: SubBlockType; label: string }> = [
  { type: "text", label: "Text" },
  { type: "image", label: "Image" },
  { type: "button", label: "Button" },
];

// ---------------------------------------------------------------------------
// Sub-block renderer
// ---------------------------------------------------------------------------

function SubBlockRenderer({
  block,
  onChange,
  onDelete,
  variableSources,
}: {
  block: EmailBlock;
  onChange: (content: Record<string, unknown>) => void;
  onDelete: () => void;
  variableSources?: VariableSource[];
}) {
  const [isSelected, setIsSelected] = useState(false);

  const renderContent = () => {
    switch (block.type) {
      case "text":
        return (
          <TextBlock
            content={block.content as any}
            onChange={onChange as any}
            isSelected={isSelected}
            variableSources={variableSources}
          />
        );
      case "image":
        return (
          <ImageBlock
            content={block.content as any}
            onChange={onChange as any}
            isSelected={isSelected}
          />
        );
      case "button":
        return (
          <ButtonBlock
            content={block.content as any}
            onChange={onChange as any}
            isSelected={isSelected}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div
      className={cn(
        "group/sub relative rounded border",
        isSelected ? "border-blue-500" : "border-transparent hover:border-blue-300",
      )}
      onClick={(e) => {
        e.stopPropagation();
        setIsSelected(true);
      }}
      onBlur={() => setIsSelected(false)}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute -right-1 -top-1 z-10 h-5 w-5 opacity-0 group-hover/sub:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <Trash2 className="h-3 w-3" variant="stroke" />
      </Button>
      {renderContent()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sortable sub-block wrapper
// ---------------------------------------------------------------------------

function SortableSubBlock({
  block,
  onChange,
  onDelete,
  variableSources,
}: {
  block: EmailBlock;
  onChange: (content: Record<string, unknown>) => void;
  onDelete: () => void;
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
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-1">
      <button
        type="button"
        className="mt-2 cursor-grab text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3 w-3" variant="stroke" />
      </button>
      <div className="flex-1">
        <SubBlockRenderer
          block={block}
          onChange={onChange}
          onDelete={onDelete}
          variableSources={variableSources}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column drop zone
// ---------------------------------------------------------------------------

function ColumnDropZone({
  columnId,
  blocks,
  onBlocksChange,
  variableSources,
}: {
  columnId: string;
  blocks: EmailBlock[];
  onBlocksChange: (blocks: EmailBlock[]) => void;
  variableSources?: VariableSource[];
}) {
  const { setNodeRef } = useDroppable({ id: columnId });
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const oldIndex = blocks.findIndex((b) => b.id === active.id);
    const newIndex = blocks.findIndex((b) => b.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...blocks];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    onBlocksChange(reordered);
  };

  const handleSubBlockChange = useCallback(
    (blockId: string, content: Record<string, unknown>) => {
      onBlocksChange(
        blocks.map((b) => (b.id === blockId ? { ...b, content } : b)),
      );
    },
    [blocks, onBlocksChange],
  );

  const handleSubBlockDelete = useCallback(
    (blockId: string) => {
      onBlocksChange(blocks.filter((b) => b.id !== blockId));
    },
    [blocks, onBlocksChange],
  );

  const addSubBlock = (type: SubBlockType) => {
    onBlocksChange([...blocks, createBlock(type)]);
  };

  return (
    <div ref={setNodeRef} className="min-h-[60px] flex-1 rounded border border-dashed border-muted-foreground/30 p-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={blocks.map((b) => b.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1">
            {blocks.map((block) => (
              <SortableSubBlock
                key={block.id}
                block={block}
                onChange={(content) =>
                  handleSubBlockChange(block.id, content)
                }
                onDelete={() => handleSubBlockDelete(block.id)}
                variableSources={variableSources}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeId ? (
            <div className="rounded border bg-background px-2 py-1 text-xs shadow">
              Dragging block
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Add sub-block buttons */}
      <div className="mt-2 flex gap-1">
        {SUB_BLOCK_TYPES.map((bt) => (
          <Button
            key={bt.type}
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => addSubBlock(bt.type)}
          >
            + {bt.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main columns block
// ---------------------------------------------------------------------------

export function ColumnsBlock({
  content,
  onChange,
  isSelected,
  variableSources,
}: ColumnsBlockProps) {
  const handleLeftChange = useCallback(
    (blocks: EmailBlock[]) => {
      onChange({ ...content, left: blocks });
    },
    [content, onChange],
  );

  const handleRightChange = useCallback(
    (blocks: EmailBlock[]) => {
      onChange({ ...content, right: blocks });
    },
    [content, onChange],
  );

  return (
    <div className="w-full px-3 py-2">
      <div className="grid grid-cols-2 gap-3">
        <ColumnDropZone
          columnId="col-left"
          blocks={(content.left as EmailBlock[]) || []}
          onBlocksChange={handleLeftChange}
          variableSources={variableSources}
        />
        <ColumnDropZone
          columnId="col-right"
          blocks={(content.right as EmailBlock[]) || []}
          onBlocksChange={handleRightChange}
          variableSources={variableSources}
        />
      </div>
      {isSelected && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Add blocks to each column using the + buttons above
        </p>
      )}
    </div>
  );
}
