import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { usePermission } from "@/hooks/use-permission";
import type { Feature, Action } from "@/hooks/use-permission";
import {
  Calendar,
  Mail,
  FileText,
  Phone,
  Share2,
  Download,
} from "@/lib/ez-icons";

interface EntityQuickActionsProps {
  entityType: "lead" | "contact" | "company" | "patient" | "document";
  entityId: string;
  onAction?: (action: string) => void;
}

interface ActionConfig {
  key: string;
  labelKey: string;
  icon: React.ReactNode;
  feature: Feature;
  action: Action;
}

const ENTITY_ACTIONS: Record<string, ActionConfig[]> = {
  lead: [
    { key: "scheduleActivity", labelKey: "entityActions.scheduleActivity", icon: <Calendar className="mr-1.5 h-3.5 w-3.5" />, feature: "activities", action: "create" },
    { key: "sendEmail", labelKey: "entityActions.sendEmail", icon: <Mail className="mr-1.5 h-3.5 w-3.5" />, feature: "email", action: "create" },
    { key: "addNote", labelKey: "entityActions.addNote", icon: <FileText className="mr-1.5 h-3.5 w-3.5" />, feature: "leads", action: "edit" },
    { key: "logCall", labelKey: "entityActions.logCall", icon: <Phone className="mr-1.5 h-3.5 w-3.5" />, feature: "calls", action: "create" },
    { key: "share", labelKey: "entityActions.share", icon: <Share2 className="mr-1.5 h-3.5 w-3.5" />, feature: "leads", action: "edit" },
  ],
  contact: [
    { key: "scheduleActivity", labelKey: "entityActions.scheduleActivity", icon: <Calendar className="mr-1.5 h-3.5 w-3.5" />, feature: "activities", action: "create" },
    { key: "sendEmail", labelKey: "entityActions.sendEmail", icon: <Mail className="mr-1.5 h-3.5 w-3.5" />, feature: "email", action: "create" },
    { key: "addNote", labelKey: "entityActions.addNote", icon: <FileText className="mr-1.5 h-3.5 w-3.5" />, feature: "contacts", action: "edit" },
    { key: "logCall", labelKey: "entityActions.logCall", icon: <Phone className="mr-1.5 h-3.5 w-3.5" />, feature: "calls", action: "create" },
    { key: "share", labelKey: "entityActions.share", icon: <Share2 className="mr-1.5 h-3.5 w-3.5" />, feature: "contacts", action: "edit" },
  ],
  company: [
    { key: "scheduleActivity", labelKey: "entityActions.scheduleActivity", icon: <Calendar className="mr-1.5 h-3.5 w-3.5" />, feature: "activities", action: "create" },
    { key: "addNote", labelKey: "entityActions.addNote", icon: <FileText className="mr-1.5 h-3.5 w-3.5" />, feature: "companies", action: "edit" },
    { key: "share", labelKey: "entityActions.share", icon: <Share2 className="mr-1.5 h-3.5 w-3.5" />, feature: "companies", action: "edit" },
  ],
  patient: [
    { key: "bookAppointment", labelKey: "entityActions.bookAppointment", icon: <Calendar className="mr-1.5 h-3.5 w-3.5" />, feature: "gabinet_appointments", action: "create" },
    { key: "addDocument", labelKey: "entityActions.addDocument", icon: <FileText className="mr-1.5 h-3.5 w-3.5" />, feature: "documents", action: "create" },
    { key: "addNote", labelKey: "entityActions.addNote", icon: <FileText className="mr-1.5 h-3.5 w-3.5" />, feature: "gabinet_patients", action: "edit" },
    { key: "share", labelKey: "entityActions.share", icon: <Share2 className="mr-1.5 h-3.5 w-3.5" />, feature: "gabinet_patients", action: "edit" },
  ],
  document: [
    { key: "download", labelKey: "entityActions.download", icon: <Download className="mr-1.5 h-3.5 w-3.5" />, feature: "documents", action: "view" },
    { key: "share", labelKey: "entityActions.share", icon: <Share2 className="mr-1.5 h-3.5 w-3.5" />, feature: "documents", action: "edit" },
  ],
};

function TranslatedActionButton({
  config,
  onAction,
}: {
  config: ActionConfig;
  onAction?: (action: string) => void;
}) {
  const { t } = useTranslation();
  const { allowed, loading } = usePermission(config.feature, config.action);
  if (loading || !allowed) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => onAction?.(config.key)}
    >
      {config.icon}
      {t(config.labelKey)}
    </Button>
  );
}

export function EntityQuickActions({
  entityType,
  entityId,
  onAction,
}: EntityQuickActionsProps) {
  const actions = ENTITY_ACTIONS[entityType];
  if (!actions || actions.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-6 py-2 border-b bg-background">
      {actions.map((config) => (
        <TranslatedActionButton
          key={config.key}
          config={config}
          onAction={onAction}
        />
      ))}
    </div>
  );
}
