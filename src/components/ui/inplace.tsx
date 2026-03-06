/**
 * PrimeReact v11 Inplace compound component.
 *
 * Implements the same API as primereact/inplace (Root, Display, Content, Close)
 * with Tailwind styling. Uses the PrimeReact v11 compound component pattern:
 *   active, onActiveChange, disabled
 *
 * @see https://v11.primereact.org/docs/styled/components/inplace
 */
import { createContext, useContext, useState, useCallback, type ReactNode, type MouseEvent } from "react";
import { cn } from "@/lib/utils";

// --- Context ---

interface InplaceContextValue {
  active: boolean;
  setActive: (v: boolean) => void;
  disabled: boolean;
}

const InplaceContext = createContext<InplaceContextValue | null>(null);

function useInplace() {
  const ctx = useContext(InplaceContext);
  if (!ctx) throw new Error("Inplace.* must be used within Inplace.Root");
  return ctx;
}

// --- Root ---

interface RootProps {
  children: ReactNode;
  active?: boolean;
  defaultActive?: boolean;
  onActiveChange?: (e: { active: boolean }) => void;
  disabled?: boolean;
  className?: string;
}

function Root({ children, active: controlledActive, defaultActive = false, onActiveChange, disabled = false, className }: RootProps) {
  const [uncontrolledActive, setUncontrolledActive] = useState(defaultActive);
  const isControlled = controlledActive !== undefined;
  const active = isControlled ? controlledActive : uncontrolledActive;

  const setActive = useCallback(
    (v: boolean) => {
      if (disabled) return;
      if (!isControlled) setUncontrolledActive(v);
      onActiveChange?.({ active: v });
    },
    [disabled, isControlled, onActiveChange]
  );

  return (
    <InplaceContext.Provider value={{ active, setActive, disabled }}>
      <div className={cn("inline-block", className)} aria-live="polite" onClick={(e: MouseEvent) => e.stopPropagation()}>
        {children}
      </div>
    </InplaceContext.Provider>
  );
}

// --- Display ---

interface DisplayProps {
  children: ReactNode;
  className?: string;
}

function Display({ children, className }: DisplayProps) {
  const { active, setActive, disabled } = useInplace();
  if (active) return null;

  return (
    <div
      className={cn(
        "min-h-[2rem] px-2 py-1 rounded cursor-pointer hover:bg-accent transition-colors inline-flex items-center",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={() => setActive(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setActive(true);
        }
      }}
    >
      {children}
    </div>
  );
}

// --- Content ---

interface ContentProps {
  children: ReactNode;
  className?: string;
}

function Content({ children, className }: ContentProps) {
  const { active } = useInplace();
  if (!active) return null;
  return <div className={cn("inline-flex items-center gap-1", className)}>{children}</div>;
}

// --- Close ---

interface CloseProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

function Close({ children, className, onClick }: CloseProps) {
  const { setActive } = useInplace();
  return (
    <button
      type="button"
      className={cn("text-xs text-muted-foreground hover:text-foreground", className)}
      onClick={() => {
        setActive(false);
        onClick?.();
      }}
    >
      {children}
    </button>
  );
}

// --- Export as compound ---

export const Inplace = { Root, Display, Content, Close };
