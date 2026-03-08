import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SPACER_HEIGHTS } from "@/lib/email-block-types";
import type {
  EmailBlock,
  BlockStyles,
  ImageContent,
  ButtonContent,
  DividerContent,
  SpacerContent,
} from "@/lib/email-block-types";

interface BlockPropertiesPanelProps {
  block: EmailBlock;
  onContentChange: (content: Record<string, unknown>) => void;
  onStylesChange: (styles: BlockStyles) => void;
}

const ALIGN_OPTIONS = ["left", "center", "right"] as const;

export function BlockPropertiesPanel({
  block,
  onContentChange,
  onStylesChange,
}: BlockPropertiesPanelProps) {
  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {BLOCK_TYPE_LABELS[block.type] ?? block.type}
      </p>

      {/* Content-specific controls */}
      {block.type === "text" || block.type === "heading" ? (
        <TextHint blockType={block.type} />
      ) : block.type === "image" ? (
        <ImageProperties
          content={block.content as ImageContent}
          onChange={(c) => onContentChange(c as Record<string, unknown>)}
        />
      ) : block.type === "button" ? (
        <ButtonProperties
          content={block.content as ButtonContent}
          onChange={(c) => onContentChange(c as Record<string, unknown>)}
        />
      ) : block.type === "divider" ? (
        <DividerProperties
          content={block.content as DividerContent}
          onChange={(c) => onContentChange(c as Record<string, unknown>)}
        />
      ) : block.type === "spacer" ? (
        <SpacerProperties
          content={block.content as unknown as SpacerContent}
          onChange={(c) => onContentChange(c as unknown as Record<string, unknown>)}
        />
      ) : block.type === "columns" ? (
        <p className="text-sm text-muted-foreground">
          Dodaj bloki do kolumn za pomocą przycisków + na canvasie.
        </p>
      ) : null}

      {/* Styles — common for all block types */}
      <div className="border-t pt-4">
        <BlockStylesEditor
          styles={block.styles ?? {}}
          onChange={onStylesChange}
          blockType={block.type}
        />
      </div>
    </div>
  );
}

const BLOCK_TYPE_LABELS: Record<string, string> = {
  text: "Tekst",
  heading: "Nagłówek",
  image: "Obraz",
  button: "Przycisk",
  divider: "Separator",
  spacer: "Odstęp",
  columns: "Kolumny",
};

// ---------------------------------------------------------------------------
// Text / Heading hint
// ---------------------------------------------------------------------------

