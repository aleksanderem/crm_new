import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { CrmDataTable } from "@/components/crm/enhanced-data-table";
import { SavedViewsTabs } from "@/components/crm/saved-views-tabs";
import { SidePanel } from "@/components/crm/side-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Plus, Pencil, Trash2 } from "@/lib/ez-icons";
import type { ColumnDef } from "@tanstack/react-table";
import type { SavedView, FieldDef } from "@/components/crm/types";
import { Doc } from "@cvx/_generated/dataModel";
import { useSavedViews } from "@/hooks/use-saved-views";
import { QuickActionBar } from "@/components/crm/quick-action-bar";
import { Phone } from "@/lib/ez-icons";

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
      options: [
        { label: t('calls.outcomes.busy'), value: "busy" },
        { label: t('calls.outcomes.leftVoiceMessage'), value: "leftVoiceMessage" },
        { label: t('calls.outcomes.movedConversationForward'), value: "movedConversationForward" },
        { label: t('calls.outcomes.wrongNumber'), value: "wrongNumber" },
        { label: t('calls.outcomes.noAnswer'), value: "noAnswer" },
      ],
    },
    { id: "callDate", label: t('calls.callDate'), type: "date" },
  ], [t]);

  const {
    views, activeViewId, onViewChange, onCreateView, onUpdateView, onDeleteView, applyFilters,
  } = useSavedViews({ organizationId, entityType: "call", systemViews });
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingCall, setEditingCall] = useState<Call | null>(null);

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
  const calls = useMemo(() => applyFilters(allCalls), [allCalls, applyFilters]);

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

  const columns: ColumnDef<Call, unknown>[] = [
    {
      accessorKey: "outcome",
      header: t('calls.outcome'),
      cell: ({ getValue }) => {
        const val = getValue() as CallOutcome;
        const config = OUTCOME_CONFIG[val];
        if (!config) return val;
        return (
          <Badge variant="secondary" className={config.color}>
            {t(config.labelKey)}
          </Badge>
        );
      },
    },
    {
      accessorKey: "callDate",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('calls.callDate')} />
      ),
      cell: ({ getValue }) =>
        new Date(getValue() as number).toLocaleString(),
    },
    {
      accessorKey: "note",
      header: t('calls.note'),
      cell: ({ getValue }) => {
        const val = getValue() as string | undefined;
        if (!val) return <span className="text-muted-foreground">—</span>;
        return (
          <span className="text-muted-foreground" title={val}>
            {val.length > 60 ? val.slice(0, 60) + "..." : val}
          </span>
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('common.created')} />
      ),
      cell: ({ getValue }) =>
        new Date(getValue() as number).toLocaleDateString(),
    },
  ];

  const rowActions = (row: Call) => [
    {
      label: t('common.edit'),
      icon: <Pencil className="h-3.5 w-3.5" />,
      onClick: () => openEditPanel(row),
    },
    {
      label: t('common.delete'),
      icon: <Trash2 className="h-3.5 w-3.5" />,
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
            <Plus className="mr-2 h-4 w-4" />
            {t('calls.logCall')}
          </Button>
        }
      />

      <SavedViewsTabs
        views={views}
        activeViewId={activeViewId}
        onViewChange={onViewChange}
        onCreateView={onCreateView}
        onUpdateView={onUpdateView}
        onDeleteView={onDeleteView}
        filterableFields={filterableFields}
      />

      <QuickActionBar
        actions={[
          {
            label: t('quickActions.logCall'),
            icon: <Phone className="mr-1.5 h-3.5 w-3.5" />,
            onClick: openCreatePanel,
            feature: "calls",
            action: "create",
          },
        ]}
      />

      <CrmDataTable
        columns={columns}
        data={calls}
        rowActions={rowActions}
        searchKey="note"
        searchPlaceholder={t('calls.searchPlaceholder')}
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
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('calls.addCallNotes')}
              rows={4}
            />
          </div>
        </div>
      </SidePanel>
    </div>
  );
}
