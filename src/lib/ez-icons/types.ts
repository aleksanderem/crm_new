import type { ComponentType } from "react";

// Drop-in replacement for lucide-react's LucideIcon type.
// Accepts className and size props that the EzIcon wrapper understands.
export type EzIconType = ComponentType<{
  className?: string;
  size?: number;
}>;
