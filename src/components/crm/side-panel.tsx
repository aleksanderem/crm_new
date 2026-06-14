import { useEffect, useState } from "react";
import { Loader2 } from "@/lib/ez-icons";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface SidePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  onSubmit?: () => void;
  submitLabel?: string;
  isSubmitting?: boolean;
  className?: string;
}

// iOS Safari does not shrink the layout viewport when the soft keyboard
// opens, so a `position: fixed` panel with `h-full` still covers the area
// behind the keyboard. Constrain the sheet to the visual viewport so the
// focused input (e.g. the rich text "Notatka" editor in the patient form)
// is not hidden under the keyboard.
function useKeyboardSafeSheetStyle(open: boolean): React.CSSProperties | undefined {
  const [style, setStyle] = useState<React.CSSProperties | undefined>(undefined);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      if (vv.height + 1 < window.innerHeight) {
        setStyle({
          top: vv.offsetTop,
          height: vv.height,
          bottom: "auto",
        });
      } else {
        setStyle(undefined);
      }
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [open]);

  return style;
}

export function SidePanel({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSubmit,
  submitLabel = "Create",
  isSubmitting = false,
  className,
}: SidePanelProps) {
  const { t } = useTranslation();
  const keyboardSafeStyle = useKeyboardSafeSheetStyle(open);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "flex flex-col sm:max-w-[480px]",
          className
        )}
        style={keyboardSafeStyle}
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain py-4">{children}</div>

        {onSubmit && (
          <SheetFooter className="border-t pt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={onSubmit} disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {submitLabel}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
