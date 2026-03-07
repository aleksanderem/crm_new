import { useState, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  ChevronRight,
  ChevronDown,
  Link2,
} from "@/lib/ez-icons";
import { cn } from "@/lib/utils";
import type {
  DataSourceInfo,
  FieldBinding,
} from "@/lib/document-data-sources";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TemplateFieldRecord {
  _id: string;
  fieldKey: string;
  label: string;
  type: string;
  sortOrder: number;
  group?: string;
  width: "full" | "half";
  binding?: FieldBinding;
  defaultValue?: string;
  validation?: {
    required?: boolean;
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
  };
  options?: { label: string; value: string }[];
}

export interface PrefilledBinding {
  source: string;
  field: string;
  label: string;
  type: string;
}

interface TemplateFieldPanelProps {
  fields: TemplateFieldRecord[];
  sources: DataSourceInfo[];
  onAddField: (prefill?: PrefilledBinding) => void;
  onEditField: (fieldId: string) => void;
  onDeleteField: (fieldId: string) => void;
  onFieldClick: (fieldKey: string) => void;
  onReorder: (fieldIds: string[]) => void;
}

// ---------------------------------------------------------------------------
// Type label map
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  text: "Tekst",
  textarea: "Tekst",
  number: "Liczba",
  date: "Data",
  select: "Lista",
  checkbox: "Checkbox",
  signature: "Podpis",
  currency: "Kwota",
  phone: "Telefon",
  email: "Email",
  pesel: "PESEL",
};

// ---------------------------------------------------------------------------
// Sortable field row
// ---------------------------------------------------------------------------

interface SortableFieldRowProps {
  field: TemplateFieldRecord;
  onEdit: () => void;
  onDelete: () => void;
  onClick: () => void;
}

function SortableFieldRow({
  field,
  onEdit,
  onDelete,
  onClick,
}: SortableFieldRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-1.5 rounded-md border bg-card px-2 py-1.5 text-sm",
        isDragging && "opacity-50 shadow-lg",
      )}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Clickable row body */}
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        onClick={onClick}
        title={`Wstaw {{${field.fieldKey}}}`}
      >
        <span className="truncate font-medium">{field.label}</span>
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          {TYPE_LABELS[field.type] ?? field.type}
        </Badge>
        {field.binding && (
          <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground">
            <Link2 className="h-3 w-3" />
            {field.binding.source} &rarr; {field.binding.field}
          </span>
        )}
      </button>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          title="Edytuj pole"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Usun pole"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Source tree
// ---------------------------------------------------------------------------

interface SourceTreeProps {
  sources: DataSourceInfo[];
  onFieldClick: (prefill: PrefilledBinding) => void;
}

function SourceTree({ sources, onFieldClick }: SourceTreeProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  function toggle(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (sources.length === 0) return null;

  return (
    <div className="space-y-1">
      {sources.map((source) => {
        const isOpen = expanded[source.key] ?? false;
        return (
          <div key={source.key}>
            <button
              type="button"
              className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              onClick={() => toggle(source.key)}
            >
              {isOpen ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
              )}
              {source.label}
              <span className="ml-auto text-[10px] text-muted-foreground">
                {source.fields.length}
              </span>
            </button>

            {isOpen && (
              <div className="ml-4 space-y-0.5 border-l py-0.5 pl-2">
                {source.fields.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                    onClick={() =>
                      onFieldClick({
                        source: source.key,
                        field: f.key,
                        label: f.label,
                        type: f.type,
                      })
                    }
                    title={`Dodaj pole powiazane: ${f.label}`}
                  >
                    <span className="truncate">{f.label}</span>
                    <Badge
                      variant="outline"
                      className="ml-auto shrink-0 text-[9px]"
                    >
                      {f.type}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function TemplateFieldPanel({
  fields,
  sources,
  onAddField,
  onEditField,
  onDeleteField,
  onFieldClick,
  onReorder,
}: TemplateFieldPanelProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const fieldIds = fields.map((f) => f._id);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = fieldIds.indexOf(active.id as string);
      const newIndex = fieldIds.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;
      const newOrder = arrayMove(fieldIds, oldIndex, newIndex);
      onReorder(newOrder);
    },
    [fieldIds, onReorder],
  );

  const handleSourceFieldClick = useCallback(
    (prefill: PrefilledBinding) => {
      onAddField(prefill);
    },
    [onAddField],
  );

  return (
    <div className="flex h-full flex-col">
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Pola szablonu</h3>
          <Badge variant="secondary" className="text-[10px]">
            {fields.length}
          </Badge>
        </div>
      </div>

      {/* ---- Field list ---- */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {fields.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Brak pol. Kliknij &quot;Dodaj pole&quot; aby rozpoczac.
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={fieldIds}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1">
                {fields.map((field) => (
                  <SortableFieldRow
                    key={field._id}
                    field={field}
                    onEdit={() => onEditField(field._id)}
                    onDelete={() => onDeleteField(field._id)}
                    onClick={() => onFieldClick(field.fieldKey)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* Add field button */}
        <div className="mt-3 px-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => onAddField()}
          >
            <Plus className="mr-1 h-4 w-4" />
            Dodaj pole
          </Button>
        </div>
      </div>

      {/* ---- Available data sources ---- */}
      {sources.length > 0 && (
        <div className="border-t px-2 py-2">
          <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Dostepne zrodla danych
          </p>
          <SourceTree
            sources={sources}
            onFieldClick={handleSourceFieldClick}
          />
        </div>
      )}
    </div>
  );
}
