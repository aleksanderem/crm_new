import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface EzIconProps {
  name: string;
  size?: number;
  variant?: "stroke" | "solid" | "bulk" | "duotone" | "twotone";
  className?: string;
}

export function EzIcon({
  name,
  size,
  variant = "twotone",
  className,
}: EzIconProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.setAttribute("name", name);
    el.setAttribute("variant", variant);
    if (size != null) {
      el.setAttribute("size", String(size));
    } else {
      el.removeAttribute("size");
    }
  }, [name, variant, size]);

  return (
    <easier-icon
      ref={ref}
      // Set initial attributes for SSR/first paint - useEffect ensures they stick
      name={name}
      variant={variant}
      class={cn(className)}
    />
  );
}
