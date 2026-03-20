import { Switch as HeroSwitch } from "@heroui/switch";
import * as React from "react";

type CheckedState = boolean | "indeterminate";

interface CheckboxProps {
  checked?: CheckedState;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: CheckedState) => void;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  value?: string;
  id?: string;
  className?: string;
  "aria-label"?: string;
  onClick?: React.MouseEventHandler;
  children?: React.ReactNode;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ checked, defaultChecked, onCheckedChange, disabled, className, onClick, children, ...props }, ref) => {
    const isSelected = checked === "indeterminate" ? true : (checked ?? false);

    return (
      <HeroSwitch
        isSelected={isSelected}
        defaultSelected={defaultChecked}
        onValueChange={(val) => onCheckedChange?.(val)}
        isDisabled={disabled}
        size="sm"
        className={className}
        ref={ref}
        aria-label={props["aria-label"]}
        id={props.id}
        name={props.name}
        value={props.value}
      >
        {children}
      </HeroSwitch>
    );
  }
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
export type { CheckboxProps };
