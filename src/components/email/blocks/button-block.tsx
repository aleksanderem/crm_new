import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ButtonContent } from "@/lib/email-block-types";

interface ButtonBlockProps {
  content: ButtonContent;
  onChange: (content: ButtonContent) => void;
  isSelected: boolean;
}

const ALIGN_OPTIONS = ["left", "center", "right"] as const;

export function ButtonBlock({
  content,
  onChange,
  isSelected,
}: ButtonBlockProps) {
  const alignClass =
    content.align === "left"
      ? "justify-start"
      : content.align === "right"
        ? "justify-end"
        : "justify-center";

  return (
    <div className="w-full">
      {/* Preview */}
      <div className={cn("flex px-3 py-3", alignClass)}>
        <a
          href={content.url || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded px-6 py-2.5 text-sm font-medium no-underline"
          style={{
            backgroundColor: content.bgColor || "#2563eb",
            color: content.textColor || "#ffffff",
          }}
          onClick={(e) => e.preventDefault()}
        >
          {content.label || "Button"}
        </a>
      </div>

      {/* Inline editor */}
      {isSelected && (
        <div className="space-y-3 border-t px-3 py-3">
          <div className="space-y-1">
            <Label className="text-xs">Label</Label>
            <Input
              value={content.label}
              onChange={(e) =>
                onChange({ ...content, label: e.target.value })
              }
              placeholder="Click here"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">URL</Label>
            <Input
              value={content.url}
              onChange={(e) =>
                onChange({ ...content, url: e.target.value })
              }
              placeholder="https://..."
              className="h-8 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Background color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={content.bgColor || "#2563eb"}
                  onChange={(e) =>
                    onChange({ ...content, bgColor: e.target.value })
                  }
                  className="h-8 w-8 cursor-pointer rounded border"
                />
                <Input
                  value={content.bgColor || "#2563eb"}
                  onChange={(e) =>
                    onChange({ ...content, bgColor: e.target.value })
                  }
                  className="h-8 flex-1 font-mono text-xs"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Text color</Label>
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
