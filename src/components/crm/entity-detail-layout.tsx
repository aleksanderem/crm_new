import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, Plus } from "@/lib/ez-icons";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebarSlot } from "@/components/layout/sidebar-slot-context";
import { useHeaderSlot } from "@/components/layout/header-slot-context";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollShadow } from "@/components/ui/scroll-shadow";
import { Skeleton } from "@/components/ui/skeleton";

// Shared tab trigger class for consistent styling across entity detail views
export const tabTriggerClass =
  "relative rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 font-medium text-muted-foreground transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none";

export interface DetailField {
  label: string;
  value: React.ReactNode;
  fieldKey: string;
}

interface AssociationSection {
  title: string;
  count: number;
  onCreateNew?: () => void;
  children: React.ReactNode;
}

interface EntityDetailHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  headerSubtitle?: React.ReactNode;
  avatarUrl?: string;
  avatarFallback?: string;
  primaryAction?: { label: string; onClick: () => void };
  secondaryActions?: { label: string; onClick: () => void; variant?: "default" | "outline" | "destructive" }[];
  onEdit?: () => void;
  owner?: { name: string; avatarUrl?: string };
  onOwnerChange?: () => void;
  actionsMenu?: React.ReactNode;
  onBack?: () => void;
  breadcrumbs?: React.ReactNode;
}

