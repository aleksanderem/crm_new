import type { ComponentType } from "react";

// Drop-in replacement for lucide-react's LucideIcon type.
// Accepts className, size, and variant props that the EzIcon wrapper understands.
export type EzIconType = ComponentType<{
  className?: string;
  size?: number;
  variant?: "stroke" | "solid" | "bulk" | "duotone" | "twotone";
  fill?: string;
  stroke?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
}>;
