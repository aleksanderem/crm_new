import { useState, useMemo } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "@cvx/_generated/api";
import { useSupabaseCallsList } from "@/hooks/use-supabase-calls";
import { useSupabaseOrganizationMembers } from "@/hooks/use-supabase-organizations";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { CrmDataTable, useColumnVisibility, useAllColumns } from "@/components/crm/enhanced-data-table";
import type { CrmColumn } from "@/components/crm/enhanced-data-table";
import { DataListFilterBar } from "@/components/crm/data-list-filter-bar";
import { SidePanel } from "@/components/crm/side-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";
import { plateJsonToText } from "@/components/plate-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { callOutcomeOptions } from "@/lib/options";
import { Plus, Pencil, Trash2, X } from "@/lib/ez-icons";
import { useSidebarDispatch } from "@/components/layout/sidebar-context";
import type { SavedView, FieldDef, FilterCondition } from "@/components/crm/types";
import { Id } from "@cvx/_generated/dataModel";
import type { MappedCall } from "@/lib/supabase/mappers/calls";
import { useSavedViews, applyFilterConditions } from "@/hooks/use-saved-views";
import { useTagDefinitions } from "@/hooks/use-tag-definitions";
import { useCategoryDefinitions } from "@/hooks/use-category-definitions";
import { TagsManagerSlideout } from "@/components/categories-tags/tags-manager-slideout";
import { CategoriesManagerSlideout } from "@/components/categories-tags/categories-manager-slideout";
import { TagsPicker } from "@/components/categories-tags/tags-picker";
import { CategoryPicker } from "@/components/categories-tags/category-picker";
import { AvatarLabelGroup } from "@untitled/base/avatar/avatar-label-group";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";

type CallsNudgeFilter = "no-outcome";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/calls/"
)({
  component: CallsPage,
  validateSearch: (
    search: Record<string, unknown>,
  ): { nudge?: CallsNudgeFilter } => {
    const nudge =
      search.nudge === "no-outcome"
        ? (search.nudge as CallsNudgeFilter)
        : undefined;
    return { nudge };
  },
});

type Call = MappedCall;
type CallOutcome = "busy" | "leftVoiceMessage" | "movedConversationForward" | "wrongNumber" | "noAnswer";

const OUTCOME_CONFIG: Record<CallOutcome, { color: string; labelKey: string }> = {
  busy: { color: "bg-red-100 text-red-700", labelKey: "calls.outcomes.busy" },
  leftVoiceMessage: { color: "bg-yellow-100 text-yellow-700", labelKey: "calls.outcomes.leftVoiceMessage" },
  movedConversationForward: { color: "bg-green-100 text-green-700", labelKey: "calls.outcomes.movedConversationForward" },
  wrongNumber: { color: "bg-gray-100 text-gray-700", labelKey: "calls.outcomes.wrongNumber" },
  noAnswer: { color: "bg-orange-100 text-orange-700", labelKey: "calls.outcomes.noAnswer" },
};

