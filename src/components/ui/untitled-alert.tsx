import * as React from "react";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle, AlertTriangle, Info } from "@/lib/ez-icons";

type AlertTheme = "brand" | "gray" | "error" | "warning" | "success";

const themeStyles: Record<AlertTheme, { container: string; icon: string; iconComponent: React.ElementType }> = {
  brand: {
    container: "border-[var(--color-brand-200)] bg-[var(--color-brand-25)] text-[var(--color-brand-700)]",
    icon: "text-[var(--color-brand-600)]",
    iconComponent: Info,
  },
  gray: {
    container: "border-[var(--color-gray-200)] bg-[var(--color-gray-25)] text-[var(--color-gray-700)]",
    icon: "text-[var(--color-gray-500)]",
    iconComponent: Info,
  },
  error: {
    container: "border-[var(--color-error-200)] bg-[var(--color-error-25)] text-[var(--color-error-700)]",
    icon: "text-[var(--color-error-600)]",
    iconComponent: AlertCircle,
  },
  warning: {
    container: "border-[var(--color-warning-200)] bg-[var(--color-warning-50)] text-[var(--color-warning-700)]",
    icon: "text-[var(--color-warning-600)]",
    iconComponent: AlertTriangle,
  },
  success: {
    container: "border-[var(--color-success-200)] bg-[var(--color-success-50)] text-[var(--color-success-700)]",
    icon: "text-[var(--color-success-600)]",
    iconComponent: CheckCircle,
  },
};

interface UntitledAlertProps {
  theme?: AlertTheme;
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export function UntitledAlert({ theme = "brand", children, icon, className }: UntitledAlertProps) {
  const styles = themeStyles[theme];
  const IconComponent = styles.iconComponent;

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3 text-sm",
        styles.container,
        className,
      )}
    >
      <span className={cn("mt-0.5 shrink-0", styles.icon)}>
        {icon ?? <IconComponent className="h-5 w-5" variant="stroke" />}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
