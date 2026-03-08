import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SPACER_HEIGHTS } from "@/lib/email-block-types";
import type { SpacerContent } from "@/lib/email-block-types";

interface SpacerBlockProps {
  content: SpacerContent;
  onChange: (content: SpacerContent) => void;
  isSelected: boolean;
}

export function SpacerBlock({
  content,
  onChange,
  isSelected,
}: SpacerBlockProps) {
  return (
    <div className="w-full">
      {/* Preview */}
      <div
        className="flex items-center justify-center text-xs text-muted-foreground"
        style={{ height: `${content.height || 24}px` }}
      >
        {isSelected ? `${content.height || 24}px` : ""}
      </div>

      {/* Inline editor */}
      {isSelected && (
        <div className="border-t px-3 py-3">
          <Label className="mb-2 block text-xs">Height</Label>
          <RadioGroup
            value={String(content.height || 24)}
            onValueChange={(val) =>
              onChange({ height: Number(val) })
            }
            className="flex flex-wrap gap-2"
          >
            {SPACER_HEIGHTS.map((h) => (
              <div key={h} className="flex items-center gap-1">
                <RadioGroupItem value={String(h)} id={`spacer-${h}`} />
                <Label htmlFor={`spacer-${h}`} className="text-xs">
                  {h}px
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>
      )}
    </div>
  );
}
