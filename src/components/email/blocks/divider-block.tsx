import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { DividerContent } from "@/lib/email-block-types";

interface DividerBlockProps {
  content: DividerContent;
  onChange: (content: DividerContent) => void;
  isSelected: boolean;
}

export function DividerBlock({
  content,
  onChange,
  isSelected,
}: DividerBlockProps) {
  return (
    <div className="w-full">
      {/* Preview */}
      <div className="px-3 py-4">
        <hr
          className="border-none"
          style={{
            height: `${content.thickness || 1}px`,
            backgroundColor: content.color || "#e5e7eb",
          }}
        />
      </div>

      {/* Inline editor */}
      {isSelected && (
        <div className="space-y-3 border-t px-3 py-3">
          <div className="space-y-1">
            <Label className="text-xs">Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={content.color || "#e5e7eb"}
                onChange={(e) =>
                  onChange({ ...content, color: e.target.value })
                }
                className="h-8 w-8 cursor-pointer rounded border"
              />
              <Input
                value={content.color || "#e5e7eb"}
                onChange={(e) =>
                  onChange({ ...content, color: e.target.value })
                }
                className="h-8 w-28 font-mono text-xs"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              Thickness: {content.thickness || 1}px
            </Label>
            <Slider
              value={[content.thickness || 1]}
              onValueChange={([val]) =>
                onChange({ ...content, thickness: val })
              }
              min={1}
              max={8}
              step={1}
              className="w-48"
            />
          </div>
        </div>
      )}
    </div>
  );
}
