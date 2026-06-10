import { useState, forwardRef, useImperativeHandle } from "react";
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
  Package,
  UserCog,
  CalendarDaysIcon,
  UserPlus,
  ArrowLeft,
} from "@/lib/ez-icons";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { usePermissions, type Feature } from "@/hooks/use-permission";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type QuickCreateEntityType =
  | "contact"
  | "company"
  | "lead"
  | "activity"
  | "call"
  | "document"
  | "product"
  | "patient"
  | "appointment"
  | "treatment"
  | "package"
  | "employee"
  | "leave"
  | "user";

export type FormEntityType =
  | "contact"
  | "company"
  | "lead"
  | "product"
  | "call"
  | "document"
  | "patient"
  | "appointment"
  | "treatment"
  | "package"
  | "employee"
  | "activity"
  | "leave"
  | "user";

type EntityGroup = "crm" | "gabinet" | "system";

/** Maps each quick-create entity to the RBAC feature used for "create" checks. */
const entityFeatureMap: Record<QuickCreateEntityType, Feature | null> = {
  contact: "contacts",
  company: "companies",
  lead: "leads",
  activity: "activities",
  call: "calls",
  document: "documents",
  product: "products",
  patient: "gabinet_patients",
  appointment: "gabinet_appointments",
  treatment: "gabinet_treatments",
  package: "gabinet_packages",
  employee: "gabinet_employees",
  leave: "gabinet_employees",
  user: "team",
};

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
    hasForm: true,
    group: "crm",
  },
  {
    type: "call",
    i18nKey: "quickCreate.items.call",
    descriptionKey: "quickCreate.itemDesc.call",
    icon: Phone,
    avatarColor: "bg-rose-600/10 text-rose-600 dark:bg-rose-400/10 dark:text-rose-400",
    hasForm: true,
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
    type: "product",
    i18nKey: "quickCreate.items.product",
    descriptionKey: "quickCreate.itemDesc.product",
    icon: Package,
    avatarColor: "bg-emerald-600/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-400",
    hasForm: true,
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
  {
    type: "package",
    i18nKey: "quickCreate.items.package",
    descriptionKey: "quickCreate.itemDesc.package",
    icon: Package,
    avatarColor: "bg-cyan-600/10 text-cyan-600 dark:bg-cyan-400/10 dark:text-cyan-400",
    hasForm: true,
    group: "gabinet",
  },
  {
    type: "employee",
    i18nKey: "quickCreate.items.employee",
    descriptionKey: "quickCreate.itemDesc.employee",
    icon: UserCog,
    avatarColor: "bg-orange-600/10 text-orange-600 dark:bg-orange-400/10 dark:text-orange-400",
    hasForm: true,
    group: "gabinet",
  },
  {
    type: "leave",
    i18nKey: "quickCreate.items.leave",
    descriptionKey: "quickCreate.itemDesc.leave",
    icon: CalendarDaysIcon,
    avatarColor: "bg-yellow-600/10 text-yellow-600 dark:bg-yellow-400/10 dark:text-yellow-400",
    hasForm: true,
    group: "gabinet",
  },
  {
    type: "user",
    i18nKey: "quickCreate.items.user",
    descriptionKey: "quickCreate.itemDesc.user",
    icon: UserPlus,
    avatarColor: "bg-blue-600/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-400",
    hasForm: true,
    group: "system",
  },
];

export interface QuickCreateMenuHandle {
  open: (type?: FormEntityType) => void;
}

interface QuickCreateMenuProps {
  onNavigate: (entityType: QuickCreateEntityType) => void;
  renderForm: (
    type: FormEntityType,
    opts: { onSuccess: () => void; onCancel: () => void }
  ) => React.ReactNode;
}

export const QuickCreateMenu = forwardRef<QuickCreateMenuHandle, QuickCreateMenuProps>(
  function QuickCreateMenu({ onNavigate, renderForm }, ref) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<EntityGroup>("crm");
  const [selectedType, setSelectedType] = useState<FormEntityType | null>(null);
  const [directMode, setDirectMode] = useState(false);
  const { can: canCreate, loading: permLoading } = usePermissions("create");

  useImperativeHandle(ref, () => ({
    open: (type) => {
      setOpen(true);
      if (type) {
        const item = entityItems.find((i) => i.type === type);
        if (item) setActiveTab(item.group);
        setSelectedType(type);
        setDirectMode(true);
      } else {
        setSelectedType(null);
        setDirectMode(false);
      }
    },
  }));

  const handleEntityClick = (type: QuickCreateEntityType) => {
    const feature = entityFeatureMap[type];
    if (feature && !canCreate(feature)) return;

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
    setDirectMode(false);
  };

  const handleCancel = () => {
    if (directMode) {
      setOpen(false);
      setSelectedType(null);
      setDirectMode(false);
    } else {
      setSelectedType(null);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setSelectedType(null);
      setDirectMode(false);
    }
  };

  const visibleItems = entityItems.filter((i) => i.group === activeTab);
  const showBackButton = selectedType !== null && !directMode;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          data-testid="quick-create-trigger"
          className="bg-primary/10 text-primary hover:bg-primary/20 size-9"
          aria-label={t("layout.createNew")}
        >
          <CirclePlusIcon className="size-4" variant="stroke" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="flex flex-col sm:max-w-[480px]"
      >
        <SheetHeader>
          {showBackButton && (
            <button
              type="button"
              onClick={() => setSelectedType(null)}
              className="text-muted-foreground hover:text-foreground -ml-1 mb-1 flex items-center gap-1 self-start text-xs"
            >
              <ArrowLeft className="size-3.5" variant="stroke" />
              {t("common.back")}
            </button>
          )}
          <SheetTitle>
            {selectedType
              ? t(`quickCreate.formTitles.${selectedType}`)
              : t("quickCreate.dialogTitle")}
          </SheetTitle>
          {!selectedType && (
            <SheetDescription className="sr-only">
              {t("quickCreate.dialogTitle")}
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain py-4">
          {selectedType ? (
            renderForm(selectedType, {
              onSuccess: handleFormSuccess,
              onCancel: handleCancel,
            })
          ) : (
            <div className="flex flex-col gap-3">
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
                  <TabsTrigger value="system" className="flex-1">
                    {t("quickCreate.groupSystem")}
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <nav className="flex flex-col gap-1">
                {visibleItems.map((item) => {
                  const feature = entityFeatureMap[item.type];
                  const disabled = !permLoading && feature ? !canCreate(feature) : false;
                  return (
                    <EntityButton
                      key={item.type}
                      item={item}
                      selected={selectedType === item.type}
                      disabled={disabled}
                      disabledTooltip={t("permissions.cannotCreate")}
                      onClick={() => handleEntityClick(item.type)}
                      t={t}
                    />
                  );
                })}
              </nav>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
  }
);

function EntityButton({
  item,
  selected,
  disabled,
  disabledTooltip,
  onClick,
  t,
}: {
  item: (typeof entityItems)[number];
  selected: boolean;
  disabled?: boolean;
  disabledTooltip?: string;
  onClick: () => void;
  t: (key: string) => string;
}) {
  const btn = (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "flex items-center gap-3 rounded-lg p-2 text-left transition-colors",
        disabled
          ? "cursor-not-allowed opacity-50"
          : selected
            ? "bg-accent"
            : "hover:bg-accent/50"
      )}
      onClick={disabled ? undefined : onClick}
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

  if (disabled && disabledTooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{btn}</TooltipTrigger>
        <TooltipContent side="right">{disabledTooltip}</TooltipContent>
      </Tooltip>
    );
  }

  return btn;
}
