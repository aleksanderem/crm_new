import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FormDocumentStatus =
  | "draft"
  | "pending_signature"
  | "signed"
  | "completed"
  | "expired"
  | "voided";

interface DocumentStatusBadgeProps {
  status: FormDocumentStatus;
  className?: string;
}

// ---------------------------------------------------------------------------
// Status configuration
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  FormDocumentStatus,
  {
    labelKey: string;
    fallback: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    extraClass: string;
  }
> = {
  draft: {
    labelKey: "documents.status.draft",
    fallback: "Do wypełnienia",
    variant: "outline",
    extraClass: "border-orange-400 text-orange-700 bg-orange-50 dark:border-orange-600 dark:text-orange-400 dark:bg-orange-950",
  },
  pending_signature: {
    labelKey: "documents.status.pendingSignature",
    fallback: "Do podpisu",
    variant: "outline",
    extraClass: "border-yellow-400 text-yellow-700 bg-yellow-50 dark:border-yellow-600 dark:text-yellow-400 dark:bg-yellow-950",
  },
  signed: {
    labelKey: "documents.status.signed",
    fallback: "Podpisany",
    variant: "default",
    extraClass: "bg-green-600 hover:bg-green-600/80",
  },
  completed: {
    labelKey: "documents.status.completed",
    fallback: "Ukończony",
    variant: "default",
    extraClass: "bg-blue-600 hover:bg-blue-600/80",
  },
  expired: {
    labelKey: "documents.status.expired",
    fallback: "Wygasły",
    variant: "destructive",
    extraClass: "",
  },
  voided: {
    labelKey: "documents.status.voided",
    fallback: "Anulowany",
    variant: "destructive",
    extraClass: "",
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DocumentStatusBadge({
  status,
  className,
}: DocumentStatusBadgeProps) {
  const { t } = useTranslation();

  const config = STATUS_CONFIG[status];
  if (!config) return null;

  return (
    <Badge
      variant={config.variant}
      className={cn(config.extraClass, className)}
    >
      {t(config.labelKey, config.fallback)}
    </Badge>
  );
}

export type { DocumentStatusBadgeProps, FormDocumentStatus };
