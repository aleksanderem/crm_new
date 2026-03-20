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
  size = 16,
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

  // React maps className to "classname" attribute on custom elements
  // instead of "class". Use ref to apply it correctly.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const classes = cn(className);
    if (classes) {
      el.setAttribute("class", classes);
    } else {
      el.removeAttribute("class");
    }
  }, [className]);

  return (
    <easier-icon
      ref={ref}
      name={name}
      variant={variant}
    />
  );
}
