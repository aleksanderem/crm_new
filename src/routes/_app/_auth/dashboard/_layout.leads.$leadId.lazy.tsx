import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import {
  EntityDetailLayout,
  type DetailField,
} from "@/components/crm/entity-detail-layout";
import { SidePanel } from "@/components/crm/side-panel";
import { LeadForm } from "@/components/forms/lead-form";
import { ContactForm } from "@/components/forms/contact-form";
import { CompanyForm } from "@/components/forms/company-form";
import { RelationshipField } from "@/components/crm/relationship-field";
import type { RelationshipItem } from "@/components/crm/relationship-field";
import { ActivityForm } from "@/components/crm/activity-form";
import { ActivityDetailDrawer } from "@/components/crm/activity-detail-drawer";
import { ActivityTimeline } from "@/components/activity-timeline/activity-timeline";
import { ScheduledActivitiesList } from "@/components/shared/scheduled-activities-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  Pencil,
  Plus,
  Upload,
  PhoneCall,
  Pin,
  User,
  Search,
  Link2,
  Building2,
  Package,
} from "@/lib/ez-icons";
import { Id } from "@cvx/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useCustomFieldForm } from "@/hooks/use-custom-field-form";
import { EmailEntityTab } from "@/components/email/email-entity-tab";
import { EntityQuickActions } from "@/components/crm/entity-quick-actions";
import { DocumentInstanceTable } from "@/components/documents/document-instance-table";
import { DocumentFromTemplateDialog } from "@/components/documents/document-from-template-dialog";
import { DocumentInstanceView } from "@/components/documents/document-instance-view";
import { EntityDocumentsTab } from "@/components/documents/entity-documents-tab";

export const Route = createLazyFileRoute(
  "/_app/_auth/dashboard/_layout/leads/$leadId"
)({
  component: LeadDetail,
});

const statusColors: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  won: "bg-green-100 text-green-700",
  lost: "bg-red-100 text-red-700",
  archived: "bg-gray-100 text-gray-700",
};