function CallsPage() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const { nudge: nudgeFilter } = useSearch({ from: Route.id });
  const systemViews: SavedView[] = useMemo(() => [
    { id: "all", name: t('calls.views.all'), isSystem: true, isDefault: true },
  ], [t]);

  const {
    views, activeViewId, onViewChange, onCreateView, onDeleteView, applyFilters,
  } = useSavedViews({ organizationId, entityType: "call", systemViews });
  const { tags } = useTagDefinitions(organizationId);
  const { categories } = useCategoryDefinitions(organizationId, "call");

  const filterableFields = useMemo((): FieldDef[] => [
    {
      id: "outcome", label: t('calls.outcome'), type: "select",
      options: callOutcomeOptions(t),
    },
    { id: "callDate", label: t('calls.callDate'), type: "date" },
    { id: "duration", label: t('calls.duration'), type: "number" },
    { id: "note", label: t('calls.note'), type: "text" },
    { id: "createdAt", label: t('common.created'), type: "date" },
    { id: "tagIds", label: t('common.tags', { defaultValue: "Tagi" }), type: "multiSelect" as const, options: tags.map(tag => ({ label: tag.name, value: tag._id })) },
    { id: "categoryId", label: t('common.category', { defaultValue: "Kategoria" }), type: "select" as const, options: categories.map(cat => ({ label: cat.name, value: cat._id })) },
  ], [t, tags, categories]);
  const [tagsSlideoutOpen, setTagsSlideoutOpen] = useState(false);
  const [categoriesSlideoutOpen, setCategoriesSlideoutOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingCall, setEditingCall] = useState<Call | null>(null);
  const [savedViewsDialogOpen, setSavedViewsDialogOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [activeFilters, setActiveFilters] = useState<FilterCondition[]>([]);

  // Sidebar dispatch handlers
  useSidebarDispatch("savedViews", () => setSavedViewsDialogOpen(true));
  useSidebarDispatch("manageTags", () => setTagsSlideoutOpen(true));
  useSidebarDispatch("manageCategories", () => setCategoriesSlideoutOpen(true));

  // Form state
  const [outcome, setOutcome] = useState<CallOutcome>("noAnswer");
  const [callDate, setCallDate] = useState("");
  const [note, setNote] = useState("");
  const [tagIds, setTagIds] = useState<Id<"tagDefinitions">[]>([]);
  const [categoryId, setCategoryId] = useState<Id<"categoryDefinitions"> | undefined>(undefined);

  const { data: allCalls = [], isLoading } = useSupabaseCallsList(organizationId);

  const { data: members } = useSupabaseOrganizationMembers(organizationId);

  const userMap = useMemo(() => {
    const map = new Map<Id<"users">, { name?: string; email?: string }>();
    if (!members) return map;
    for (const m of members) {
      if (!m.user) continue;
      map.set(m.user._id as Id<"users">, {
        name: m.user.name ?? undefined,
        email: m.user.email ?? undefined,
      });
    }
    return map;
  }, [members]);

  const callIds = useMemo(() => allCalls.map((c) => c._id), [allCalls]);

  const getRelationshipsForSources = useAction(api.relationships.getForSources);
  const { data: relMap } = useQuery({
    queryKey: ["relationships.getForSources", organizationId, "call", callIds],
    queryFn: () =>
      getRelationshipsForSources({
        organizationId,
        sourceType: "call",
        sourceIds: callIds,
      }),
    enabled: callIds.length > 0,
  });
  const calls = useMemo(() => {
    let data = allCalls;
    if (nudgeFilter === "no-outcome") {
      data = data.filter((c: any) => !c.outcome);
    }
    const withConditions = applyFilterConditions(data, activeFilters);
    const filtered = applyFilters(withConditions) as typeof allCalls;
    if (!searchValue.trim()) return filtered;
    const q = searchValue.toLowerCase();
    return filtered.filter((c: any) => c.note?.toLowerCase().includes(q));
  }, [allCalls, activeFilters, applyFilters, searchValue, nudgeFilter]);

  const createCall = useAction(api.calls.create);
  const updateCall = useAction(api.calls.update);
  const removeCall = useAction(api.calls.remove);

  const resetForm = () => {
    setOutcome("noAnswer");
    setCallDate(new Date().toISOString().slice(0, 16));
    setNote("");
    setTagIds([]);
    setCategoryId(undefined);
    setEditingCall(null);
  };

  const openCreatePanel = () => {
    resetForm();
    setPanelOpen(true);
  };

  const openEditPanel = (call: Call) => {
    setEditingCall(call);
    setOutcome(call.outcome as CallOutcome);
    setCallDate(new Date(call.callDate).toISOString().slice(0, 16));
    setNote(call.note ?? "");
    setTagIds((call.tagIds as Id<"tagDefinitions">[]) ?? []);
    setCategoryId(call.categoryId as Id<"categoryDefinitions"> | undefined);
    setPanelOpen(true);
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!callDate) return;
    setIsSubmitting(true);
    try {
      if (editingCall) {
        await updateCall({
          organizationId,
          callId: editingCall._id,
          outcome,
          callDate: new Date(callDate).getTime(),
          note: note.trim() || undefined,
          tagIds,
          categoryId,
        });
      } else {
        await createCall({
          organizationId,
          outcome,
          callDate: new Date(callDate).getTime(),
          note: note.trim() || undefined,
          tagIds,
          categoryId,
        });
      }
      setPanelOpen(false);
      resetForm();
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: editingCall
            ? "calls.errors.updateFailed"
            : "calls.errors.createFailed",
          defaultValue: editingCall
            ? "Nie udało się zapisać rozmowy."
            : "Nie udało się dodać rozmowy.",
        }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const AVATAR_IMAGES = [
    "/images/avatars/blue.jpg",
    "/images/avatars/purple.jpg",
    "/images/avatars/red.jpg",
  ];

  const renderUserAvatar = (userId: Id<"users">) => {
    const u = userMap.get(userId);
    if (!u) return <span className="text-sm text-muted-foreground">—</span>;
    const name = u.name ?? u.email ?? "—";
    const parts = (u.name ?? "").trim().split(/\s+/).filter(Boolean);
    const initials =
      parts.length >= 2
        ? `${parts[0][0]}${parts[1][0]}`
        : (name[0] ?? "?").toUpperCase();
    const src = AVATAR_IMAGES[userId.charCodeAt(userId.length - 1) % AVATAR_IMAGES.length];
    return (
      <AvatarLabelGroup
        size="sm"
        src={src}
        initials={initials.toUpperCase()}
        title={name}
        subtitle={u.email ?? ""}
      />
    );
  };

  const getRelated = (callId: string) => relMap?.[callId] ?? [];

  const columns: CrmColumn<Call>[] = [
    {
      id: "outcome",
      label: t('calls.outcome'),
      render: (item) => {
        const config = OUTCOME_CONFIG[item.outcome as CallOutcome];
        if (!config) return item.outcome;
        return (
          <Badge variant="secondary" className={`${config.color} whitespace-nowrap`}>
            {t(config.labelKey)}
          </Badge>
        );
      },
    },
    {
      id: "relatedTo",
      label: t('calls.relatedTo', "Do"),
      render: (item) => {
        const rels = getRelated(item._id);
        if (rels.length === 0)
          return <span className="text-sm text-muted-foreground">—</span>;
        const first = rels[0];
        const extra = rels.length - 1;
        const initials = (first.targetName ?? "?").trim().slice(0, 2).toUpperCase();
        return (
          <div className="flex items-center gap-2">
            <AvatarLabelGroup
              size="sm"
              initials={initials || "?"}
              title={first.targetName}
              subtitle={first.targetSublabel ?? first.targetType}
            />
            {extra > 0 && (
              <Badge variant="secondary" className="text-xs">
                +{extra}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      id: "createdBy",
      label: t('calls.performedBy', "Wykonał"),
      sortable: true,
      render: (item) => renderUserAvatar(item.createdBy as Id<"users">),
      getSortValue: (item) => {
        const u = userMap.get(item.createdBy as Id<"users">);
        return u?.name ?? u?.email ?? "";
      },
    },
    {
      id: "callDate",
      label: t('calls.callDate'),
      sortable: true,
      render: (item) => new Date(item.callDate).toLocaleString(),
      getSortValue: (item) => item.callDate,
    },
    {
      id: "note",
      label: t('calls.note'),
      render: (item) => {
        const text = plateJsonToText(item.note).trim();
        if (!text) return <span className="text-fg-quaternary">—</span>;
        return (
          <span className="text-fg-tertiary" title={text}>
            {text.length > 60 ? text.slice(0, 60) + "..." : text}
          </span>
        );
      },
    },
    {
      id: "createdAt",
      label: t('common.created'),
      sortable: true,
      render: (item) => new Date(item.createdAt).toLocaleDateString(),
      getSortValue: (item) => item.createdAt,
    },
  ];

  const { allColumns, defaultHidden } = useAllColumns(columns, filterableFields);
  const { hiddenColumnIds, toggleColumn, setHiddenColumns } = useColumnVisibility(defaultHidden, "calls");

  const rowActions = (row: Call) => [
    {
      label: t('common.edit'),
      icon: <Pencil className="h-4 w-4" variant="stroke" />,
      onClick: () => openEditPanel(row),
    },
    {
      label: t('common.delete'),
      icon: <Trash2 className="h-4 w-4" variant="stroke" />,
      onClick: () => removeCall({ organizationId, callId: row._id }),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('calls.title')}
        description={t('calls.description')}
        actions={
          <Button onClick={openCreatePanel}>
            <Plus className="mr-2 h-4 w-4" variant="stroke" />
            {t('calls.logCall')}
          </Button>
        }
      />

      {nudgeFilter === "no-outcome" && (
        <div className="flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <span>
            {t("calls.nudgeFilter.noOutcome", {
              defaultValue: "Pokazywane są połączenia bez zapisanego wyniku.",
            })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() =>
              navigate({
                to: "/dashboard/calls",
                search: { nudge: undefined },
              })
            }
          >
            <X className="h-3.5 w-3.5" variant="stroke" />
            {t("common.clearFilters")}
          </Button>
        </div>
      )}

      <DataListFilterBar
        views={views}
        activeViewId={activeViewId}
        onViewChange={onViewChange}
        onCreateView={onCreateView}
        onDeleteView={onDeleteView}
        filterableFields={filterableFields}
        createDialogOpen={savedViewsDialogOpen}
        onCreateDialogOpenChange={setSavedViewsDialogOpen}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder={t('calls.searchPlaceholder')}
        onTagsManage={() => setTagsSlideoutOpen(true)}
        onFiltersChange={setActiveFilters}
        onCategoriesManage={() => setCategoriesSlideoutOpen(true)}
        columnDefs={allColumns.map(c => ({ id: c.id, label: c.label ?? c.id }))}
        hiddenColumnIds={hiddenColumnIds}
        onToggleColumn={toggleColumn}
        onSetHiddenColumns={setHiddenColumns}
      />

      <CrmDataTable
        columns={allColumns}
        hiddenColumnIds={hiddenColumnIds}
        data={calls}
        rowActions={rowActions}
        isLoading={isLoading}
      />

      <SidePanel
        open={panelOpen}
        onOpenChange={(open) => {
          setPanelOpen(open);
          if (!open) resetForm();
        }}
        title={editingCall ? t('calls.editCall') : t('calls.logCall')}
        description={editingCall ? t('calls.updateDescription') : t('calls.createDescription')}
        onSubmit={handleSubmit}
        submitLabel={editingCall ? t('common.update') : t('common.create')}
        isSubmitting={isSubmitting}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('calls.outcome')}</Label>
            <Select value={outcome} onValueChange={(val) => setOutcome(val as CallOutcome)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="busy">{t('calls.outcomes.busy')}</SelectItem>
                <SelectItem value="leftVoiceMessage">{t('calls.outcomes.leftVoiceMessage')}</SelectItem>
                <SelectItem value="movedConversationForward">{t('calls.outcomes.movedConversationForward')}</SelectItem>
                <SelectItem value="wrongNumber">{t('calls.outcomes.wrongNumber')}</SelectItem>
                <SelectItem value="noAnswer">{t('calls.outcomes.noAnswer')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>
              {t('calls.callDate')} <span className="text-destructive">*</span>
            </Label>
            <Input
              type="datetime-local"
              value={callDate}
              onChange={(e) => setCallDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('calls.note')}</Label>
            <RichTextEditor
              value={note}
              onChange={(val) => setNote(val ?? "")}
              placeholder={t('calls.addCallNotes')}
            />
          </div>

          {tags.length > 0 && (
            <div className="space-y-1.5">
              <Label>{t('common.tags', { defaultValue: "Tagi" })}</Label>
              <TagsPicker tags={tags} selectedIds={tagIds} onChange={setTagIds} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t('common.category', { defaultValue: "Kategoria" })}</Label>
            <CategoryPicker
              categories={categories}
              selectedId={categoryId}
              onChange={setCategoryId}
              organizationId={organizationId}
              entityType="call"
            />
          </div>
        </div>
      </SidePanel>

      <TagsManagerSlideout
        isOpen={tagsSlideoutOpen}
        onOpenChange={setTagsSlideoutOpen}
        organizationId={organizationId}
        tags={tags}
      />
      <CategoriesManagerSlideout
        isOpen={categoriesSlideoutOpen}
        onOpenChange={setCategoriesSlideoutOpen}
        organizationId={organizationId}
        entityType="call"
        categories={categories}
      />
    </div>
  );
}