export function EntityDetailHeader({
  title,
  subtitle,
  headerSubtitle: _headerSubtitle,
  avatarUrl,
  avatarFallback,
  primaryAction: _primaryAction,
  secondaryActions: _secondaryActions,
  onEdit: _onEdit,
  owner,
  onOwnerChange,
  actionsMenu: _actionsMenu,
  onBack: _onBack,
  breadcrumbs,
}: EntityDetailHeaderProps) {
  return (
    <div className="space-y-1">
      {breadcrumbs && <div className="text-xs">{breadcrumbs}</div>}
      <div className="flex items-center gap-3">
        <Avatar className="h-12 w-12 shrink-0">
          {avatarUrl && <AvatarImage src={avatarUrl} alt={title} />}
          <AvatarFallback className="text-base">
            {avatarFallback ?? title[0]?.toUpperCase() ?? "?"}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">{title}</h1>
          {owner && (
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={onOwnerChange}
            >
              <Avatar className="h-4 w-4">
                {owner.avatarUrl && <AvatarImage src={owner.avatarUrl} alt={owner.name} />}
                <AvatarFallback className="text-[8px]">{owner.name.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <span>{owner.name}</span>
            </button>
          )}
          {subtitle && (
            <div className="truncate text-sm text-muted-foreground">{subtitle}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function EntityDetailSkeleton() {
  return (
    <div className="flex h-full flex-col md:flex-row">
      <div className="w-full shrink-0 border-b md:w-[420px] md:border-b-0 md:border-r p-4 space-y-4">
        <div className="flex items-start gap-3">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
        <Skeleton className="h-8 w-full" />
        <Separator />
        <div className="space-y-3">
          <Skeleton className="h-4 w-20" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 p-4 space-y-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}

function EntityDetailNotFound({ onBack }: { onBack?: () => void }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center space-y-3">
        <h2 className="text-lg font-semibold">Not found</h2>
        <p className="text-sm text-muted-foreground">
          The requested record could not be found. It may have been deleted or you may not have access.
        </p>
        {onBack && (
          <Button variant="outline" size="sm" onClick={onBack}>
            &larr; Go back
          </Button>
        )}
      </div>
    </div>
  );
}

interface EntityDetailLayoutProps {
  variant?: "default" | "sidebar-slot";
  isLoading?: boolean;
  notFound?: boolean;
  onBack?: () => void;

  title: string;
  subtitle?: React.ReactNode;
  headerSubtitle?: React.ReactNode;
  avatarUrl?: string;
  avatarFallback?: string;
  primaryAction?: { label: string; onClick: () => void };
  secondaryActions?: { label: string; onClick: () => void; variant?: "default" | "outline" | "destructive" }[];
  onEdit?: () => void;
  owner?: { name: string; avatarUrl?: string };
  onOwnerChange?: () => void;
  actionsMenu?: React.ReactNode;

  fields: DetailField[];
  expandedFieldCount?: number;
  associations?: AssociationSection[];
  attachments?: React.ReactNode;

  tabs: {
    label: string;
    count?: number;
    content: React.ReactNode;
  }[];
  defaultTab?: string;
  /** Controlled active tab value. When set, tabs become controlled. */
  activeTab?: string;
  onTabChange?: (tab: string) => void;

  timelineFilter?: React.ReactNode;

  // Render hook slots
  beforeTabs?: React.ReactNode;
  breadcrumbs?: React.ReactNode;
  sidebarExtra?: React.ReactNode;
  /** Quick action items to include in the sidebar "Akcje" dropdown (sidebar-slot variant only). */
  quickActionItems?: { key: string; label: string; icon?: React.ReactNode; onClick: () => void }[];
}

export function EntityDetailLayout({
  variant = "default",
  isLoading,
  notFound,
  onBack,
  title,
  subtitle,
  headerSubtitle,
  avatarUrl,
  avatarFallback,
  primaryAction,
  secondaryActions,
  onEdit,
  owner,
  onOwnerChange,
  actionsMenu,
  fields,
  expandedFieldCount = 3,
  associations,
  attachments,
  tabs,
  defaultTab,
  activeTab,
  onTabChange,
  timelineFilter,
  beforeTabs,
  breadcrumbs,
  sidebarExtra,
  quickActionItems,
}: EntityDetailLayoutProps) {
  const [showAllFields, setShowAllFields] = useState(false);

  if (isLoading) {
    return <EntityDetailSkeleton />;
  }

  if (notFound) {
    return <EntityDetailNotFound onBack={onBack} />;
  }

  const visibleFields = showAllFields
    ? fields
    : fields.slice(0, expandedFieldCount);
  const hiddenCount = fields.length - expandedFieldCount;

  const defaultTabValue = defaultTab ?? tabs[0]?.label ?? "";

  const headerProps: EntityDetailHeaderProps = {
    title,
    subtitle,
    headerSubtitle,
    avatarUrl,
    avatarFallback,
    primaryAction,
    secondaryActions,
    onEdit,
    owner,
    onOwnerChange,
    actionsMenu,
    onBack,
    breadcrumbs,
  };

  const tabsContent = (
    <Tabs defaultValue={activeTab ? undefined : defaultTabValue} value={activeTab} onValueChange={onTabChange} className="flex flex-1 flex-col min-h-0">
      <div className="shrink-0 border-b px-4 pt-2">
        {beforeTabs}
        <TabsList className="h-9 bg-transparent p-0">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.label}
              value={tab.label}
              className={tabTriggerClass}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {tab.count}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        {timelineFilter && (
          <div className="pb-2 pt-1">{timelineFilter}</div>
        )}
      </div>

      <ScrollShadow className="flex-1 min-h-0 overflow-y-auto">
        {tabs.map((tab) => (
          <TabsContent
            key={tab.label}
            value={tab.label}
            className="m-0 p-4"
          >
            {tab.content}
          </TabsContent>
        ))}
      </ScrollShadow>
    </Tabs>
  );

  // sidebar-slot variant: entity details go into the sidebar slot,
  // header (avatar+name+actions) goes above tabs in main content area
  if (variant === "sidebar-slot") {
    return (
      <SidebarSlotEntityDetail
        headerProps={headerProps}
        fields={visibleFields}
        hiddenCount={hiddenCount}
        showAllFields={showAllFields}
        onToggleFields={() => setShowAllFields(!showAllFields)}
        associations={associations}
        attachments={attachments}
        sidebarExtra={sidebarExtra}
        quickActionItems={quickActionItems}
        header={<EntityDetailHeader {...headerProps} />}
      >
        {tabsContent}
      </SidebarSlotEntityDetail>
    );
  }

  // default variant: sidebar + content area
  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Left sidebar */}
      <ScrollShadow className="w-full shrink-0 border-b md:w-[420px] md:border-b-0 md:border-r overflow-y-auto">
        <div className="p-4 space-y-4">
          {/* Entity header */}
          <EntityDetailHeader {...headerProps} />

          <Separator />

          {/* Details section (display-only) */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold">Details</h2>

            <dl className="space-y-2">
              {visibleFields.map((field) => (
                <div key={field.fieldKey}>
                  <dt className="text-xs text-muted-foreground">{field.label}</dt>
                  <dd className="text-sm">{field.value ?? "—"}</dd>
                </div>
              ))}
            </dl>

            {hiddenCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground"
                onClick={() => setShowAllFields(!showAllFields)}
              >
                {showAllFields ? (
                  <>
                    Show less <ChevronUp className="ml-1 h-3 w-3" />
                  </>
                ) : (
                  <>
                    {hiddenCount} more fields{" "}
                    <ChevronDown className="ml-1 h-3 w-3" />
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Association sections */}
          {associations?.map((section, idx) => (
            <div key={section.title || `assoc-${idx}`} className="space-y-2">
              <Separator />
              {section.title && (
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    {section.title}{" "}
                    <span className="text-muted-foreground font-normal">
                      ({section.count})
                    </span>
                  </h3>
                  {section.onCreateNew && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={section.onCreateNew}
                    >
                      <Plus className="h-[17px] w-[17px]" variant="stroke" />
                  </Button>
                )}
              </div>
              )}
              {section.children}
            </div>
          ))}

          {/* Attachments */}
          {attachments && (
            <div className="space-y-2">
              <Separator />
              <h3 className="text-sm font-semibold">Attachments</h3>
              {attachments}
            </div>
          )}

          {/* Extra sidebar content slot */}
          {sidebarExtra && (
            <div className="space-y-2">
              <Separator />
              {sidebarExtra}
            </div>
          )}
        </div>
      </ScrollShadow>

      {/* Right content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {tabsContent}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SidebarSlotEntityDetail — pushes entity details into the sidebar slot
// ---------------------------------------------------------------------------

function SidebarSlotEntityDetail({
  headerProps,
  fields,
  hiddenCount,
  showAllFields,
  onToggleFields,
  associations,
  attachments,
  sidebarExtra,
  quickActionItems,
  header,
  children,
}: {
  headerProps: EntityDetailHeaderProps;
  fields: DetailField[];
  hiddenCount: number;
  showAllFields: boolean;
  onToggleFields: () => void;
  associations?: AssociationSection[];
  attachments?: React.ReactNode;
  sidebarExtra?: React.ReactNode;
  quickActionItems?: { key: string; label: string; icon?: React.ReactNode; onClick: () => void }[];
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  const { setContent } = useSidebarSlot();
  const { setBackAction } = useHeaderSlot();

  // Register back button in the top header bar
  useEffect(() => {
    if (headerProps.onBack) {
      setBackAction(headerProps.onBack);
    }
    return () => setBackAction(null);
  }, [headerProps.onBack, setBackAction]);

  // Build all action items for the "Akcje" dropdown
  const allActions: { label: string; icon?: React.ReactNode; onClick: () => void; variant?: string }[] = [];
  if (headerProps.primaryAction) {
    allActions.push({ label: headerProps.primaryAction.label, onClick: headerProps.primaryAction.onClick });
  }
  if (headerProps.onEdit) {
    allActions.push({ label: "Edit", onClick: headerProps.onEdit });
  }
  if (headerProps.secondaryActions) {
    for (const a of headerProps.secondaryActions) {
      allActions.push({ label: a.label, onClick: a.onClick, variant: a.variant });
    }
  }
  // Merge quick actions (schedule activity, add note, share, etc.)
  if (quickActionItems) {
    for (const qa of quickActionItems) {
      allActions.push({ label: qa.label, icon: qa.icon, onClick: qa.onClick });
    }
  }

  useEffect(() => {
    setContent(
      <div className="space-y-4">
        {/* Actions dropdown */}
        {allActions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-between">
                Akcje
                <ChevronDown className="ml-2 h-3 w-3" variant="stroke" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {allActions.map((action) => (
                <DropdownMenuItem
                  key={action.label}
                  onClick={action.onClick}
                  className={action.variant === "destructive" ? "text-destructive focus:text-destructive" : ""}
                >
                  {action.icon && <span className="mr-2">{action.icon}</span>}
                  {action.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Details section */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Details</h2>
          <dl className="space-y-2">
            {fields.map((field) => (
              <div key={field.fieldKey}>
                <dt className="text-xs text-muted-foreground">{field.label}</dt>
                <dd className="text-sm">{field.value ?? "—"}</dd>
              </div>
            ))}
          </dl>

          {hiddenCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground"
              onClick={onToggleFields}
            >
              {showAllFields ? (
                <>
                  Show less <ChevronUp className="ml-1 h-3 w-3" />
                </>
              ) : (
                <>
                  {hiddenCount} more fields <ChevronDown className="ml-1 h-3 w-3" />
                </>
              )}
            </Button>
          )}
        </div>

        {/* Associations */}
        {associations?.map((section, idx) => (
          <div key={section.title || `assoc-${idx}`} className="space-y-2">
            <Separator />
            {section.title && (
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  {section.title}{" "}
                  <span className="text-muted-foreground font-normal">
                    ({section.count})
                  </span>
                </h3>
                {section.onCreateNew && (
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={section.onCreateNew}>
                    <Plus className="h-[17px] w-[17px]" variant="stroke" />
                  </Button>
                )}
              </div>
            )}
            {section.children}
          </div>
        ))}

        {/* Attachments */}
        {attachments && (
          <div className="space-y-2">
            <Separator />
            <h3 className="text-sm font-semibold">Attachments</h3>
            {attachments}
          </div>
        )}

        {/* Extra */}
        {sidebarExtra && (
          <div className="space-y-2">
            <Separator />
            {sidebarExtra}
          </div>
        )}
      </div>
    );

    return () => setContent(null);
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Entity header above tabs in main content */}
      <div className="shrink-0 border-b p-4">
        {header}
      </div>
      {children}
    </div>
  );
}
