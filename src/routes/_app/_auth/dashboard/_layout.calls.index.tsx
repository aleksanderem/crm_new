import { useState, useMemo, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { CrmDataTable, useColumnVisibility, useAllColumns } from "@/components/crm/enhanced-data-table";
import type { CrmColumn } from "@/components/crm/enhanced-data-table";
import { DataListFilterBar } from "@/components/crm/data-list-filter-bar";
import { SidePanel } from "@/components/crm/side-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";
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
import { Plus, Pencil, Trash2 } from "@/lib/ez-icons";
import { useSidebarDispatch } from "@/components/layout/sidebar-context";
import type { SavedView, FieldDef } from "@/components/crm/types";
import { Doc } from "@cvx/_generated/dataModel";
import { useSavedViews } from "@/hooks/use-saved-views";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/calls/"
)({
  component: CallsPage,
});

type Call = Doc<"calls">;
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
  const systemViews: SavedView[] = useMemo(() => [
    { id: "all", name: t('calls.views.all'), isSystem: true, isDefault: true },
  ], [t]);

  const filterableFields = useMemo((): FieldDef[] => [
    {
      id: "outcome", label: t('calls.outcome'), type: "select",
      options: callOutcomeOptions(t),
    },
    { id: "callDate", label: t('calls.callDate'), type: "date" },
    { id: "duration", label: t('calls.duration'), type: "number" },
    { id: "note", label: t('calls.note'), type: "text" },
    { id: "createdAt", label: t('common.created'), type: "date" },
  ], [t]);

  const {
    views, activeViewId, onViewChange, onCreateView, onDeleteView, applyFilters,
  } = useSavedViews({ organizationId, entityType: "call", systemViews });
  const toolbarRef = useRef<React.ReactNode>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingCall, setEditingCall] = useState<Call | null>(null);
  const [savedViewsDialogOpen, setSavedViewsDialogOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  // Sidebar dispatch handlers
  useSidebarDispatch("savedViews", () => setSavedViewsDialogOpen(true));

  // Form state
  const [outcome, setOutcome] = useState<CallOutcome>("noAnswer");
  const [callDate, setCallDate] = useState("");
  const [note, setNote] = useState("");

  const { data, isLoading } = useQuery(
    convexQuery(api.calls.list, {
      organizationId,
      paginationOpts: { numItems: 100, cursor: null },
    })
  );

  const allCalls = data?.page ?? [];
  const calls = useMemo(() => {
    const filtered = applyFilters(allCalls) as typeof allCalls;
    if (!searchValue.trim()) return filtered;
    const q = searchValue.toLowerCase();
    return filtered.filter((c) => c.note?.toLowerCase().includes(q));
  }, [allCalls, applyFilters, searchValue]);

  const createCall = useMutation(api.calls.create);
  const updateCall = useMutation(api.calls.update);
  const removeCall = useMutation(api.calls.remove);

  const resetForm = () => {
    setOutcome("noAnswer");
    setCallDate(new Date().toISOString().slice(0, 16));
    setNote("");
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
        });
      } else {
        await createCall({
          organizationId,
          outcome,
          callDate: new Date(callDate).getTime(),
          note: note.trim() || undefined,
        });
      }
      setPanelOpen(false);
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns: CrmColumn<Call>[] = [
    {
      id: "outcome",
      label: t('calls.outcome'),
      render: (item) => {
        const config = OUTCOME_CONFIG[item.outcome as CallOutcome];
        if (!config) return item.outcome;
        return (
          <Badge variant="secondary" className={config.color}>
            {t(config.labelKey)}
          </Badge>
        );
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
        if (!item.note) return <span className="text-fg-quaternary">—</span>;
        return (
          <span className="text-fg-tertiary" title={item.note}>
            {item.note.length > 60 ? item.note.slice(0, 60) + "..." : item.note}
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
  const { hiddenColumnIds, toggleColumn } = useColumnVisibility(defaultHidden);

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
        columnDefs={allColumns.map(c => ({ id: c.id, label: c.label ?? c.id }))}
        hiddenColumnIds={hiddenColumnIds}
        onToggleColumn={toggleColumn}
        renderToolbar={(toolbar) => { toolbarRef.current = toolbar; return null; }}
      />

      <CrmDataTable
        columns={allColumns}
        hiddenColumnIds={hiddenColumnIds}
        data={calls}
        rowActions={rowActions}
        isLoading={isLoading}
        toolbar={toolbarRef.current}
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
        </div>
      </SidePanel>
    </div>
  );
}