function TextHint({ blockType }: { blockType: string }) {
  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      <p>
        Edytuj {blockType === "heading" ? "nagłówek" : "tekst"} bezpośrednio na
        canvasie. Kliknij blok, aby zobaczyć toolbar.
      </p>
      <div className="space-y-1 text-xs">
        <p>
          <kbd className="rounded border bg-muted px-1">Ctrl+B</kbd> Pogrubienie
        </p>
        <p>
          <kbd className="rounded border bg-muted px-1">Ctrl+I</kbd> Kursywa
        </p>
        <p>
          <kbd className="rounded border bg-muted px-1">Ctrl+U</kbd>{" "}
          Podkreślenie
        </p>
        <p>
          <kbd className="rounded border bg-muted px-1">{"{{…}}"}</kbd> Wstaw
          zmienną
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Image
// ---------------------------------------------------------------------------

function ImageProperties({
  content,
  onChange,
}: {
  content: ImageContent;
  onChange: (c: ImageContent) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">URL obrazu</Label>
        <Input
          value={content.url}
          onChange={(e) => onChange({ ...content, url: e.target.value })}
          placeholder="https://example.com/image.jpg"
          className="h-8 text-sm"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Tekst alternatywny</Label>
        <Input
          value={content.alt}
          onChange={(e) => onChange({ ...content, alt: e.target.value })}
          placeholder="Opis obrazu"
          className="h-8 text-sm"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">URL linku (opcjonalnie)</Label>
        <Input
          value={content.linkUrl ?? ""}
          onChange={(e) => onChange({ ...content, linkUrl: e.target.value })}
          placeholder="https://..."
          className="h-8 text-sm"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Szerokość: {content.width ?? 100}%</Label>
        <Slider
          value={[content.width ?? 100]}
          onValueChange={([val]) => onChange({ ...content, width: val })}
          min={10}
          max={100}
          step={5}
          className="w-full"
        />
      </div>
      <AlignmentPicker
        value={content.align}
        onChange={(align) => onChange({ ...content, align })}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

function ButtonProperties({
  content,
  onChange,
}: {
  content: ButtonContent;
  onChange: (c: ButtonContent) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Etykieta</Label>
        <Input
          value={content.label}
          onChange={(e) => onChange({ ...content, label: e.target.value })}
          placeholder="Kliknij tutaj"
          className="h-8 text-sm"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">URL</Label>
        <Input
          value={content.url}
          onChange={(e) => onChange({ ...content, url: e.target.value })}
          placeholder="https://..."
          className="h-8 text-sm"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Kolor tła</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={content.bgColor || "#2563eb"}
            onChange={(e) => onChange({ ...content, bgColor: e.target.value })}
            className="h-8 w-8 cursor-pointer rounded border"
          />
          <Input
            value={content.bgColor || "#2563eb"}
            onChange={(e) => onChange({ ...content, bgColor: e.target.value })}
            className="h-8 flex-1 font-mono text-xs"
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Kolor tekstu</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={content.textColor || "#ffffff"}
            onChange={(e) =>
              onChange({ ...content, textColor: e.target.value })
            }
            className="h-8 w-8 cursor-pointer rounded border"
          />
          <Input
            value={content.textColor || "#ffffff"}
            onChange={(e) =>
              onChange({ ...content, textColor: e.target.value })
            }
            className="h-8 flex-1 font-mono text-xs"
          />
        </div>
      </div>
      <AlignmentPicker
        value={content.align}
        onChange={(align) => onChange({ ...content, align })}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Divider
// ---------------------------------------------------------------------------

function DividerProperties({
  content,
  onChange,
}: {
  content: DividerContent;
  onChange: (c: DividerContent) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Kolor</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={content.color || "#e5e7eb"}
            onChange={(e) => onChange({ ...content, color: e.target.value })}
            className="h-8 w-8 cursor-pointer rounded border"
          />
          <Input
            value={content.color || "#e5e7eb"}
            onChange={(e) => onChange({ ...content, color: e.target.value })}
            className="h-8 w-28 font-mono text-xs"
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Grubość: {content.thickness || 1}px</Label>
        <Slider
          value={[content.thickness || 1]}
          onValueChange={([val]) => onChange({ ...content, thickness: val })}
          min={1}
          max={8}
          step={1}
          className="w-48"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spacer
// ---------------------------------------------------------------------------

function SpacerProperties({
  content,
  onChange,
}: {
  content: SpacerContent;
  onChange: (c: SpacerContent) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">Wysokość</Label>
      <RadioGroup
        value={String(content.height || 24)}
        onValueChange={(val) => onChange({ height: Number(val) })}
        className="flex flex-wrap gap-2"
      >
        {SPACER_HEIGHTS.map((h) => (
          <div key={h} className="flex items-center gap-1">
            <RadioGroupItem value={String(h)} id={`prop-spacer-${h}`} />
            <Label htmlFor={`prop-spacer-${h}`} className="text-xs">
              {h}px
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Block styles editor — common styling for every block
// ---------------------------------------------------------------------------

function BlockStylesEditor({
  styles,
  onChange,
  blockType,
}: {
  styles: BlockStyles;
  onChange: (s: BlockStyles) => void;
  blockType: string;
}) {
  const update = (patch: Partial<BlockStyles>) =>
    onChange({ ...styles, ...patch });

  const showTextStyles =
    blockType === "text" || blockType === "heading" || blockType === "columns";

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Style
      </p>

      {/* Background color */}
      <div className="space-y-1">
        <Label className="text-xs">Kolor tła</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={styles.backgroundColor || "#ffffff"}
            onChange={(e) => update({ backgroundColor: e.target.value })}
            className="h-8 w-8 cursor-pointer rounded border"
          />
          <Input
            value={styles.backgroundColor ?? ""}
            onChange={(e) =>
              update({
                backgroundColor: e.target.value || undefined,
              })
            }
            placeholder="brak"
            className="h-8 flex-1 font-mono text-xs"
          />
        </div>
      </div>

      {/* Padding */}
      <div className="space-y-1">
        <Label className="text-xs">
          Padding: {styles.paddingTop ?? 0} / {styles.paddingRight ?? 0} /{" "}
          {styles.paddingBottom ?? 0} / {styles.paddingLeft ?? 0}
        </Label>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-0.5">
            <span className="text-[10px] text-muted-foreground">Góra</span>
            <Slider
              value={[styles.paddingTop ?? 0]}
              onValueChange={([v]) => update({ paddingTop: v })}
              min={0}
              max={48}
              step={4}
            />
          </div>
          <div className="space-y-0.5">
            <span className="text-[10px] text-muted-foreground">Dół</span>
            <Slider
              value={[styles.paddingBottom ?? 0]}
              onValueChange={([v]) => update({ paddingBottom: v })}
              min={0}
              max={48}
              step={4}
            />
          </div>
          <div className="space-y-0.5">
            <span className="text-[10px] text-muted-foreground">Lewo</span>
            <Slider
              value={[styles.paddingLeft ?? 0]}
              onValueChange={([v]) => update({ paddingLeft: v })}
              min={0}
              max={48}
              step={4}
            />
          </div>
          <div className="space-y-0.5">
            <span className="text-[10px] text-muted-foreground">Prawo</span>
            <Slider
              value={[styles.paddingRight ?? 0]}
              onValueChange={([v]) => update({ paddingRight: v })}
              min={0}
              max={48}
              step={4}
            />
          </div>
        </div>
      </div>

      {/* Border */}
      <div className="space-y-1">
        <Label className="text-xs">
          Obramowanie: {styles.borderWidth ?? 0}px
        </Label>
        <Slider
          value={[styles.borderWidth ?? 0]}
          onValueChange={([v]) => update({ borderWidth: v })}
          min={0}
          max={4}
          step={1}
        />
        {(styles.borderWidth ?? 0) > 0 && (
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={styles.borderColor || "#e5e7eb"}
              onChange={(e) => update({ borderColor: e.target.value })}
              className="h-7 w-7 cursor-pointer rounded border"
            />
            <Input
              value={styles.borderColor ?? "#e5e7eb"}
              onChange={(e) => update({ borderColor: e.target.value })}
              className="h-7 flex-1 font-mono text-xs"
            />
          </div>
        )}
      </div>

      {/* Border radius */}
      <div className="space-y-1">
        <Label className="text-xs">
          Zaokrąglenie: {styles.borderRadius ?? 0}px
        </Label>
        <Slider
          value={[styles.borderRadius ?? 0]}
          onValueChange={([v]) => update({ borderRadius: v })}
          min={0}
          max={24}
          step={2}
        />
      </div>

      {/* Text styles — only for text-bearing blocks */}
      {showTextStyles && (
        <>
          <div className="space-y-1">
            <Label className="text-xs">Kolor tekstu</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={styles.textColor || "#333333"}
                onChange={(e) => update({ textColor: e.target.value })}
                className="h-8 w-8 cursor-pointer rounded border"
              />
              <Input
                value={styles.textColor ?? ""}
                onChange={(e) =>
                  update({ textColor: e.target.value || undefined })
                }
                placeholder="domyślny"
                className="h-8 flex-1 font-mono text-xs"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">
              Rozmiar tekstu: {styles.fontSize ?? 14}px
            </Label>
            <Slider
              value={[styles.fontSize ?? 14]}
              onValueChange={([v]) => update({ fontSize: v })}
              min={10}
              max={32}
              step={1}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Wyrównanie tekstu</Label>
            <div className="flex gap-1">
              {ALIGN_OPTIONS.map((a) => (
                <Button
                  key={a}
                  type="button"
                  variant={styles.textAlign === a ? "default" : "outline"}
                  size="sm"
                  className="h-7 flex-1 text-xs"
                  onClick={() => update({ textAlign: a })}
                >
                  {a === "left" ? "Lewo" : a === "center" ? "Środek" : "Prawo"}
                </Button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared: alignment picker
// ---------------------------------------------------------------------------

function AlignmentPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (align: "left" | "center" | "right") => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">Wyrównanie</Label>
      <div className="flex gap-1">
        {ALIGN_OPTIONS.map((a) => (
          <Button
            key={a}
            type="button"
            variant={value === a ? "default" : "outline"}
            size="sm"
            className="h-7 flex-1 text-xs capitalize"
            onClick={() => onChange(a)}
          >
            {a === "left" ? "Lewo" : a === "center" ? "Środek" : "Prawo"}
          </Button>
        ))}
      </div>
    </div>
  );
}
