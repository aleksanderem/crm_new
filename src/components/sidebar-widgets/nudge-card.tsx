import { CircleAlertIcon, TriangleAlertIcon, CircleCheckIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";

type NudgeSeverity = "red" | "yellow" | "green";

interface NudgeCardProps {
  message: string;
  messageValues?: Record<string, string | number>;
  severity: NudgeSeverity;
  icon?: string;
}

const severityStyles: Record<
  NudgeSeverity,
  { className: string; iconClass: string; descClass: string; Icon: typeof CircleAlertIcon }
> = {
  red: {
    className: "border-none bg-red-600/10 text-red-600 dark:bg-red-400/10 dark:text-red-400",
    iconClass: "text-red-600 dark:text-red-400",
    descClass: "text-red-600/80 dark:text-red-400/80",
    Icon: CircleAlertIcon,
  },
  yellow: {
    className: "border-none bg-amber-600/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400",
    iconClass: "text-amber-600 dark:text-amber-400",
    descClass: "text-amber-600/80 dark:text-amber-400/80",
    Icon: TriangleAlertIcon,
  },
  green: {
    className: "border-none bg-emerald-600/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-400",
    iconClass: "text-emerald-600 dark:text-emerald-400",
    descClass: "text-emerald-600/80 dark:text-emerald-400/80",
    Icon: CircleCheckIcon,
  },
};

export function NudgeCard({ message, messageValues, severity, icon }: NudgeCardProps) {
  const { t } = useTranslation();
  const cfg = severityStyles[severity];
  const resolvedMessage = t(message, {
    defaultValue: message,
    ...(messageValues ?? {}),
  });

  return (
    <Alert className={`px-3 py-2 ${cfg.className} [&>svg+div]:translate-y-0 [&>svg]:top-2.5 [&>svg]:left-3 [&>svg~*]:pl-6`}>
      {icon ? (
        <span className="absolute left-3 top-2.5 text-xs">{icon}</span>
      ) : (
        <cfg.Icon className={`h-3.5 w-3.5 ${cfg.iconClass}`} />
      )}
      <AlertDescription className={`text-[11px] leading-snug ${cfg.descClass}`}>
        {resolvedMessage}
      </AlertDescription>
    </Alert>
  );
}
