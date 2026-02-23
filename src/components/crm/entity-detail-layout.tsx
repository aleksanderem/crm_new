import { useState } from "react";
import { ChevronDown, ChevronUp, Plus } from "@/lib/ez-icons";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

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

interface EntityDetailLayoutProps {
  title: string;
  subtitle?: React.ReactNode;
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

  timelineFilter?: React.ReactNode;
}

export function EntityDetailLayout({
  title,
  subtitle,
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
  timelineFilter,
}: EntityDetailLayoutProps) {
  const [showAllFields, setShowAllFields] = useState(false);

  const visibleFields = showAllFields
    ? fields
    : fields.slice(0, expandedFieldCount);
  const hiddenCount = fields.length - expandedFieldCount;

  const defaultTabValue = defaultTab ?? tabs[0]?.label ?? "";

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Left sidebar */}
      <ScrollArea className="w-full shrink-0 border-b md:w-[280px] md:border-b-0 md:border-r">
        <div className="p-4 space-y-4">
          {/* Entity header */}
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Avatar className="h-16 w-16 shrink-0">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={title} />}
                <AvatarFallback className="text-lg">
                  {avatarFallback ?? title[0]?.toUpperCase() ?? "?"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-lg font-semibold">{title}</h1>
                {subtitle && (
                  <div className="truncate text-sm text-muted-foreground">
                    {subtitle}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {primaryAction && (
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={primaryAction.onClick}
                >
                  {primaryAction.label}
                </Button>
              )}
              {onEdit && (
                <Button variant="outline" size="sm" onClick={onEdit}>
                  Edit
                </Button>
              )}
              {secondaryActions?.map((action) => (
                <Button
                  key={action.label}
                  variant={action.variant === "destructive" ? "destructive" : "outline"}
                  size="sm"
                  onClick={action.onClick}
                >
                  {action.label}
                </Button>
              ))}
              {actionsMenu}
            </div>

            {owner && (
              <button
                type="button"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                onClick={onOwnerChange}
              >
                <Avatar className="h-5 w-5">
                  {owner.avatarUrl && (
                    <AvatarImage src={owner.avatarUrl} alt={owner.name} />
                  )}
                  <AvatarFallback className="text-[10px]">
                    {owner.name[0]}
                  </AvatarFallback>
                </Avatar>
                <span>Owner: {owner.name}</span>
              </button>
            )}
          </div>

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
          {associations?.map((section) => (
            <div key={section.title} className="space-y-2">
              <Separator />
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
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
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
        </div>
      </ScrollArea>

      {/* Right content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Tabs defaultValue={defaultTabValue} className="flex flex-1 flex-col">
          <div className="shrink-0 border-b px-4 pt-2">
            <TabsList className="h-9 bg-transparent p-0">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.label}
                  value={tab.label}
                  className="rounded-none border-b-2 border-transparent px-3 pb-2 pt-1 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
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

          <ScrollArea className="flex-1">
            {tabs.map((tab) => (
              <TabsContent
                key={tab.label}
                value={tab.label}
                className="m-0 p-4"
              >
                {tab.content}
              </TabsContent>
            ))}
          </ScrollArea>
        </Tabs>
      </div>
    </div>
  );
}
