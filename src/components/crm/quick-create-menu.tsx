import { useTranslation } from "react-i18next";
import {
  Users,
  Building2,
  TrendingUp,
  CalendarCheck,
  Phone,
  FileText,
  CirclePlusIcon,
} from "@/lib/ez-icons";
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
        <Button
          variant="ghost"
          size="icon"
          className="bg-primary/10 text-primary hover:bg-primary/20 size-9"
        >
          <CirclePlusIcon className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-0">
        <div className="bg-muted grid grid-cols-3 gap-4 rounded-lg px-4 py-5">
          {createItems.map((item) => (
            <DropdownMenuItem
              key={item.type}
              className="flex flex-col items-center gap-2 rounded-md p-2"
              onClick={() => onCreateEntity(item.type)}
            >
              <div className="bg-background flex size-10 items-center justify-center rounded-lg shadow-sm">
                <item.icon className="text-foreground size-5" />
              </div>
              <span className="text-muted-foreground text-xs font-medium">
                {t(item.i18nKey)}
              </span>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
