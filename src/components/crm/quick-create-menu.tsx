import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Users,
  Building2,
  TrendingUp,
  CalendarCheck,
  Phone,
  FileText,
  CirclePlusIcon,
  HeartPulse,
  CalendarClockIcon,
  Stethoscope,
} from "@/lib/ez-icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

export type QuickCreateEntityType =
  | "contact"
  | "company"
  | "lead"
  | "activity"
  | "call"
  | "document"
  | "patient"
  | "appointment"
  | "treatment";

export type FormEntityType = "contact" | "company" | "lead" | "patient" | "appointment" | "treatment";

type EntityGroup = "crm" | "gabinet";

const entityItems: {
  type: QuickCreateEntityType;
  i18nKey: string;
  descriptionKey: string;
  icon: typeof Users;
  avatarColor: string;
  hasForm: boolean;
  group: EntityGroup;
}[] = [
  {
    type: "contact",
    i18nKey: "quickCreate.items.contact",
    descriptionKey: "quickCreate.itemDesc.contact",
    icon: Users,
    avatarColor: "bg-sky-600/10 text-sky-600 dark:bg-sky-400/10 dark:text-sky-400",
    hasForm: true,
    group: "crm",
  },
  {
    type: "company",
    i18nKey: "quickCreate.items.company",
    descriptionKey: "quickCreate.itemDesc.company",
    icon: Building2,
    avatarColor: "bg-green-600/10 text-green-600 dark:bg-green-400/10 dark:text-green-400",
    hasForm: true,
    group: "crm",
  },
  {
    type: "lead",
    i18nKey: "quickCreate.items.lead",
    descriptionKey: "quickCreate.itemDesc.lead",
    icon: TrendingUp,
    avatarColor: "bg-amber-600/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400",
    hasForm: true,
    group: "crm",
  },
  {
    type: "activity",
    i18nKey: "quickCreate.items.activity",
    descriptionKey: "quickCreate.itemDesc.activity",
    icon: CalendarCheck,
    avatarColor: "bg-purple-600/10 text-purple-600 dark:bg-purple-400/10 dark:text-purple-400",
    hasForm: false,
    group: "crm",
  },
  {
    type: "call",
    i18nKey: "quickCreate.items.call",
    descriptionKey: "quickCreate.itemDesc.call",
    icon: Phone,
    avatarColor: "bg-rose-600/10 text-rose-600 dark:bg-rose-400/10 dark:text-rose-400",
    hasForm: false,
    group: "crm",
  },
  {
    type: "document",
    i18nKey: "quickCreate.items.document",
    descriptionKey: "quickCreate.itemDesc.document",
    icon: FileText,
    avatarColor: "bg-slate-600/10 text-slate-600 dark:bg-slate-400/10 dark:text-slate-400",
    hasForm: false,
    group: "crm",
  },
  {
    type: "patient",
    i18nKey: "quickCreate.items.patient",
    descriptionKey: "quickCreate.itemDesc.patient",
    icon: HeartPulse,
    avatarColor: "bg-pink-600/10 text-pink-600 dark:bg-pink-400/10 dark:text-pink-400",
    hasForm: true,
    group: "gabinet",
  },
  {
    type: "appointment",
    i18nKey: "quickCreate.items.appointment",
    descriptionKey: "quickCreate.itemDesc.appointment",
    icon: CalendarClockIcon,
    avatarColor: "bg-teal-600/10 text-teal-600 dark:bg-teal-400/10 dark:text-teal-400",
    hasForm: true,
    group: "gabinet",
  },
  {
    type: "treatment",
    i18nKey: "quickCreate.items.treatment",
    descriptionKey: "quickCreate.itemDesc.treatment",
    icon: Stethoscope,
    avatarColor: "bg-indigo-600/10 text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-400",
    hasForm: true,
    group: "gabinet",
  },
];

interface QuickCreateMenuProps {
  onNavigate: (entityType: QuickCreateEntityType) => void;
  renderForm: (
    type: FormEntityType,
    opts: { onSuccess: () => void; onCancel: () => void }
  ) => React.ReactNode;
}

export function QuickCreateMenu({
  onNavigate,
  renderForm,
}: QuickCreateMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<EntityGroup>("crm");
  const [selectedType, setSelectedType] = useState<FormEntityType | null>(null);

  const handleEntityClick = (type: QuickCreateEntityType) => {
    const item = entityItems.find((i) => i.type === type);
    if (item?.hasForm) {
      setSelectedType(type as FormEntityType);
    } else {
      setOpen(false);
      onNavigate(type);
    }
  };

  const handleFormSuccess = () => {
    setOpen(false);
    setSelectedType(null);
  };

  const handleCancel = () => {
    setSelectedType(null);
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setSelectedType(null);
    }
  };

  const visibleItems = entityItems.filter((i) => i.group === activeTab);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="bg-primary/10 text-primary hover:bg-primary/20 size-9"
        >
          <CirclePlusIcon className="size-5" />
        </Button>
      </DialogTrigger>
      <DialogContent
        className={cn(
          "[&>[data-slot=dialog-close]>svg]:size-5",
          selectedType ? "md:max-w-3xl" : "md:max-w-sm"
        )}
      >
        <DialogHeader>
          <DialogTitle>
            {selectedType
              ? t(`quickCreate.formTitles.${selectedType}`)
              : t("quickCreate.dialogTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-6 max-md:flex-col">
          {/* Left: tabs + entity list */}
          <div
            className={cn(
              "flex flex-col gap-3",
              selectedType ? "md:min-w-52 md:border-r md:pr-6" : "w-full"
            )}
          >
            <Tabs
              value={activeTab}
              onValueChange={(v) => {
                setActiveTab(v as EntityGroup);
                setSelectedType(null);
              }}
            >
              <TabsList className="w-full">
                <TabsTrigger value="crm" className="flex-1">
                  CRM
                </TabsTrigger>
                <TabsTrigger value="gabinet" className="flex-1">
                  {t("quickCreate.groupGabinet")}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <nav className="flex flex-col gap-1">
              {visibleItems.map((item) => (
                <EntityButton
                  key={item.type}
                  item={item}
                  selected={selectedType === item.type}
                  onClick={() => handleEntityClick(item.type)}
                  t={t}
                />
              ))}
            </nav>
          </div>

          {/* Right: form area */}
          {selectedType && (
            <ScrollArea className="max-h-[65vh] flex-1">
              <div className="pr-3">
                {renderForm(selectedType, {
                  onSuccess: handleFormSuccess,
                  onCancel: handleCancel,
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EntityButton({
  item,
  selected,
  onClick,
  t,
}: {
  item: (typeof entityItems)[number];
  selected: boolean;
  onClick: () => void;
  t: (key: string) => string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex items-center gap-3 rounded-lg p-2 text-left transition-colors",
        selected ? "bg-accent" : "hover:bg-accent/50"
      )}
      onClick={onClick}
    >
      <Avatar className="size-9 rounded-md">
        <AvatarFallback className={cn("rounded-[inherit]", item.avatarColor)}>
          <item.icon className="size-4" />
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col">
        <span className="text-sm font-medium">{t(item.i18nKey)}</span>
        <span className="text-muted-foreground text-xs">
          {t(item.descriptionKey)}
        </span>
      </div>
    </button>
  );
}
