import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  submitLabel,
  isSubmitting = false,
  className,
}: SidePanelProps) {
  const { t } = useTranslation();
  const keyboardSafeStyle = useKeyboardSafeSheetStyle(open);
  const contentRef = useRef<HTMLDivElement>(null);
  const resolvedSubmitLabel = submitLabel ?? t('common.create');

  // When the keyboard-safe style changes height (keyboard opens/closes on mobile),
  // the overflow-y-auto scroll container may reset its scrollTop. Re-scroll the
  // focused element into view so the user doesn't lose their position in the form.
  // rAF defers until after the browser has settled its own post-paint scroll reset,
  // which happens on iOS when a fixed-position container's height changes.
  const styleHeight = keyboardSafeStyle?.height;
  useLayoutEffect(() => {
    if (!contentRef.current) return;
    const active = document.activeElement as HTMLElement | null;
    if (active && active !== document.body && contentRef.current.contains(active)) {
      requestAnimationFrame(() => {
        active.scrollIntoView({ block: "nearest", behavior: "instant" });
      });
    }
  }, [styleHeight]);

  // When the keyboard is already open and the user taps a different field,
  // styleHeight doesn't change so the above effect never fires. Listen for
  // focusin on inputs/textareas inside the panel and scroll them into view.
  useEffect(() => {
    if (!open) return;
    const el = contentRef.current;
    if (!el) return;
    const handleFocusin = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || !el.contains(target)) return;
      const tag = target.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea") {
        requestAnimationFrame(() => {
          target.scrollIntoView({ block: "nearest", behavior: "instant" });
        });
      }
    };
    el.addEventListener("focusin", handleFocusin);
    return () => el.removeEventListener("focusin", handleFocusin);
  }, [open]);

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

        <div ref={contentRef} className="flex-1 overflow-y-auto overscroll-contain py-4">{children}</div>

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
              {resolvedSubmitLabel}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
