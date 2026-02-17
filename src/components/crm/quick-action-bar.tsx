import { Button } from "@/components/ui/button";
import { usePermission } from "@/hooks/use-permission";
import type { Feature, Action } from "@/hooks/use-permission";

export interface QuickAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  feature: Feature;
  action: Action;
}

interface QuickActionBarProps {
  actions: QuickAction[];
  /** Extra ReactNode rendered at the end of the bar (e.g. CsvExportButton) */
  extra?: React.ReactNode;
}

function PermissionButton({
  label,
  icon,
  onClick,
  feature,
  action,
}: QuickAction) {
  const { allowed, loading } = usePermission(feature, action);
  if (loading || !allowed) return null;
  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      {icon}
      {label}
    </Button>
  );
}

export function QuickActionBar({ actions, extra }: QuickActionBarProps) {
  if (actions.length === 0 && !extra) return null;
  return (
    <div className="flex items-center gap-2 py-2">
      {actions.map((action, i) => (
        <PermissionButton key={i} {...action} />
      ))}
      {extra}
    </div>
  );
}
