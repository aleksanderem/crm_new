import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { ImageContent } from "@/lib/email-block-types";

interface ImageBlockProps {
  content: ImageContent;
  onChange: (content: ImageContent) => void;
  isSelected: boolean;
}

const ALIGN_OPTIONS = ["left", "center", "right"] as const;

export function ImageBlock({ content, onChange, isSelected }: ImageBlockProps) {
  const alignClass =
    content.align === "left"
      ? "justify-start"
      : content.align === "right"
        ? "justify-end"
        : "justify-center";

  return (
    <div className="w-full">
      {/* Preview */}
      <div className={cn("flex px-3 py-2", alignClass)}>
        {content.url ? (
          <img
            src={content.url}
            alt={content.alt || ""}
            className="max-w-full rounded"
            style={{ width: `${content.width ?? 100}%` }}
          />
        ) : (
          <div className="flex h-32 w-full items-center justify-center rounded border-2 border-dashed border-muted-foreground/30 text-sm text-muted-foreground">
            No image URL set
          </div>
        )}
      </div>

      {/* Inline editor */}
      {isSelected && (
        <div className="space-y-3 border-t px-3 py-3">
          <div className="space-y-1">
            <Label className="text-xs">Image URL</Label>
            <Input
              value={content.url}
              onChange={(e) =>
                onChange({ ...content, url: e.target.value })
              }
              placeholder="https://example.com/image.jpg"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Alt text</Label>
            <Input
              value={content.alt}
              onChange={(e) =>
                onChange({ ...content, alt: e.target.value })
              }
              placeholder="Image description"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Link URL (optional)</Label>
            <Input
              value={content.linkUrl ?? ""}
              onChange={(e) =>
                onChange({ ...content, linkUrl: e.target.value })
              }
              placeholder="https://..."
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Width: {content.width ?? 100}%</Label>
            <Slider
              value={[content.width ?? 100]}
              onValueChange={([val]) =>
                onChange({ ...content, width: val })
              }
              min={10}
              max={100}
              step={5}
              className="w-full"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Alignment</Label>
            <div className="flex gap-1">
              {ALIGN_OPTIONS.map((a) => (
                <Button
                  key={a}
                  type="button"
                  variant={content.align === a ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs capitalize"
                  onClick={() => onChange({ ...content, align: a })}
                >
                  {a}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
