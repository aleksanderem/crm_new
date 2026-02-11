import { useTranslation } from "react-i18next";
import {
  Users,
  Building2,
  TrendingUp,
  CalendarCheck,
  Phone,
  FileText,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type QuickCreateEntityType =
  | "contact"
  | "company"
  | "lead"
  | "activity"
  | "call"
  | "document";

interface QuickCreateMenuProps {
  onCreateEntity: (entityType: QuickCreateEntityType) => void;
}

const createItems: {
  type: QuickCreateEntityType;
  i18nKey: string;
  icon: typeof Users;
}[] = [
  { type: "contact", i18nKey: "quickCreate.contact", icon: Users },
  { type: "company", i18nKey: "quickCreate.company", icon: Building2 },
  { type: "lead", i18nKey: "quickCreate.lead", icon: TrendingUp },
  { type: "activity", i18nKey: "quickCreate.activity", icon: CalendarCheck },
  { type: "call", i18nKey: "quickCreate.call", icon: Phone },
  { type: "document", i18nKey: "quickCreate.document", icon: FileText },
];

export function QuickCreateMenu({ onCreateEntity }: QuickCreateMenuProps) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
          <Plus className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {createItems.map((item) => (
          <DropdownMenuItem
            key={item.type}
            onClick={() => onCreateEntity(item.type)}
          >
            <item.icon className="mr-2 h-4 w-4" />
            {t(item.i18nKey)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