function formatCurrency(value: number) {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// --- PipelineProgressBar ---

function PipelineProgressBar({
  stages,
  currentStageId,
  onStageClick,
}: {
  stages: { _id: Id<"pipelineStages">; name: string; color?: string; order: number }[];
  currentStageId?: Id<"pipelineStages">;
  onStageClick: (stageId: Id<"pipelineStages">) => void;
}) {
  const sorted = [...stages].sort((a, b) => a.order - b.order);
  const currentIndex = sorted.findIndex((s) => s._id === currentStageId);

  return (
    <div className="flex items-center gap-0.5">
      {sorted.map((stage, i) => {
        const isPast = i < currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <button
            key={stage._id}
            type="button"
            onClick={() => onStageClick(stage._id)}
            className={cn(
              "flex-1 py-1.5 text-[11px] font-medium text-center transition-colors rounded-sm",
              isPast && "bg-primary/20 text-primary",
              isCurrent && "bg-primary text-primary-foreground",
              !isPast && !isCurrent && "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
            title={stage.name}
          >
            {stage.name}
          </button>
        );
      })}
    </div>
  );
}

// --- LostReasonDialog ---

function LostReasonDialog({
  open,
  onOpenChange,
  onConfirm,
  organizationId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  organizationId: Id<"organizations">;
}) {
  const { data: lostReasons } = useQuery(
    convexQuery(api.lostReasons.list, { organizationId })
  );
  const { t } = useTranslation();
  const [selectedReason, setSelectedReason] = useState("");
  const [customReason, setCustomReason] = useState("");

  const handleSubmit = () => {
    const reason = selectedReason === "__custom__" ? customReason : selectedReason;
    if (reason.trim()) {
      onConfirm(reason.trim());
      setSelectedReason("");
      setCustomReason("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{t('detail.lostDialog.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={selectedReason} onValueChange={setSelectedReason}>
            <SelectTrigger>
              <SelectValue placeholder={t('detail.lostDialog.selectReason')} />
            </SelectTrigger>
            <SelectContent>
              {lostReasons?.map((r) => (
                <SelectItem key={r._id} value={r.label}>
                  {r.label}
                </SelectItem>
              ))}
              <SelectItem value="__custom__">{t('detail.lostDialog.customReason')}</SelectItem>
            </SelectContent>
          </Select>
          {selectedReason === "__custom__" && (
            <Input
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder={t('detail.lostDialog.customPlaceholder')}
              autoFocus
            />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={
              !selectedReason ||
              (selectedReason === "__custom__" && !customReason.trim())
            }
            onClick={handleSubmit}
          >
            {t('detail.lostDialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Main Component ---

function LeadDetail() {
  const { t } = useTranslation();
  const { leadId } = Route.useParams();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const updateLead = useMutation(api.leads.update);
  const removeLead = useMutation(api.leads.remove);
  const moveToStage = useMutation(api.leads.moveToStage);
  const createRelationship = useMutation(api.relationships.create);
  const removeRelationship = useMutation(api.relationships.remove);
  const createContactMutation = useMutation(api.contacts.create);
  const createCompanyMutation = useMutation(api.companies.create);
  const setCustomFields = useMutation(api.customFields.setValues);
  const trackView = useMutation(api.recentlyViewed.track);
  const createNote = useMutation(api.notes.create);
  const createScheduledActivity = useMutation(api.scheduledActivities.create);
  const markActivityComplete = useMutation(api.scheduledActivities.markComplete);
  const markActivityIncomplete = useMutation(api.scheduledActivities.markIncomplete);
  const updateScheduledActivity = useMutation(api.scheduledActivities.update);
  const removeScheduledActivity = useMutation(api.scheduledActivities.remove);

  const { data: currentUser } = useQuery(
    convexQuery(api.app.getCurrentUser, {})
  );

  const { data: activityTypeDefs } = useQuery(
    convexQuery(api.activityTypes.list, { organizationId })
  );

  const { data: activityCustomFieldDefs } = useQuery(
    convexQuery(api.customFields.getDefinitions, {
      organizationId,
      entityType: "activity",
    })
  );

  // Lead entity custom fields
  const {
    definitions: leadCfDefs,
  } = useCustomFieldForm({ organizationId, entityType: "lead" });

  const { data: leadCfValuesRaw } = useQuery({
    ...convexQuery(api.customFields.getValues, {
      organizationId,
      entityType: "lead" as any,
      entityId: leadId,
    }),
    enabled: !!leadId,
  });

  const leadCfValues = useMemo(() => {
    if (!leadCfValuesRaw || !leadCfDefs) return {};
    const defIdToKey: Record<string, string> = {};
    leadCfDefs.forEach((d) => { defIdToKey[d._id] = d.fieldKey; });
    const result: Record<string, unknown> = {};
    leadCfValuesRaw.forEach((v) => {
      const key = defIdToKey[v.fieldDefinitionId];
      if (key) result[key] = v.value;
    });
    return result;
  }, [leadCfValuesRaw, leadCfDefs]);

  // Activity custom field values for drawer
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);

  const { data: selectedActivityCfRaw } = useQuery({
    ...convexQuery(api.customFields.getValues, {
      organizationId,
      entityType: "activity",
      entityId: selectedActivityId ?? "",
    }),
    enabled: !!selectedActivityId,
  });

  const selectedActivityCfValues = useMemo(() => {
    if (!selectedActivityCfRaw || !activityCustomFieldDefs) return {};
    const defIdToKey: Record<string, string> = {};
    activityCustomFieldDefs.forEach((d) => { defIdToKey[d._id] = d.fieldKey; });
    const result: Record<string, unknown> = {};
    selectedActivityCfRaw.forEach((v) => {
      const key = defIdToKey[v.fieldDefinitionId];
      if (key) result[key] = v.value;
    });
    return result;
  }, [selectedActivityCfRaw, activityCustomFieldDefs]);

  // Drawer & panel state
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [createContactDrawerOpen, setCreateContactDrawerOpen] = useState(false);
  const [createCompanyDrawerOpen, setCreateCompanyDrawerOpen] = useState(false);
  const [lostDialogOpen, setLostDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activityDrawerOpen, setActivityDrawerOpen] = useState(false);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [showNewDocDialog, setShowNewDocDialog] = useState(false);
  const [viewingDocId, setViewingDocId] = useState<Id<"documentInstances"> | null>(null);

  // Sidebar UI state
  const [newNote, setNewNote] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [showSidebarContactLink, setShowSidebarContactLink] = useState(false);
  const [showSidebarCompanyLink, setShowSidebarCompanyLink] = useState(false);
  const [sidebarContactSearch, setSidebarContactSearch] = useState("");
  const [sidebarCompanySearch, setSidebarCompanySearch] = useState("");
  const [guestContactSearch, setGuestContactSearch] = useState("");

  // Edit drawer relationship search
  const [contactSearch, setContactSearch] = useState("");
  const [companySearch, setCompanySearch] = useState("");

  // --- Data queries ---

  const { data: lead, isLoading } = useQuery(
    convexQuery(api.leads.getById, {
      organizationId,
      leadId: leadId as Id<"leads">,
    })
  );

  useEffect(() => {
    if (lead && organizationId) {
      trackView({ organizationId, entityType: "leads", entityId: lead._id, entityLabel: lead.title });
    }
  }, [lead?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pipelineId = lead?.stage?.pipelineId;
  const { data: stages } = useQuery({
    ...convexQuery(api.pipelines.getStages, {
      organizationId,
      pipelineId: pipelineId ?? ("" as Id<"pipelines">),
    }),
    enabled: !!pipelineId,
  });

  const { data: pipelines } = useQuery(
    convexQuery(api.pipelines.list, { organizationId })
  );

  const { data: allStages } = useQuery(
    convexQuery(api.pipelines.getAllStages, { organizationId })
  );

  const { data: activitiesData } = useQuery(
    convexQuery(api.activities.getForEntity, {
      organizationId,
      entityType: "lead",
      entityId: leadId,
      paginationOpts: { numItems: 50, cursor: null },
    })
  );
  const activities = activitiesData?.page;

  const { data: relationships } = useQuery(
    convexQuery(api.relationships.getForEntity, {
      organizationId,
      entityType: "lead",
      entityId: leadId,
    })
  );

  const { data: dealProducts } = useQuery(
    convexQuery(api.products.listByDeal, {
      organizationId,
      dealId: leadId as Id<"leads">,
    })
  );

  const { data: notesData } = useQuery(
    convexQuery(api.notes.listByEntity, {
      organizationId,
      entityType: "lead",
      entityId: leadId,
    })
  );

  const { data: scheduledActivitiesData } = useQuery(
    convexQuery(api.scheduledActivities.listByEntity, {
      organizationId,
      linkedEntityType: "lead",
      linkedEntityId: leadId,
    })
  );

  // Edit drawer search
  const { data: contactSearchResults } = useQuery({
    ...convexQuery(api.contacts.list, {
      organizationId,
      paginationOpts: { numItems: 20, cursor: null },
      search: contactSearch || undefined,
    }),
    enabled: contactSearch.length > 0,
  });

  const { data: companySearchResults } = useQuery({
    ...convexQuery(api.companies.list, {
      organizationId,
      paginationOpts: { numItems: 20, cursor: null },
      search: companySearch || undefined,
    }),
    enabled: companySearch.length > 0,
  });

  // Sidebar inline search
  const { data: sidebarContactResults } = useQuery({
    ...convexQuery(api.contacts.list, {
      organizationId,
      paginationOpts: { numItems: 10, cursor: null },
      search: sidebarContactSearch || undefined,
    }),
    enabled: sidebarContactSearch.length > 0,
  });

  const { data: sidebarCompanyResults } = useQuery({
    ...convexQuery(api.companies.list, {
      organizationId,
      paginationOpts: { numItems: 10, cursor: null },
      search: sidebarCompanySearch || undefined,
    }),
    enabled: sidebarCompanySearch.length > 0,
  });

  // Guest contact search for activity form
  const { data: guestContactResults } = useQuery({
    ...convexQuery(api.contacts.list, {
      organizationId,
      paginationOpts: { numItems: 10, cursor: null },
      search: guestContactSearch || undefined,
    }),
    enabled: guestContactSearch.length > 0,
  });

  // --- Loading / not found handled by EntityDetailLayout ---

  // --- Handlers ---

  const handleEditSubmit = async (
    formData: {
      title: string;
      value?: number;
      status: string;
      priority?: string;
      source?: string;
      pipelineStageId?: string;
      notes?: string;
    },
    customFieldRecord: Record<string, unknown>
  ) => {
    setIsSubmitting(true);
    try {
      await updateLead({
        organizationId,
        leadId: leadId as Id<"leads">,
        title: formData.title,
        value: formData.value,
        status: formData.status as any,
        priority: formData.priority as any,
        source: formData.source,
        notes: formData.notes,
      });
      if (formData.pipelineStageId) {
        await moveToStage({
          organizationId,
          leadId: leadId as Id<"leads">,
          pipelineStageId: formData.pipelineStageId as Id<"pipelineStages">,
          stageOrder: 0,
        });
      }
      if (leadCfDefs) {
        const fieldsToSave = leadCfDefs
          .filter((d) => customFieldRecord[d.fieldKey] !== undefined && customFieldRecord[d.fieldKey] !== "")
          .map((d) => ({
            fieldDefinitionId: d._id as Id<"customFieldDefinitions">,
            value: customFieldRecord[d.fieldKey],
          }));
        if (fieldsToSave.length > 0) {
          await setCustomFields({
            organizationId,
            entityType: "lead" as any,
            entityId: leadId,
            fields: fieldsToSave,
          });
        }
      }
      setEditDrawerOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkWon = async () => {
    await updateLead({
      organizationId,
      leadId: leadId as Id<"leads">,
      status: "won",
    });
  };

  const handleMarkLost = async (reason: string) => {
    await updateLead({
      organizationId,
      leadId: leadId as Id<"leads">,
      status: "lost",
      lostReason: reason,
    });
    setLostDialogOpen(false);
  };

  const handleDelete = async () => {
    if (window.confirm(t('detail.confirmDeleteDeal'))) {
      await removeLead({
        organizationId,
        leadId: leadId as Id<"leads">,
      });
      navigate({ to: "/dashboard/leads" });
    }
  };

  const handleStageClick = async (stageId: Id<"pipelineStages">) => {
    await moveToStage({
      organizationId,
      leadId: leadId as Id<"leads">,
      pipelineStageId: stageId,
      stageOrder: 0,
    });
  };

  const handleLinkContact = async (item: RelationshipItem) => {
    await createRelationship({
      organizationId,
      sourceType: "lead",
      sourceId: leadId,
      targetType: "contact",
      targetId: item.id,
    });
  };

  const handleUnlinkContact = async (targetId: string) => {
    const rel = contactRelationships.find((r) => r.targetId === targetId);
    if (rel) {
      await removeRelationship({ organizationId, relationshipId: rel._id });
    }
  };

  const handleLinkCompany = async (item: RelationshipItem) => {
    await createRelationship({
      organizationId,
      sourceType: "lead",
      sourceId: leadId,
      targetType: "company",
      targetId: item.id,
    });
  };

  const handleUnlinkCompany = async (targetId: string) => {
    const rel = companyRelationships.find((r) => r.targetId === targetId);
    if (rel) {
      await removeRelationship({ organizationId, relationshipId: rel._id });
    }
  };

  const handleCreateContact = async (
    formData: { firstName: string; lastName?: string; email?: string; phone?: string; title?: string },
    _customFields: Record<string, unknown>
  ) => {
    setIsSubmitting(true);
    try {
      const contactId = await createContactMutation({
        organizationId,
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        title: formData.title,
      });
      await createRelationship({
        organizationId,
        sourceType: "lead",
        sourceId: leadId,
        targetType: "contact",
        targetId: contactId,
      });
      setCreateContactDrawerOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateCompany = async (
    formData: { name: string; domain?: string; industry?: string; size?: string; website?: string; phone?: string; notes?: string },
    _customFields: Record<string, unknown>
  ) => {
    setIsSubmitting(true);
    try {
      const companyId = await createCompanyMutation({
        organizationId,
        name: formData.name,
        domain: formData.domain,
        industry: formData.industry,
        size: formData.size,
        website: formData.website,
        phone: formData.phone,
        notes: formData.notes,
      });
      await createRelationship({
        organizationId,
        sourceType: "lead",
        sourceId: leadId,
        targetType: "company",
        targetId: companyId,
      });
      setCreateCompanyDrawerOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setIsAddingNote(true);
    try {
      await createNote({
        organizationId,
        entityType: "lead",
        entityId: leadId,
        content: newNote.trim(),
      });
      setNewNote("");
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleCreateActivity = async (data: {
    title: string;
    activityType: string;
    dueDate: number;
    endDate?: number;
    description?: string;
    note?: string;
    isCompleted?: boolean;
    customFieldValues?: Record<string, unknown>;
  }) => {
    if (!currentUser) return;
    const activityId = await createScheduledActivity({
      organizationId,
      title: data.title,
      activityType: data.activityType,
      dueDate: data.dueDate,
      endDate: data.endDate,
      description: data.description,
      ownerId: currentUser._id as Id<"users">,
      linkedEntityType: "lead",
      linkedEntityId: leadId,
    });
    if (data.isCompleted && activityId) {
      await markActivityComplete({ organizationId, activityId });
    }
    if (data.note) {
      await createNote({
        organizationId,
        entityType: "lead",
        entityId: leadId,
        content: data.note,
      });
    }
    if (data.customFieldValues && activityCustomFieldDefs) {
      const fieldsToSave = activityCustomFieldDefs
        .filter((d) => data.customFieldValues![d.fieldKey] !== undefined && data.customFieldValues![d.fieldKey] !== "")
        .map((d) => ({
          fieldDefinitionId: d._id as Id<"customFieldDefinitions">,
          value: data.customFieldValues![d.fieldKey],
        }));
      if (fieldsToSave.length > 0) {
        await setCustomFields({
          organizationId,
          entityType: "activity",
          entityId: activityId,
          fields: fieldsToSave,
        });
      }
    }
    setShowActivityForm(false);
  };

  const handleUpdateActivity = async (data: {
    activityId: string;
    title?: string;
    activityType?: string;
    dueDate?: number;
    endDate?: number;
    description?: string;
  }) => {
    await updateScheduledActivity({
      organizationId,
      activityId: data.activityId as Id<"scheduledActivities">,
      title: data.title,
      activityType: data.activityType,
      dueDate: data.dueDate,
      endDate: data.endDate,
      description: data.description,
    });
  };

  const handleDeleteActivity = async (activityId: string) => {
    await removeScheduledActivity({
      organizationId,
      activityId: activityId as Id<"scheduledActivities">,
    });
    setActivityDrawerOpen(false);
    setSelectedActivityId(null);
  };

  const handleToggleActivityComplete = async (activityId: string, isCompleted: boolean) => {
    if (isCompleted) {
      await markActivityComplete({ organizationId, activityId: activityId as Id<"scheduledActivities"> });
    } else {
      await markActivityIncomplete({ organizationId, activityId: activityId as Id<"scheduledActivities"> });
    }
  };

  const handleSaveActivityCustomFields = async (activityId: string, values: Record<string, unknown>) => {
    if (!activityCustomFieldDefs) return;
    const fieldsToSave = activityCustomFieldDefs
      .filter((d) => values[d.fieldKey] !== undefined && values[d.fieldKey] !== "")
      .map((d) => ({
        fieldDefinitionId: d._id as Id<"customFieldDefinitions">,
        value: values[d.fieldKey],
      }));
    if (fieldsToSave.length > 0) {
      await setCustomFields({
        organizationId,
        entityType: "activity",
        entityId: activityId,
        fields: fieldsToSave,
      });
    }
  };

  // --- Derived data ---

  const avatarFallback = lead?.title[0]?.toUpperCase() ?? "D";

  const contactRelationships = relationships?.filter((r) => r.targetType === "contact") ?? [];
  const companyRelationships = relationships?.filter((r) => r.targetType === "company") ?? [];

  const selectedContacts: RelationshipItem[] = contactRelationships.map((r) => ({
    id: r.targetId,
    label: (r as any).targetName ?? r.targetId,
    sublabel: (r as any).targetSublabel,
  }));

  const selectedCompanies: RelationshipItem[] = companyRelationships.map((r) => ({
    id: r.targetId,
    label: (r as any).targetName ?? r.targetId,
    sublabel: (r as any).targetSublabel,
  }));

  const selectedActivity = scheduledActivitiesData?.find(
    (a) => a._id === selectedActivityId
  ) ?? null;

  const pipelineName = lead?.stage?.pipelineId
    ? pipelines?.find((p) => p._id === lead?.stage?.pipelineId)?.name
    : undefined;

  const totalProductValue = dealProducts?.reduce(
    (sum, dp) => sum + dp.quantity * dp.unitPrice,
    0
  ) ?? 0;

  // All sidebar detail fields
  const priorityLabels: Record<string, string> = {
    low: t('detail.priorityLabels.low'),
    medium: t('detail.priorityLabels.medium'),
    high: t('detail.priorityLabels.high'),
    urgent: t('detail.priorityLabels.urgent'),
  };

  const fields: DetailField[] = lead
    ? [
        { label: t('detail.fields.value'), value: lead.value ? formatCurrency(lead.value) : undefined, fieldKey: "value" },
        {
          label: t('detail.fields.expectedClose'),
          value: lead.expectedCloseDate
            ? new Date(lead.expectedCloseDate).toLocaleDateString("pl-PL")
            : undefined,
          fieldKey: "expectedCloseDate",
        },
        {
          label: t('detail.fields.status'),
          value: (
            <Badge variant="secondary" className={cn("capitalize", statusColors[lead.status])}>
              {lead.status}
            </Badge>
          ),
          fieldKey: "status",
        },
        {
          label: t('detail.fields.priority'),
          value: lead.priority ? priorityLabels[lead.priority] ?? lead.priority : undefined,
          fieldKey: "priority",
        },
        { label: t('detail.fields.source'), value: lead.source, fieldKey: "source" },
        { label: t('detail.fields.company'), value: lead.company?.name, fieldKey: "company" },
        {
          label: t('detail.fields.tags'),
          value: lead.tags?.length ? (
            <div className="flex flex-wrap gap-1">
              {lead.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
              ))}
            </div>
          ) : undefined,
          fieldKey: "tags",
        },
        {
          label: t('detail.fields.created'),
          value: new Date(lead.createdAt).toLocaleDateString("pl-PL", {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
          fieldKey: "createdAt",
        },
        ...(leadCfDefs ?? []).map((def) => ({
          label: def.name,
          value: leadCfValues[def.fieldKey] != null ? String(leadCfValues[def.fieldKey]) : undefined,
          fieldKey: def.fieldKey,
        })),
      ]
    : [];

  // --- Sidebar association sections ---

  const contactsAssociation = {
    title: t('detail.relationships.contacts'),
    count: contactRelationships.length,
    onCreateNew: () => {
      setShowSidebarContactLink(!showSidebarContactLink);
      setSidebarContactSearch("");
    },
    children: (
      <>
        <div className="flex items-center gap-1 mb-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs px-2"
            onClick={() => {
              setShowSidebarContactLink(!showSidebarContactLink);
              setSidebarContactSearch("");
            }}
          >
            <Link2 className="h-4 w-4 mr-1" variant="stroke" />
            {t('detail.relationships.add')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs px-2"
            onClick={() => setCreateContactDrawerOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" variant="stroke" />
            {t('detail.relationships.addNew')}
          </Button>
        </div>
        {showSidebarContactLink && (
          <div className="mb-3 relative">
            <div className="flex items-center w-full rounded-md border bg-transparent">
              <Search className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" variant="stroke" />
              <Input
                type="text"
                className="h-8 border-0 shadow-none focus-visible:ring-0 px-2"
                placeholder={t('detail.relationships.searchContacts')}
                value={sidebarContactSearch}
                onChange={(e) => setSidebarContactSearch(e.target.value)}
                autoFocus
              />
            </div>
            {sidebarContactSearch.length > 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
                {sidebarContactResults?.page?.filter(
                  (c) => !contactRelationships.some((r) => r.targetId === c._id)
                ).length ? (
                  <ul className="max-h-[200px] overflow-y-auto p-1">
                    {sidebarContactResults.page
                      .filter((c) => !contactRelationships.some((r) => r.targetId === c._id))
                      .map((c) => (
                        <li key={c._id}>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                            onClick={async () => {
                              await handleLinkContact({
                                id: c._id,
                                label: `${c.firstName} ${c.lastName ?? ""}`.trim(),
                              });
                              setSidebarContactSearch("");
                              setShowSidebarContactLink(false);
                            }}
                          >
                            <User className="h-4 w-4 text-muted-foreground" variant="stroke" />
                            <span>{`${c.firstName} ${c.lastName ?? ""}`.trim()}</span>
                            {c.email && (
                              <span className="text-xs text-muted-foreground">{c.email}</span>
                            )}
                          </button>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <div className="py-3 px-3 text-sm text-muted-foreground">
                    {t('detail.relationships.noResults')}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {contactRelationships.length > 0 ? (
          <ul className="space-y-2">
            {contactRelationships.map((r) => (
              <li key={r._id}>
                <button
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                  onClick={() => navigate({ to: `/dashboard/contacts/${r.targetId}` })}
                >
                  <User className="h-4 w-4 text-muted-foreground" variant="stroke" />
                  <span>{(r as any).targetName ?? r.targetId}</span>
                  {(r as any).targetSublabel && (
                    <span className="text-xs text-muted-foreground">
                      {(r as any).targetSublabel}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          !showSidebarContactLink && (
            <p className="text-sm text-muted-foreground">
              {t('detail.relationships.emptyDealContacts')}
            </p>
          )
        )}
      </>
    ),
  };

  const companiesAssociation = {
    title: t('detail.relationships.companies'),
    count: companyRelationships.length,
    onCreateNew: () => {
      setShowSidebarCompanyLink(!showSidebarCompanyLink);
      setSidebarCompanySearch("");
    },
    children: (
      <>
        <div className="flex items-center gap-1 mb-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs px-2"
            onClick={() => {
              setShowSidebarCompanyLink(!showSidebarCompanyLink);
              setSidebarCompanySearch("");
            }}
          >
            <Link2 className="h-4 w-4 mr-1" variant="stroke" />
            {t('detail.relationships.add')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs px-2"
            onClick={() => setCreateCompanyDrawerOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" variant="stroke" />
            {t('detail.relationships.addNew')}
          </Button>
        </div>
        {showSidebarCompanyLink && (
          <div className="mb-3 relative">
            <div className="flex items-center w-full rounded-md border bg-transparent">
              <Search className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" variant="stroke" />
              <Input
                type="text"
                className="h-8 border-0 shadow-none focus-visible:ring-0 px-2"
                placeholder={t('detail.relationships.searchCompanies')}
                value={sidebarCompanySearch}
                onChange={(e) => setSidebarCompanySearch(e.target.value)}
                autoFocus
              />
            </div>
            {sidebarCompanySearch.length > 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
                {sidebarCompanyResults?.page?.filter(
                  (c) => !companyRelationships.some((r) => r.targetId === c._id)
                ).length ? (
                  <ul className="max-h-[200px] overflow-y-auto p-1">
                    {sidebarCompanyResults.page
                      .filter((c) => !companyRelationships.some((r) => r.targetId === c._id))
                      .map((c) => (
                        <li key={c._id}>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                            onClick={async () => {
                              await handleLinkCompany({ id: c._id, label: c.name });
                              setSidebarCompanySearch("");
                              setShowSidebarCompanyLink(false);
                            }}
                          >
                            <Building2 className="h-4 w-4 text-muted-foreground" variant="stroke" />
                            <span>{c.name}</span>
                            {c.domain && (
                              <span className="text-xs text-muted-foreground">({c.domain})</span>
                            )}
                          </button>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <div className="py-3 px-3 text-sm text-muted-foreground">
                    {t('detail.relationships.noResults')}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {companyRelationships.length > 0 ? (
          <ul className="space-y-2">
            {companyRelationships.map((r) => (
              <li key={r._id}>
                <button
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                  onClick={() => navigate({ to: `/dashboard/companies/${r.targetId}` })}
                >
                  <Building2 className="h-4 w-4 text-muted-foreground" variant="stroke" />
                  <span>{(r as any).targetName ?? r.targetId}</span>
                  {(r as any).targetSublabel && (
                    <span className="text-xs text-muted-foreground">
                      ({(r as any).targetSublabel})
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          !showSidebarCompanyLink && (
            <p className="text-sm text-muted-foreground">
              {t('detail.relationships.emptyDealCompany')}
            </p>
          )
        )}
      </>
    ),
  };

  // --- Products sidebar card ---

  const productsSidebarCard = (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {t('detail.relationships.products')}{" "}
          {dealProducts && dealProducts.length > 0 && (
            <span className="text-muted-foreground font-normal">
              ({dealProducts.length})
            </span>
          )}
        </h3>
      </div>
      {dealProducts && dealProducts.length > 0 ? (
        <div className="space-y-2">
          {dealProducts.map((dp) => (
            <div key={dp._id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" variant="stroke" />
                <span>{dp.product?.name ?? t('detail.fields.unknown')}</span>
              </div>
              <span className="text-muted-foreground">
                {dp.quantity} x {formatCurrency(dp.unitPrice)}
              </span>
            </div>
          ))}
          <div className="pt-2 border-t flex justify-between text-sm font-medium">
            <span>{t('detail.fields.total')}</span>
            <span>{formatCurrency(totalProductValue)}</span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t('detail.relationships.emptyDealProducts')}
        </p>
      )}
    </div>
  );

  // --- Attachments sidebar card ---

  const attachmentsContent = (
    <>
      <p className="text-sm text-muted-foreground mb-3">
        {t('detail.attachments.empty')}
      </p>
      <Button variant="outline" size="sm">
        <Upload className="h-4 w-4 mr-1.5" variant="stroke" />
        {t('detail.attachments.selectFile')}
      </Button>
    </>
  );

  // --- Actions menu ---

  const actionsMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          {t('detail.actions.actions')}
          <ChevronDown className="ml-1 h-4 w-4" variant="stroke" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setEditDrawerOpen(true)}>
          <Pencil className="mr-2 h-4 w-4" variant="stroke" />
          {t('detail.actions.edit')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={handleDelete}
          className="text-destructive focus:text-destructive"
        >
          {t('detail.deleteDeal')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // --- Header subtitle (product count, pipeline breadcrumb, date) ---

  const headerSubtitle = (
    <div className="flex items-center gap-2 text-xs">
      {dealProducts && dealProducts.length > 0 && (
        <span>{t('detail.productsCount', { count: dealProducts.length })} &middot; {formatCurrency(totalProductValue)}</span>
      )}
      {pipelineName && lead?.stage && (
        <span>{pipelineName} &gt; {lead.stage.name}</span>
      )}
      <span>
        {lead ? new Date(lead.createdAt).toLocaleDateString("pl-PL") : ""}
      </span>
    </div>
  );

  // --- Pipeline progress bar (before tabs slot) ---

  const pipelineProgressBar = stages && stages.length > 0 && lead ? (
    <div className="px-2 pb-2">
      <PipelineProgressBar
        stages={stages}
        currentStageId={lead.pipelineStageId}
        onStageClick={handleStageClick}
      />
    </div>
  ) : undefined;

  // --- Quick actions + tab content ---

  const quickActionsBar = (
    <EntityQuickActions entityType="lead" entityId={leadId} onAction={(action) => {
      switch (action) {
        case "scheduleActivity": setShowActivityForm(true); break;
      }
    }} />
  );

  // --- Tab definitions ---

  const tabs = [
    {
      label: t('detail.tabs.all'),
      content: (
        <>
          {quickActionsBar}
          <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
            <span>{t('detail.actions.filterBy')}</span>
            <Button variant="outline" size="sm" className="h-7">
              {t('detail.tabs.all')}
              <ChevronDown className="ml-1 h-4 w-4" variant="stroke" />
            </Button>
          </div>
          <ActivityTimeline
            activities={activities ?? []}
            maxHeight="600px"
          />
        </>
      ),
    },
    {
      label: t('detail.tabs.activities'),
      content: (
        <div className="space-y-4">
          {!showActivityForm && (
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <h3 className="font-semibold">{t('detail.activitySection.title')}</h3>
                <p className="text-sm text-muted-foreground">
                  {t('detail.activitySection.descriptionDeal')}
                </p>
              </div>
              <Button className="bg-primary" onClick={() => setShowActivityForm(true)}>
                <Plus className="h-4 w-4 mr-1" variant="stroke" />
                {t('detail.activitySection.add')}
              </Button>
            </div>
          )}

          {showActivityForm && (
            <div className="rounded-lg border p-5">
              <ActivityForm
                linkedEntityType="lead"
                linkedEntityLabel={lead?.title ?? ""}
                onSubmit={handleCreateActivity}
                onCancel={() => setShowActivityForm(false)}
                isSubmitting={isSubmitting}
                activityTypes={activityTypeDefs}
                customFieldDefs={activityCustomFieldDefs}
                contactSearchResults={
                  guestContactResults?.page?.map((c) => ({
                    id: c._id,
                    label: `${c.firstName} ${c.lastName ?? ""}`.trim(),
                    email: c.email ?? undefined,
                  })) ?? []
                }
                onSearchContacts={setGuestContactSearch}
              />
            </div>
          )}

          {scheduledActivitiesData && scheduledActivitiesData.length > 0 ? (
            <ScheduledActivitiesList
              activities={scheduledActivitiesData}
              onActivityClick={(id) => {
                setSelectedActivityId(id);
                setActivityDrawerOpen(true);
              }}
            />
          ) : (
            !showActivityForm && (
              <p className="text-sm text-muted-foreground">
                {t('detail.activitySection.emptyDeal')}
              </p>
            )
          )}
        </div>
      ),
    },
    {
      label: t('detail.tabs.emails'),
      content: (
        <EmailEntityTab
          organizationId={organizationId}
          entityType="lead"
          entityId={leadId}
          leadId={leadId as Id<"leads">}
        />
      ),
    },
    {
      label: t('detail.tabs.documents'),
      content: (
        <>
          <DocumentInstanceTable
            organizationId={organizationId}
            sourceKey="lead"
            sourceInstanceId={leadId}
            onView={(id) => setViewingDocId(id)}
            onNewFromTemplate={() => setShowNewDocDialog(true)}
            showNewButton
          />

          <DocumentFromTemplateDialog
            open={showNewDocDialog}
            onOpenChange={setShowNewDocDialog}
            organizationId={organizationId}
            module="crm"
            sources={{ lead: leadId }}
            onComplete={() => setShowNewDocDialog(false)}
          />

          {viewingDocId && (
            <Dialog open onOpenChange={() => setViewingDocId(null)}>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
                <DocumentInstanceView
                  instanceId={viewingDocId}
                  onClose={() => setViewingDocId(null)}
                />
              </DialogContent>
            </Dialog>
          )}

          <EntityDocumentsTab
            entityType="lead"
            entityId={leadId}
            organizationId={organizationId}
          />
        </>
      ),
    },
    {
      label: t('detail.tabs.calls'),
      content: (
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">{t('detail.callsTab.title')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('detail.callsTab.description')}
            </p>
          </div>
          <div className="flex gap-2">
            <Button className="bg-primary">
              <Plus className="h-4 w-4 mr-1" variant="stroke" />
              {t('detail.callsTab.logCall')}
            </Button>
            <Button variant="outline">
              <PhoneCall className="h-4 w-4 mr-1" variant="stroke" />
              {t('detail.callsTab.makeCall')}
            </Button>
          </div>
        </div>
      ),
    },
    {
      label: t('detail.tabs.notes'),
      count: notesData?.length,
      content: (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">{t('detail.notes.title')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('detail.notes.description')}
              </p>
            </div>
            <Button className="bg-primary" onClick={() => setIsAddingNote(true)}>
              <Plus className="h-4 w-4 mr-1" variant="stroke" />
              {t('detail.notes.add')}
            </Button>
          </div>

          {isAddingNote && (
            <div className="space-y-2 rounded-lg border p-4">
              <Textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder={t('detail.notes.placeholder')}
                rows={4}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsAddingNote(false);
                    setNewNote("");
                  }}
                >
                  {t('detail.notes.cancel')}
                </Button>
                <Button size="sm" onClick={handleAddNote} disabled={!newNote.trim()}>
                  {t('detail.notes.save')}
                </Button>
              </div>
            </div>
          )}

          {notesData && notesData.length > 0 ? (
            <ul className="space-y-3">
              {notesData.map((note) => (
                <li key={note._id} className="rounded-lg border p-4 space-y-1">
                  <div className="flex items-start justify-between">
                    <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                    {note.isPinned && (
                      <Pin className="h-4 w-4 text-primary shrink-0" variant="stroke" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(note.createdAt).toLocaleDateString("pl-PL", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            !isAddingNote && (
              <p className="text-sm text-muted-foreground">{t('detail.notes.empty')}</p>
            )
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <EntityDetailLayout
        variant="default"
        isLoading={isLoading}
        notFound={!lead && !isLoading}
        onBack={() => navigate({ to: "/dashboard/leads" })}
        title={lead?.title ?? ""}
        headerSubtitle={headerSubtitle}
        avatarFallback={avatarFallback}
        primaryAction={{ label: t('detail.won'), onClick: handleMarkWon }}
        secondaryActions={[
          { label: t('detail.lost'), onClick: () => setLostDialogOpen(true), variant: "destructive" },
        ]}
        onEdit={() => setEditDrawerOpen(true)}
        owner={lead?.assignedUser ? { name: lead.assignedUser.name ?? t('detail.actions.owner') } : undefined}
        actionsMenu={actionsMenu}
        fields={fields}
        expandedFieldCount={4}
        associations={[contactsAssociation, companiesAssociation]}
        attachments={attachmentsContent}
        sidebarExtra={productsSidebarCard}
        beforeTabs={pipelineProgressBar}
        tabs={tabs}
        defaultTab={t('detail.tabs.all')}
      />

      {/* === Edit lead drawer === */}
      <SidePanel
        open={editDrawerOpen}
        onOpenChange={setEditDrawerOpen}
        title={t('detail.editDeal')}
      >
        {lead && (
          <LeadForm
            initialData={{
              title: lead.title,
              value: lead.value,
              status: lead.status,
              priority: lead.priority,
              source: lead.source ?? undefined,
              pipelineStageId: lead.pipelineStageId,
              notes: lead.notes ?? undefined,
            }}
            pipelines={pipelines}
            stages={allStages}
            customFieldDefinitions={leadCfDefs}
            customFieldValues={leadCfValues}
            onSubmit={handleEditSubmit}
            onCancel={() => setEditDrawerOpen(false)}
            isSubmitting={isSubmitting}
            extraFields={
              <>
                <RelationshipField
                  label={t('detail.relationships.contacts')}
                  placeholder={t('detail.relationships.searchContacts')}
                  items={
                    contactSearchResults?.page?.map((c) => ({
                      id: c._id,
                      label: `${c.firstName} ${c.lastName ?? ""}`.trim(),
                      sublabel: c.email ?? undefined,
                    })) ?? []
                  }
                  selectedItems={selectedContacts}
                  onSearch={setContactSearch}
                  onSelect={handleLinkContact}
                  onRemove={handleUnlinkContact}
                  allowCreate
                  onCreateNew={() => {
                    setEditDrawerOpen(false);
                    setCreateContactDrawerOpen(true);
                  }}
                  createLabel={t('detail.relationships.createContact')}
                />
                <RelationshipField
                  label={t('detail.relationships.companies')}
                  placeholder={t('detail.relationships.searchCompanies')}
                  items={
                    companySearchResults?.page?.map((c) => ({
                      id: c._id,
                      label: c.name,
                      sublabel: c.domain ?? undefined,
                    })) ?? []
                  }
                  selectedItems={selectedCompanies}
                  onSearch={setCompanySearch}
                  onSelect={handleLinkCompany}
                  onRemove={handleUnlinkCompany}
                  allowCreate
                  onCreateNew={() => {
                    setEditDrawerOpen(false);
                    setCreateCompanyDrawerOpen(true);
                  }}
                  createLabel={t('detail.relationships.createCompany')}
                />
              </>
            }
          />
        )}
      </SidePanel>

      {/* === Create contact drawer === */}
      <SidePanel
        open={createContactDrawerOpen}
        onOpenChange={setCreateContactDrawerOpen}
        title={t('detail.createContact')}
        description={t('detail.createContactDescDeal')}
      >
        <ContactForm
          onSubmit={handleCreateContact}
          onCancel={() => setCreateContactDrawerOpen(false)}
          isSubmitting={isSubmitting}
        />
      </SidePanel>

      {/* === Create company drawer === */}
      <SidePanel
        open={createCompanyDrawerOpen}
        onOpenChange={setCreateCompanyDrawerOpen}
        title={t('detail.createCompany')}
        description={t('detail.createCompanyDescDeal')}
      >
        <CompanyForm
          onSubmit={handleCreateCompany}
          onCancel={() => setCreateCompanyDrawerOpen(false)}
          isSubmitting={isSubmitting}
        />
      </SidePanel>

      {/* === Activity detail drawer === */}
      <ActivityDetailDrawer
        open={activityDrawerOpen}
        onOpenChange={(open) => {
          setActivityDrawerOpen(open);
          if (!open) setSelectedActivityId(null);
        }}
        activity={selectedActivity}
        activityTypeDefs={activityTypeDefs}
        customFieldDefs={activityCustomFieldDefs}
        customFieldValues={selectedActivityCfValues}
        onUpdate={handleUpdateActivity}
        onDelete={handleDeleteActivity}
        onToggleComplete={handleToggleActivityComplete}
        onSaveCustomFields={handleSaveActivityCustomFields}
        isSubmitting={isSubmitting}
      />

      {/* === Lost reason dialog === */}
      <LostReasonDialog
        open={lostDialogOpen}
        onOpenChange={setLostDialogOpen}
        onConfirm={handleMarkLost}
        organizationId={organizationId}
      />
    </>
  );
}
