import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useSupabaseLead } from "@/hooks/use-supabase-leads";
import { useSupabaseActivityTypesList } from "@/hooks/use-supabase-activity-types";
import { useSupabaseCustomFieldDefinitions, useSupabaseCustomFieldValues } from "@/hooks/use-supabase-custom-fields";
import { useSupabaseScheduledActivitiesByEntity } from "@/hooks/use-supabase-scheduled-activities";
import { useSupabaseContactsList } from "@/hooks/use-supabase-contacts";
import { useSupabaseCompaniesList } from "@/hooks/use-supabase-companies";
import { useSupabaseProductsList } from "@/hooks/use-supabase-products";
import {
  useSupabasePipelinesList,
  useSupabasePipelineStages,
  useSupabaseAllPipelineStages,
} from "@/hooks/use-supabase-pipelines";
import { useSupabaseNotesByEntity } from "@/hooks/use-supabase-notes";
import { useSupabaseActivitiesByEntity } from "@/hooks/use-supabase-activities";
import {
  useSupabaseRelationshipsByEntity,
  type MappedRelationship,
} from "@/hooks/use-supabase-relationships";
import { useSupabaseLostReasonsList } from "@/hooks/use-supabase-lost-reasons";
import { useTagDefinitions } from "@/hooks/use-tag-definitions";
import { useCategoryDefinitions } from "@/hooks/use-category-definitions";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  EntityDetailLayout,
  type DetailField,
} from "@/components/crm/entity-detail-layout";
import { useSidebarSlot } from "@/components/layout/sidebar-slot-context";
import { EntityAssociationPanel } from "@/components/crm/entity-association-panel";
import type { SearchResultItem } from "@/components/crm/entity-association-panel";
import { LeadProductsSidebarCard } from "@/components/crm/lead-products-sidebar-card";
import { SidePanel } from "@/components/crm/side-panel";
import { LeadForm } from "@/components/forms/lead-form";
import { ContactForm } from "@/components/forms/contact-form";
import { CompanyForm } from "@/components/forms/company-form";
import { RelationshipField } from "@/components/crm/relationship-field";
import type { RelationshipItem } from "@/components/crm/relationship-field";
import { ActivityForm } from "@/components/crm/activity-form";
import { ActivityDetailDrawer } from "@/components/crm/activity-detail-drawer";
import { ActivityFeed } from "@/components/crm/activity-feed";
import { activitiesToFeedEntries } from "@/components/crm/activity-feed-adapter";
import { ScheduledActivitiesList } from "@/components/shared/scheduled-activities-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RichTextEditor, plateJsonToText } from "@/components/gabinet/rich-text-editor";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  Pencil,
  Plus,
  Upload,
  PhoneCall,
  Pin,
} from "@/lib/ez-icons";
import { Id } from "@cvx/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useCustomFieldForm } from "@/hooks/use-custom-field-form";
import { EmailEntityTab } from "@/components/email/email-entity-tab";
import { EntityDocumentsTab } from "@/components/documents/entity-documents-tab";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";

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
  stages: { _id: string; name: string; color?: string; order: number }[];
  currentStageId?: string;
  onStageClick: (stageId: string) => void;
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
  organizationId: string;
}) {
  const { data: lostReasons } = useSupabaseLostReasonsList(organizationId);
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
  const { setShellSidebarMode } = useSidebarSlot();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // @ts-ignore — TS2589 excessive depth in useMutation type instantiation (pre-existing)
  const updateLead = useAction(api.crm.leads.update);
  const removeLead = useAction(api.crm.leads.remove);
  const moveToStage = useAction(api.crm.leads.moveToStage);
  const createRelationship = useAction(api.relationships.create);
  const removeRelationship = useAction(api.relationships.remove);
  const createContactMutation = useAction(api.crm.contacts.create);
  const createCompanyMutation = useAction(api.crm.companies.create);
  const setCustomFields = useAction(api.customFields.setValues);
  const trackView = useAction(api.recentlyViewed.track);
  const createNote = useAction(api.crm.notes.create);
  const createScheduledActivity = useAction(api.scheduledActivities.create);
  const markActivityComplete = useAction(api.scheduledActivities.markComplete);
  const markActivityIncomplete = useAction(api.scheduledActivities.markIncomplete);
  const updateScheduledActivity = useAction(api.scheduledActivities.update);
  const removeScheduledActivity = useAction(api.scheduledActivities.remove);
  const addProductToDeal = useAction(api.crm.products.addToDeal);
  const removeProductFromDeal = useAction(api.crm.products.removeFromDeal);
  const listDocumentsByEntity = useAction(api.documents.documents.listByEntity);

  const { data: leadDocuments } = useQuery({
    queryKey: [
      "documents.documents.listByEntity",
      organizationId,
      "lead",
      leadId,
    ],
    queryFn: () =>
      listDocumentsByEntity({
        organizationId,
        entityType: "lead",
        entityId: leadId,
      }),
    enabled: !!organizationId && !!leadId,
  });

  const { data: currentUser } = useQuery(
    convexQuery(api.app.getCurrentUser, {})
  );

  const { data: activityTypeDefs } = useSupabaseActivityTypesList(organizationId);

  const { data: activityCustomFieldDefs } = useSupabaseCustomFieldDefinitions(
    organizationId,
    "activity",
  );

  // Contact tag/category/custom-field defs for the create-contact drawer
  // (kept in sync with the contacts list create-form props).
  const { data: contactCustomFieldDefs } = useSupabaseCustomFieldDefinitions(
    organizationId,
    "contact",
  );
  const { tags: orgTags } = useTagDefinitions(organizationId);
  const { categories: contactCategories } = useCategoryDefinitions(
    organizationId,
    "contact",
  );

  // Lead entity custom fields
  const {
    definitions: leadCfDefs,
  } = useCustomFieldForm({ organizationId, entityType: "lead" });

  const { data: leadCfValuesRaw } = useSupabaseCustomFieldValues(
    organizationId,
    "lead",
    leadId,
  );

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

  const { data: selectedActivityCfRaw } = useSupabaseCustomFieldValues(
    organizationId,
    "activity",
    selectedActivityId ?? undefined,
  );

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
  // Sidebar UI state
  const [newNote, setNewNote] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [sidebarContactSearch, setSidebarContactSearch] = useState("");
  const [sidebarCompanySearch, setSidebarCompanySearch] = useState("");
  const [guestContactSearch, setGuestContactSearch] = useState("");
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [productQuantity, setProductQuantity] = useState("1");
  const [productUnitPrice, setProductUnitPrice] = useState("");
  const [productDiscount, setProductDiscount] = useState("");

  // Edit drawer relationship search
  const [contactSearch, setContactSearch] = useState("");
  const [companySearch, setCompanySearch] = useState("");

  // --- Data queries ---

  const { data: lead, isLoading } = useSupabaseLead(organizationId, leadId);

  useEffect(() => {
    setShellSidebarMode("icon-only");
    return () => setShellSidebarMode("default");
  }, [setShellSidebarMode]);

  useEffect(() => {
    if (lead && organizationId) {
      trackView({ organizationId, entityType: "leads", entityId: lead._id, entityLabel: lead.title });
    }
  }, [lead?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: allStages } = useSupabaseAllPipelineStages(organizationId);

  // Derive pipelineId from the lead's current stage
  const pipelineId = useMemo(() => {
    if (!lead?.pipelineStageId || !allStages) return undefined;
    const currentStage = allStages.find((s) => s._id === lead.pipelineStageId);
    return currentStage?.pipelineId;
  }, [lead?.pipelineStageId, allStages]);

  const { data: stages } = useSupabasePipelineStages(
    organizationId,
    pipelineId,
    { enabled: !!pipelineId },
  );

  const { data: pipelines } = useSupabasePipelinesList(organizationId);

  const { data: activitiesRaw } = useSupabaseActivitiesByEntity(
    organizationId,
    "lead",
    leadId,
  );
  const activities = activitiesRaw;

  const relationshipsQueryKey = [...supabaseKeys.objectRelationships.list(organizationId), "lead", leadId] as const;
  const relationshipsQuery = useSupabaseRelationshipsByEntity(
    organizationId,
    "lead",
    leadId,
  );
  const relationships = relationshipsQuery.data;

  const listProductsByDeal = useAction(api.crm.products.listByDeal);
  const dealProductsQueryKey = useMemo(
    () => ["products.listByDeal", organizationId, leadId] as const,
    [organizationId, leadId],
  );
  const { data: dealProducts } = useQuery({
    queryKey: dealProductsQueryKey,
    queryFn: () =>
      listProductsByDeal({
        organizationId,
        dealId: leadId as string,
      }),
    enabled: !!organizationId && !!leadId,
  });

  const { data: notesData } = useSupabaseNotesByEntity(
    organizationId,
    "lead",
    leadId,
  );

  const { data: scheduledActivitiesData } = useSupabaseScheduledActivitiesByEntity(
    organizationId,
    "lead",
    leadId,
  );

  // Edit drawer search
  const { data: contactSearchResults } = useSupabaseContactsList(
    organizationId,
    { search: contactSearch || undefined, enabled: contactSearch.length > 0 },
  );

  const { data: companySearchResults } = useSupabaseCompaniesList(
    organizationId,
    { search: companySearch || undefined, enabled: companySearch.length > 0 },
  );

  // Sidebar inline search
  const sidebarContactSearchQuery = sidebarContactSearch.trim();
  const sidebarCompanySearchQuery = sidebarCompanySearch.trim();

  const { data: sidebarContactResults, isFetching: isSearchingContacts } = useSupabaseContactsList(
    organizationId,
    { search: sidebarContactSearchQuery || undefined, enabled: sidebarContactSearchQuery.length >= 3 },
  );

  const { data: sidebarCompanyResults, isFetching: isSearchingCompanies } = useSupabaseCompaniesList(
    organizationId,
    { search: sidebarCompanySearchQuery || undefined, enabled: sidebarCompanySearchQuery.length >= 3 },
  );

  const productSearchQuery = productSearch.trim();
  const { data: productSearchResults, isFetching: isSearchingProducts } = useSupabaseProductsList(
    organizationId,
    {
      search: productSearchQuery || undefined,
      enabled: productDialogOpen && productSearchQuery.length >= 3,
      sortOrder: "asc",
    },
  );

  // Full-list lookups NOT needed — relationships already carry targetName/targetSublabel

  // Guest contact search for activity form
  const { data: guestContactResults } = useSupabaseContactsList(
    organizationId,
    { search: guestContactSearch || undefined, enabled: guestContactSearch.length > 0 },
  );

  // --- Loading / not found handled by EntityDetailLayout ---

  // --- Handlers ---

  const handleEditSubmit = async (
    formData: {
      title: string;
      value?: number | null;
      status: string;
      priority?: string | null;
      source?: string | null;
      pipelineStageId?: string | null;
      notes?: string | null;
      tagIds?: Id<"tagDefinitions">[];
      categoryId?: Id<"categoryDefinitions"> | null;
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
        tagIds: formData.tagIds,
        categoryId: formData.categoryId,
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
      queryClient.invalidateQueries({ queryKey: supabaseKeys.leads.all });
      queryClient.invalidateQueries({ queryKey: supabaseKeys.pipelineStages.all });
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "leads.errors.updateFailed",
          defaultValue: "Nie udało się zapisać szansy sprzedaży.",
        }),
      );
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
    queryClient.invalidateQueries({ queryKey: supabaseKeys.leads.all });
  };

  const handleMarkLost = async (reason: string) => {
    await updateLead({
      organizationId,
      leadId: leadId as Id<"leads">,
      status: "lost",
      lostReason: reason,
    });
    queryClient.invalidateQueries({ queryKey: supabaseKeys.leads.all });
    setLostDialogOpen(false);
  };

  const handleDelete = async () => {
    if (window.confirm(t('detail.confirmDeleteDeal'))) {
      await removeLead({
        organizationId,
        leadId: leadId as Id<"leads">,
      });
      queryClient.invalidateQueries({ queryKey: supabaseKeys.leads.all });
      navigate({ to: "/dashboard/leads" });
    }
  };

  const handleStageClick = async (stageId: string) => {
    await moveToStage({
      organizationId,
      leadId: leadId as Id<"leads">,
      pipelineStageId: stageId as Id<"pipelineStages">,
      stageOrder: 0,
    });
    queryClient.invalidateQueries({ queryKey: supabaseKeys.leads.all });
  };

  const handleLinkContact = async (item: RelationshipItem) => {
    const optimisticRelationship: MappedRelationship = {
      _id: `optimistic:lead:${leadId}:contact:${item.id}`,
      organizationId,
      sourceType: "lead",
      sourceId: leadId,
      targetType: "contact",
      targetId: item.id,
      createdBy: currentUser?._id ?? "optimistic",
      createdAt: Date.now(),
      targetName: item.label,
      targetSublabel: item.sublabel,
      _source: "supabase",
    };

    queryClient.setQueryData<MappedRelationship[] | undefined>(
      relationshipsQueryKey,
      (current = []) => {
        if (current.some((rel) => rel.targetType === "contact" && rel.targetId === item.id)) {
          return current;
        }
        return [...current, optimisticRelationship];
      },
    );

    try {
      await createRelationship({
        organizationId,
        sourceType: "lead",
        sourceId: leadId,
        targetType: "contact",
        targetId: item.id,
      });
    } catch (error) {
      void queryClient.invalidateQueries({ queryKey: relationshipsQueryKey });
      throw error;
    }

    void queryClient.invalidateQueries({ queryKey: supabaseKeys.objectRelationships.list(organizationId) });
  };

  const handleUnlinkContact = async (targetId: string) => {
    const rel = contactRelationships.find((r) => r.targetId === targetId);
    if (rel) {
      queryClient.setQueryData<MappedRelationship[] | undefined>(
        relationshipsQueryKey,
        (current = []) => current.filter((item) => item._id !== rel._id),
      );

      try {
        await removeRelationship({ organizationId, relationshipId: rel._id as Id<"objectRelationships"> });
      } catch (error) {
        void queryClient.invalidateQueries({ queryKey: relationshipsQueryKey });
        throw error;
      }

      void queryClient.invalidateQueries({ queryKey: supabaseKeys.objectRelationships.all });
    }
  };

  const handleLinkCompany = async (item: RelationshipItem) => {
    const optimisticRelationship: MappedRelationship = {
      _id: `optimistic:lead:${leadId}:company:${item.id}`,
      organizationId,
      sourceType: "lead",
      sourceId: leadId,
      targetType: "company",
      targetId: item.id,
      createdBy: currentUser?._id ?? "optimistic",
      createdAt: Date.now(),
      targetName: item.label,
      targetSublabel: item.sublabel,
      _source: "supabase",
    };

    queryClient.setQueryData<MappedRelationship[] | undefined>(
      relationshipsQueryKey,
      (current = []) => {
        if (current.some((rel) => rel.targetType === "company" && rel.targetId === item.id)) {
          return current;
        }
        return [...current, optimisticRelationship];
      },
    );

    try {
      await createRelationship({
        organizationId,
        sourceType: "lead",
        sourceId: leadId,
        targetType: "company",
        targetId: item.id,
      });
    } catch (error) {
      void queryClient.invalidateQueries({ queryKey: relationshipsQueryKey });
      throw error;
    }

    void queryClient.invalidateQueries({ queryKey: supabaseKeys.objectRelationships.list(organizationId) });
  };

  const handleUnlinkCompany = async (targetId: string) => {
    const rel = companyRelationships.find((r) => r.targetId === targetId);
    if (rel) {
      queryClient.setQueryData<MappedRelationship[] | undefined>(
        relationshipsQueryKey,
        (current = []) => current.filter((item) => item._id !== rel._id),
      );

      try {
        await removeRelationship({ organizationId, relationshipId: rel._id as Id<"objectRelationships"> });
      } catch (error) {
        void queryClient.invalidateQueries({ queryKey: relationshipsQueryKey });
        throw error;
      }

      void queryClient.invalidateQueries({ queryKey: supabaseKeys.objectRelationships.all });
    }
  };

  const handleCreateContact = async (
    formData: {
      firstName: string;
      lastName?: string | null;
      email?: string | null;
      phone?: string | null;
      title?: string | null;
      source?: string | null;
      tags?: string[];
      tagIds?: Id<"tagDefinitions">[];
      categoryId?: Id<"categoryDefinitions"> | null;
      notes?: string | null;
    },
    customFieldRecord: Record<string, unknown>
  ) => {
    setIsSubmitting(true);
    try {
      const customFields = contactCustomFieldDefs && Object.keys(customFieldRecord).length > 0
        ? contactCustomFieldDefs
            .filter((d) => customFieldRecord[d.fieldKey] !== undefined && customFieldRecord[d.fieldKey] !== "")
            .map((d) => ({ fieldDefinitionId: d._id, value: customFieldRecord[d.fieldKey] }))
        : undefined;
      const contactId = await createContactMutation({
        organizationId,
        ...formData,
        customFields: customFields && customFields.length > 0 ? customFields : undefined,
      });
      await createRelationship({
        organizationId,
        sourceType: "lead",
        sourceId: leadId,
        targetType: "contact",
        targetId: contactId,
      });
      setCreateContactDrawerOpen(false);
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.objectRelationships.all });
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "contacts.errors.createFailed",
          defaultValue: "Nie udało się dodać kontaktu.",
        }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateCompany = async (
    formData: { name: string; domain?: string | null; industry?: string | null; size?: string | null; website?: string | null; phone?: string | null; notes?: string | null },
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
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.objectRelationships.all });
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "companies.errors.createFailed",
          defaultValue: "Nie udało się dodać firmy.",
        }),
      );
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
      queryClient.invalidateQueries({ queryKey: supabaseKeys.notes.all });
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "notes.errors.createFailed",
          defaultValue: "Nie udało się dodać notatki.",
        }),
      );
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleOpenProductDialog = () => {
    setProductDialogOpen(true);
  };

  const handleCloseProductDialog = (open: boolean) => {
    setProductDialogOpen(open);
    if (!open) {
      setProductSearch("");
      setSelectedProductId(null);
      setProductQuantity("1");
      setProductUnitPrice("");
      setProductDiscount("");
    }
  };

  const handleSelectProduct = (productId: string) => {
    setSelectedProductId(productId);
    const selectedProduct = productSearchResults?.find((product) => product._id === productId);
    setProductUnitPrice(selectedProduct ? String(selectedProduct.unitPrice) : "");
  };

  const handleAddDealProduct = async () => {
    if (!selectedProductId) return;

    const quantity = Number(productQuantity);
    const unitPrice = Number(productUnitPrice.replace(",", "."));
    const discount = productDiscount.trim() ? Number(productDiscount.replace(",", ".")) : undefined;

    if (!Number.isFinite(quantity) || quantity <= 0) return;
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return;
    if (discount !== undefined && (!Number.isFinite(discount) || discount < 0)) return;

    await addProductToDeal({
      organizationId,
      dealId: leadId,
      productId: selectedProductId,
      quantity,
      unitPrice,
      discount,
    });

    await queryClient.invalidateQueries({ queryKey: dealProductsQueryKey });
    handleCloseProductDialog(false);
  };

  const handleRemoveDealProduct = async (dealProductId: string) => {
    await removeProductFromDeal({
      organizationId,
      dealProductId,
    });

    await queryClient.invalidateQueries({ queryKey: dealProductsQueryKey });
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

  const relationshipItems = relationships ?? [];
  const contactRelationships = relationshipItems.filter((r) => r.targetType === "contact");
  const companyRelationships = relationshipItems.filter((r) => r.targetType === "company");

  const selectedContacts: RelationshipItem[] = contactRelationships.map((r) => ({
    id: r.targetId,
    label: r.targetName ?? r.targetId,
    sublabel: r.targetSublabel,
  }));

  const selectedCompanies: RelationshipItem[] = companyRelationships.map((r) => ({
    id: r.targetId,
    label: r.targetName ?? r.targetId,
    sublabel: r.targetSublabel,
  }));

  // Association items — use targetName/targetSublabel from relationships directly (no full-list lookup)
  const contactAssociationItems = contactRelationships.map((r) => ({
    id: r.targetId,
    label: r.targetName ?? r.targetId,
    sublabel: r.targetSublabel,
  }));

  const companyAssociationItems = companyRelationships.map((r) => ({
    id: r.targetId,
    label: r.targetName ?? r.targetId,
    sublabel: r.targetSublabel,
  }));

  const contactSearchResultsForPanel: SearchResultItem[] = (sidebarContactResults ?? [])
    .map((c) => ({ id: c._id, label: `${c.firstName} ${c.lastName ?? ""}`.trim(), sublabel: c.email ?? undefined }));

  const companySearchResultsForPanel: SearchResultItem[] = (sidebarCompanyResults ?? [])
    .map((c) => ({ id: c._id, label: c.name, sublabel: c.domain ?? undefined }));

  const selectedActivity = scheduledActivitiesData?.find(
    (a) => a._id === selectedActivityId
  ) ?? null;

  const pipelineName = pipelineId
    ? pipelines?.find((p) => p._id === pipelineId)?.name
    : undefined;

  const currentStageName = lead?.pipelineStageId
    ? allStages?.find((s) => s._id === lead.pipelineStageId)?.name
    : undefined;

  const totalProductValue = dealProducts?.reduce(
    (sum, dp) => sum + dp.quantity * dp.unitPrice,
    0
  ) ?? 0;

  const selectedProduct = productSearchResults?.find((product) => product._id === selectedProductId) ?? null;
  const canSubmitProduct = !!selectedProductId && !!productQuantity.trim() && !!productUnitPrice.trim();

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
        { label: t('detail.fields.company'), value: companyRelationships[0] ? (companyRelationships[0] as any).targetName ?? undefined : undefined, fieldKey: "company" },
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

  // --- Sidebar association sections (using EntityAssociationPanel like company page) ---

  const contactsAssociation = {
    title: t('detail.relationships.contacts'),
    count: contactRelationships.length,
    onCreateNew: () => setCreateContactDrawerOpen(true),
    children: (
      <EntityAssociationPanel
        hideHeader
        title={t('detail.relationships.contacts')}
        items={contactAssociationItems}
        searchPlaceholder={t('detail.relationships.searchContacts')}
        emptyText={t('detail.relationships.emptyDealContacts')}
        onItemClick={(id) => navigate({ to: `/dashboard/contacts/${id}` })}
        onLink={(item) => handleLinkContact({ id: item.id, label: item.label })}
        onUnlink={handleUnlinkContact}
        onCreateNew={() => setCreateContactDrawerOpen(true)}
        searchResults={contactSearchResultsForPanel}
        isSearching={isSearchingContacts}
        onSearchChange={setSidebarContactSearch}
      />
    ),
  };

  const companiesAssociation = {
    title: t('detail.relationships.companies'),
    count: companyRelationships.length,
    onCreateNew: () => setCreateCompanyDrawerOpen(true),
    children: (
      <EntityAssociationPanel
        hideHeader
        title={t('detail.relationships.companies')}
        items={companyAssociationItems}
        searchPlaceholder={t('detail.relationships.searchCompanies')}
        emptyText={t('detail.relationships.emptyDealCompany')}
        onItemClick={(id) => navigate({ to: `/dashboard/companies/${id}` })}
        onLink={(item) => handleLinkCompany({ id: item.id, label: item.label })}
        onUnlink={handleUnlinkCompany}
        onCreateNew={() => setCreateCompanyDrawerOpen(true)}
        searchResults={companySearchResultsForPanel}
        isSearching={isSearchingCompanies}
        onSearchChange={setSidebarCompanySearch}
      />
    ),
  };

  // --- Products sidebar card ---

  const productsSidebarCard = (
    <LeadProductsSidebarCard
      title={t('detail.relationships.products')}
      emptyText={t('detail.relationships.emptyDealProducts')}
      totalLabel={t('detail.fields.total')}
      addLabel={t('detail.relationships.add')}
      products={dealProducts ?? []}
      onAddProduct={handleOpenProductDialog}
      onRemoveProduct={handleRemoveDealProduct}
      formatCurrency={formatCurrency}
      unknownLabel={t('detail.fields.unknown')}
      productDialog={{
        open: productDialogOpen,
        onOpenChange: handleCloseProductDialog,
        searchValue: productSearch,
        onSearchChange: setProductSearch,
        searchResults: (productSearchResults ?? []).map((product) => ({
          _id: product._id,
          name: product.name,
          unitPrice: product.unitPrice,
        })),
        isSearching: isSearchingProducts,
        selectedProductId,
        selectedProduct: selectedProduct
          ? {
              _id: selectedProduct._id,
              name: selectedProduct.name,
              unitPrice: selectedProduct.unitPrice,
            }
          : null,
        onSelectProduct: handleSelectProduct,
        quantity: productQuantity,
        onQuantityChange: setProductQuantity,
        unitPrice: productUnitPrice,
        onUnitPriceChange: setProductUnitPrice,
        discount: productDiscount,
        onDiscountChange: setProductDiscount,
        searchPlaceholder: t('detail.relationships.searchProducts'),
        searchLoadingLabel: `${t('common.search')}...`,
        noResultsLabel: t('detail.relationships.noResults'),
        minimumSearchLabel: t('detail.relationships.minimumSearchProducts'),
        quantityLabel: t('products.quantity'),
        unitPriceLabel: t('products.unitPrice'),
        discountLabel: t('products.discount'),
        cancelLabel: t('common.cancel'),
        confirmLabel: t('common.add'),
        canConfirm: canSubmitProduct,
        onConfirm: handleAddDealProduct,
      }}
    />
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
        <DropdownMenuItem onClick={() => setShowActivityForm(true)}>
          {t("entityActions.scheduleActivity")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => {}}>
          {t("entityActions.sendEmail")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => {}}>
          {t("entityActions.addNote")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => {}}>
          {t("entityActions.logCall")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => {}}>
          {t("entityActions.share")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleMarkWon}>
          {t('detail.won')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setLostDialogOpen(true)}
          className="text-destructive focus:text-destructive"
        >
          {t('detail.lost')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
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
      {pipelineName && currentStageName && (
        <span>{pipelineName} &gt; {currentStageName}</span>
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

  // --- Tab definitions ---

  const tabs = [
    {
      label: t('detail.tabs.all'),
      content: (
        <>
          <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
            <span>{t('detail.actions.filterBy')}</span>
            <Button variant="outline" size="sm" className="h-7">
              {t('detail.tabs.all')}
              <ChevronDown className="ml-1 h-4 w-4" variant="stroke" />
            </Button>
          </div>
          <ActivityFeed
            entries={activitiesToFeedEntries((activities ?? []) as any[], t)}
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
                customFieldDefs={activityCustomFieldDefs as any}
                contactSearchResults={
                  guestContactResults?.map((c) => ({
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
      count: leadDocuments?.length ?? 0,
      content: (
        <EntityDocumentsTab
          entityType="lead"
          entityId={leadId}
          organizationId={organizationId}
        />
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
              <RichTextEditor
                value={newNote}
                onChange={(val) => setNewNote(val ?? "")}
                placeholder={t('detail.notes.placeholder')}
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
                    <p className="text-sm whitespace-pre-wrap">{plateJsonToText(note.content as string)}</p>
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
        owner={lead?.assignedTo ? { name: t('detail.actions.owner') } : undefined}
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
              status: lead.status as "open" | "won" | "lost" | "archived",
              priority: lead.priority as "low" | "medium" | "high" | "urgent" | undefined,
              source: lead.source ?? undefined,
              pipelineStageId: lead.pipelineStageId as Id<"pipelineStages"> | undefined,
              notes: lead.notes ?? undefined,
              tagIds: lead.tagIds as Id<"tagDefinitions">[] | undefined,
              categoryId: lead.categoryId as Id<"categoryDefinitions"> | undefined,
            }}
            pipelines={pipelines as any}
            stages={allStages as any}
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
                    contactSearchResults?.map((c) => ({
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
                    companySearchResults?.map((c) => ({
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
          showSourceAndTags
          customFieldDefinitions={contactCustomFieldDefs as any}
          tagDefinitions={orgTags}
          categoryDefinitions={contactCategories}
          organizationId={organizationId}
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
