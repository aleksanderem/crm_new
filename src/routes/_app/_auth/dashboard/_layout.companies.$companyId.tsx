import { useState, useMemo, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useSupabaseCompany } from "@/hooks/use-supabase-companies";
import { useSupabaseNotesByEntity } from "@/hooks/use-supabase-notes";
import { useSupabaseActivitiesByEntity } from "@/hooks/use-supabase-activities";
import { useSupabaseCustomFieldValues, useSupabaseCustomFieldDefinitions } from "@/hooks/use-supabase-custom-fields";
import {
  useSupabaseRelationshipsByEntity,
  type MappedRelationship,
} from "@/hooks/use-supabase-relationships";
import { useSupabaseActivityTypesList } from "@/hooks/use-supabase-activity-types";
import { useSupabaseScheduledActivitiesByEntity } from "@/hooks/use-supabase-scheduled-activities";
import { useSupabaseLeadsList } from "@/hooks/use-supabase-leads";
import { useSupabaseContactsList } from "@/hooks/use-supabase-contacts";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { formatPhoneNumber } from "@/lib/phone";
import { SidePanel } from "@/components/crm/side-panel";
import { CompanyForm } from "@/components/forms/company-form";
import { ContactForm } from "@/components/forms/contact-form";
import { RelationshipField } from "@/components/crm/relationship-field";
import type { RelationshipItem } from "@/components/crm/relationship-field";
import { ActivityForm } from "@/components/crm/activity-form";
import { ActivityDetailDrawer } from "@/components/crm/activity-detail-drawer";
import { ActivityFeed } from "@/components/crm/activity-feed";
import { activitiesToFeedEntries } from "@/components/crm/activity-feed-adapter";
import { LeadForm } from "@/components/forms/lead-form";
import { ScheduledActivitiesList } from "@/components/shared/scheduled-activities-list";
import { Button } from "@/components/ui/button";
import { RichTextEditor, plateJsonToText } from "@/components/gabinet/rich-text-editor";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  Plus,
  PhoneCall,
  Pin,
  Upload,
} from "@/lib/ez-icons";
import { Id } from "@cvx/_generated/dataModel";
import { useCustomFieldForm } from "@/hooks/use-custom-field-form";
import { useTranslation } from "react-i18next";
import { EmailEntityTab } from "@/components/email/email-entity-tab";
import { EntityDetailLayout } from "@/components/crm/entity-detail-layout";
import type { DetailField } from "@/components/crm/entity-detail-layout";
import { EntityDocumentsTab } from "@/components/documents/entity-documents-tab";
import { EntityAssociationPanel } from "@/components/crm/entity-association-panel";
import type { SearchResultItem } from "@/components/crm/entity-association-panel";
import { CompanyOverviewTab } from "@/components/crm/company-overview-tab";
import { useSidebarSlot } from "@/components/layout/sidebar-slot-context";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/companies/$companyId"
)({
  component: CompanyDetail,
});

function CompanyDetail() {
  const { companyId } = Route.useParams();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { setShellSidebarMode } = useSidebarSlot();
  // @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
  const updateCompany = useAction(api.companies.update);
  const removeCompany = useAction(api.companies.remove);
  const createRelationship = useAction(api.relationships.create);
  const removeRelationship = useAction(api.relationships.remove);
  const createContact = useAction(api.contacts.create);
  const createNote = useAction(api.notes.create);
  const createLead = useAction(api.leads.create);
  const createScheduledActivity = useAction(api.scheduledActivities.create);
  const markActivityComplete = useAction(api.scheduledActivities.markComplete);
  const markActivityIncomplete = useAction(api.scheduledActivities.markIncomplete);
  const updateScheduledActivity = useAction(api.scheduledActivities.update);
  const removeScheduledActivity = useAction(api.scheduledActivities.remove);
  const setCustomFields = useAction(api.customFields.setValues);
  const trackView = useAction(api.recentlyViewed.track);
  const listDocumentsByEntity = useAction(api.documents.documents.listByEntity);

  const { data: currentUser } = useQuery(
    convexQuery(api.app.getCurrentUser, {})
  );

  const { data: companyDocuments } = useQuery({
    queryKey: [
      "documents.documents.listByEntity",
      organizationId,
      "company",
      companyId,
    ],
    queryFn: () =>
      listDocumentsByEntity({
        organizationId,
        entityType: "company",
        entityId: companyId,
      }),
    enabled: !!organizationId && !!companyId,
  });

  const { data: activityTypeDefs } = useSupabaseActivityTypesList(organizationId);

  const { data: activityCustomFieldDefs } = useSupabaseCustomFieldDefinitions(
    organizationId,
    "activity",
  );

  // Company entity custom fields
  const {
    definitions: companyCfDefs,
    saveValues: _saveCompanyCfValues,
  } = useCustomFieldForm({ organizationId, entityType: "company" });

  const { data: companyCfValuesRaw } = useSupabaseCustomFieldValues(
    organizationId,
    "company",
    companyId,
  );

  const companyCfValues = useMemo(() => {
    if (!companyCfValuesRaw || !companyCfDefs) return {};
    const defIdToKey: Record<string, string> = {};
    companyCfDefs.forEach((d) => { defIdToKey[d._id] = d.fieldKey; });
    const result: Record<string, unknown> = {};
    companyCfValuesRaw.forEach((v) => {
      const key = defIdToKey[v.fieldDefinitionId];
      if (key) result[key] = v.value;
    });
    return result;
  }, [companyCfValuesRaw, companyCfDefs]);

  // Custom field values for the selected activity in the drawer
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

  // Drawer state
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [createContactDrawerOpen, setCreateContactDrawerOpen] = useState(false);
  const [activityDrawerOpen, setActivityDrawerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [createLeadDrawerOpen, setCreateLeadDrawerOpen] = useState(false);
  // Sidebar link toggles removed — EntityAssociationPanel manages its own search state

  // Relationship search state for edit drawer
  const [dealSearch, setDealSearch] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [guestContactSearch, setGuestContactSearch] = useState("");
  const [sidebarDealSearch, setSidebarDealSearch] = useState("");
  const [sidebarContactSearch, setSidebarContactSearch] = useState("");

  const { data: company, isLoading } = useSupabaseCompany(organizationId, companyId);

  useEffect(() => {
    setShellSidebarMode("icon-only");
    return () => setShellSidebarMode("default");
  }, [setShellSidebarMode]);

  useEffect(() => {
    if (company && organizationId) {
      trackView({ organizationId, entityType: "companies", entityId: company._id, entityLabel: company.name });
    }
  }, [company?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: activities } = useSupabaseActivitiesByEntity(
    organizationId,
    "company",
    companyId,
  );

  const relationshipsQueryKey = [...supabaseKeys.objectRelationships.list(organizationId), "company", companyId] as const;
  const { data: relationships } = useSupabaseRelationshipsByEntity(
    organizationId,
    "company",
    companyId,
  );

  const { data: notesData } = useSupabaseNotesByEntity(
    organizationId,
    "company",
    companyId,
  );

  const { data: scheduledActivitiesData } = useSupabaseScheduledActivitiesByEntity(
    organizationId,
    "company",
    companyId,
  );

  // Search queries for relationship fields in edit drawer
  const { data: dealSearchResults } = useSupabaseLeadsList(
    organizationId,
    { search: dealSearch || undefined, enabled: dealSearch.length > 0 },
  );

  const { data: contactSearchResults } = useSupabaseContactsList(
    organizationId,
    { search: contactSearch || undefined, enabled: contactSearch.length > 0 },
  );

  const sidebarDealSearchQuery = sidebarDealSearch.trim();
  const sidebarContactSearchQuery = sidebarContactSearch.trim();

  const { data: sidebarDealResults } = useSupabaseLeadsList(
    organizationId,
    { search: sidebarDealSearchQuery || undefined, enabled: sidebarDealSearchQuery.length >= 3 },
  );

  const { data: sidebarContactResults } = useSupabaseContactsList(
    organizationId,
    { search: sidebarContactSearchQuery || undefined, enabled: sidebarContactSearchQuery.length >= 3 },
  );

  // Guest contact search for activity form
  const { data: guestContactResults } = useSupabaseContactsList(
    organizationId,
    { search: guestContactSearch || undefined, enabled: guestContactSearch.length > 0 },
  );

  // Full-list lookups NOT needed — relationships already carry targetName/targetSublabel

  // --- Handlers ---

  const handleEditSubmit = async (
    formData: {
      name: string;
      domain?: string | null;
      industry?: string | null;
      size?: string | null;
      website?: string | null;
      phone?: string | null;
      address?: {
        street?: string;
        city?: string;
        state?: string;
        zip?: string;
        country?: string;
      } | null;
      notes?: string | null;
      tagIds?: Id<"tagDefinitions">[];
      categoryId?: Id<"categoryDefinitions"> | null;
    },
    customFieldRecord: Record<string, unknown>
  ) => {
    setIsSubmitting(true);
    try {
      await updateCompany({
        organizationId,
        companyId: companyId as Id<"companies">,
        name: formData.name,
        domain: formData.domain,
        industry: formData.industry,
        size: formData.size,
        website: formData.website,
        phone: formData.phone,
        address: formData.address,
        notes: formData.notes,
        tagIds: formData.tagIds,
        categoryId: formData.categoryId,
      });
      // Save company custom field values
      if (companyCfDefs) {
        const fieldsToSave = companyCfDefs
          .filter((d) => customFieldRecord[d.fieldKey] !== undefined && customFieldRecord[d.fieldKey] !== "")
          .map((d) => ({
            fieldDefinitionId: d._id as Id<"customFieldDefinitions">,
            value: customFieldRecord[d.fieldKey],
          }));
        if (fieldsToSave.length > 0) {
          await setCustomFields({
            organizationId,
            entityType: "company" as any,
            entityId: companyId,
            fields: fieldsToSave,
          });
        }
      }
      setEditDrawerOpen(false);
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.companies.all });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm(t('detail.confirmDeleteCompany'))) {
      await removeCompany({
        organizationId,
        companyId: companyId as Id<"companies">,
      });
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.companies.all });
      navigate({ to: "/dashboard/companies" });
    }
  };

  const handleLinkDeal = async (item: RelationshipItem) => {
    const optimisticRelationship: MappedRelationship = {
      _id: `optimistic:company:${companyId}:deal:${item.id}`,
      organizationId,
      sourceType: "company",
      sourceId: companyId,
      targetType: "deal",
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
        if (current.some((rel) => rel.targetType === "deal" && rel.targetId === item.id)) {
          return current;
        }
        return [...current, optimisticRelationship];
      },
    );

    try {
      await createRelationship({
        organizationId,
        sourceType: "company",
        sourceId: companyId,
        targetType: "deal",
        targetId: item.id,
      });
    } catch (error) {
      void queryClient.invalidateQueries({ queryKey: relationshipsQueryKey });
      throw error;
    }

    void queryClient.invalidateQueries({ queryKey: supabaseKeys.objectRelationships.list(organizationId) });
  };

  const handleUnlinkDeal = async (targetId: string) => {
    const rel = dealRelationships.find((r) => r.targetId === targetId);
    if (rel) {
      queryClient.setQueryData<MappedRelationship[] | undefined>(
        relationshipsQueryKey,
        (current = []) => current.filter((item) => item._id !== rel._id),
      );

      try {
        await removeRelationship({ organizationId, relationshipId: rel._id as any });
      } catch (error) {
        void queryClient.invalidateQueries({ queryKey: relationshipsQueryKey });
        throw error;
      }

      void queryClient.invalidateQueries({ queryKey: supabaseKeys.objectRelationships.list(organizationId) });
    }
  };

  const handleLinkContact = async (item: RelationshipItem) => {
    const optimisticRelationship: MappedRelationship = {
      _id: `optimistic:company:${companyId}:contact:${item.id}`,
      organizationId,
      sourceType: "company",
      sourceId: companyId,
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
        sourceType: "company",
        sourceId: companyId,
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
        await removeRelationship({ organizationId, relationshipId: rel._id as any });
      } catch (error) {
        void queryClient.invalidateQueries({ queryKey: relationshipsQueryKey });
        throw error;
      }

      void queryClient.invalidateQueries({ queryKey: supabaseKeys.objectRelationships.list(organizationId) });
    }
  };

  const handleCreateContact = async (
    formData: {
      firstName: string;
      lastName?: string | null;
      email?: string | null;
      phone?: string | null;
      title?: string | null;
    },
    _customFields: Record<string, unknown>
  ) => {
    setIsSubmitting(true);
    try {
      const contactId = await createContact({
        organizationId,
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        title: formData.title,
      });
      await createRelationship({
        organizationId,
        sourceType: "company",
        sourceId: companyId,
        targetType: "contact",
        targetId: contactId,
      });
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.objectRelationships.list(organizationId) });
      setCreateContactDrawerOpen(false);
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
        entityType: "company",
        entityId: companyId,
        content: newNote.trim(),
      });
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.notes.list(organizationId) });
      setNewNote("");
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleCreateLead = async (
    formData: {
      title: string;
      value?: number;
      status: string;
      notes?: string;
    },
    _customFields: Record<string, unknown>
  ) => {
    setIsSubmitting(true);
    try {
      const leadId = await createLead({
        organizationId,
        title: formData.title,
        value: formData.value,
        status: formData.status as "open" | "won" | "lost" | "archived",
        notes: formData.notes,
      });
      await createRelationship({
        organizationId,
        sourceType: "company",
        sourceId: companyId,
        targetType: "deal",
        targetId: leadId,
      });
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.objectRelationships.list(organizationId) });
      setCreateLeadDrawerOpen(false);
    } finally {
      setIsSubmitting(false);
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
      linkedEntityType: "company",
      linkedEntityId: companyId,
    });
    if (data.isCompleted && activityId) {
      await markActivityComplete({
        organizationId,
        activityId,
      });
    }
    if (data.note) {
      await createNote({
        organizationId,
        entityType: "company",
        entityId: companyId,
        content: data.note,
      });
    }
    // Save custom field values
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
    void queryClient.invalidateQueries({ queryKey: supabaseKeys.scheduledActivities.list(organizationId) });
    void queryClient.invalidateQueries({ queryKey: supabaseKeys.activities.list(organizationId) });
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
    void queryClient.invalidateQueries({ queryKey: supabaseKeys.scheduledActivities.list(organizationId) });
  };

  const handleDeleteActivity = async (activityId: string) => {
    await removeScheduledActivity({
      organizationId,
      activityId: activityId as Id<"scheduledActivities">,
    });
    void queryClient.invalidateQueries({ queryKey: supabaseKeys.scheduledActivities.list(organizationId) });
    setActivityDrawerOpen(false);
    setSelectedActivityId(null);
  };

  const handleToggleActivityComplete = async (activityId: string, isCompleted: boolean) => {
    if (isCompleted) {
      await markActivityComplete({ organizationId, activityId: activityId as Id<"scheduledActivities"> });
    } else {
      await markActivityIncomplete({ organizationId, activityId: activityId as Id<"scheduledActivities"> });
    }
    void queryClient.invalidateQueries({ queryKey: supabaseKeys.scheduledActivities.list(organizationId) });
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

  const selectedActivity = scheduledActivitiesData?.find(
    (a) => a._id === selectedActivityId
  ) ?? null;

  const dealRelationships =
    relationships?.filter(
      (r) => r.targetType === "deal" || r.targetType === "lead"
    ) ?? [];
  const contactRelationships =
    relationships?.filter((r) => r.targetType === "contact") ?? [];

  // --- Deal summary for overview tab ---
  const dealSummary = useMemo(() => {
    const deals = dealRelationships;
    // We don't have deal values from relationships alone — use sidebar deal search results as proxy
    // For now, compute counts from relationship data
    return {
      totalDeals: deals.length,
      totalValue: 0,
      wonValue: 0,
      openDeals: deals.length, // relationships don't carry status
      wonDeals: 0,
      lostDeals: 0,
      currency: "PLN",
    };
  }, [dealRelationships]);

  // --- Custom field entries for overview tab ---
  const overviewCustomFields = useMemo(() => {
    if (!companyCfDefs || !companyCfValuesRaw) return [];
    return companyCfDefs
      .map((def: any) => {
        const val = companyCfValuesRaw.find((v: any) => v.fieldKey === def.fieldKey);
        return { label: def.label ?? def.fieldKey, value: String(val?.value ?? "") };
      })
      .filter((cf: any) => cf.value);
  }, [companyCfDefs, companyCfValuesRaw]);

  // All detail fields for EntityDetailLayout
  const allFields: DetailField[] = company ? [
    {
      label: t('detail.fields.domain'),
      value: company.domain ? (
        <a href={`https://${company.domain}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{company.domain}</a>
      ) : "—",
      fieldKey: "domain",
    },
    { label: t('detail.fields.phone'), value: company.phone ? formatPhoneNumber(company.phone) : "—", fieldKey: "phone" },
    { label: t('detail.fields.industry'), value: company.industry ?? "—", fieldKey: "industry" },
    { label: t('detail.fields.size'), value: company.size ?? "—", fieldKey: "size" },
    {
      label: t('detail.fields.website'),
      value: company.website ? (
        <a href={company.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{company.website}</a>
      ) : "—",
      fieldKey: "website",
    },
    {
      label: t('detail.fields.created'),
      value: new Date(company.createdAt).toLocaleDateString("pl-PL", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      fieldKey: "createdAt",
    },
  ] : [];

  // Build relationship items for edit drawer
  const selectedDeals: RelationshipItem[] = dealRelationships.map((r) => ({
    id: r.targetId,
    label: (r as any).targetName ?? r.targetId,
    sublabel: (r as any).targetSublabel,
  }));

  const selectedContacts: RelationshipItem[] = contactRelationships.map(
    (r) => ({
      id: r.targetId,
      label: (r as any).targetName ?? r.targetId,
      sublabel: (r as any).targetSublabel,
    })
  );

  const dealAssociationItems = dealRelationships.map((r) => ({
    id: r.targetId,
    label: r.targetName ?? r.targetId,
    sublabel: r.targetSublabel,
  }));

  const contactAssociationItems = contactRelationships.map((r) => ({
    id: r.targetId,
    label: r.targetName ?? r.targetId,
    sublabel: r.targetSublabel,
  }));

  const dealSearchResultsForPanel: SearchResultItem[] = (sidebarDealResults?.page ?? [])
    .map((d) => ({ id: d._id, label: d.title, sublabel: d.value != null ? `${d.value.toLocaleString()} PLN` : undefined }));

  const contactSearchResultsForPanel: SearchResultItem[] = (sidebarContactResults ?? [])
    .map((c) => ({ id: c._id, label: `${c.firstName} ${c.lastName ?? ""}`.trim(), sublabel: c.email ?? undefined }));

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
          {t('detail.actions.edit')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={handleDelete}
          className="text-destructive focus:text-destructive"
        >
          {t('detail.deleteCompany')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      <EntityDetailLayout
        variant="default"
        isLoading={isLoading}
        notFound={!isLoading && !company}
        onBack={() => navigate({ to: "/dashboard/companies" })}
        title={company?.name ?? ""}
        avatarFallback={company?.name?.[0]?.toUpperCase() ?? "C"}
        primaryAction={{
          label: t('detail.actions.addLead'),
          onClick: () => setCreateLeadDrawerOpen(true),
        }}
        onEdit={() => setEditDrawerOpen(true)}
        owner={{
          name: company?.createdBy ? "U" : "?",
        }}
        actionsMenu={actionsMenu}
        fields={allFields}
        expandedFieldCount={3}
        associations={[
          {
            title: "",
            count: 0,
            children: (
              <EntityAssociationPanel
                title={t('detail.relationships.leads')}
                items={dealAssociationItems}
                searchPlaceholder={t('detail.relationships.searchLeads')}
                emptyText={t('detail.relationships.emptyCompanyLeads')}
                onItemClick={(id) => navigate({ to: `/dashboard/leads/${id}` })}
                onLink={(item) => handleLinkDeal(item)}
                onCreateNew={() => setCreateLeadDrawerOpen(true)}
                searchResults={dealSearchResultsForPanel}
                onSearchChange={setSidebarDealSearch}
              />
            ),
          },
          {
            title: "",
            count: 0,
            children: (
              <EntityAssociationPanel
                title={t('detail.relationships.contacts')}
                items={contactAssociationItems}
                searchPlaceholder={t('detail.relationships.searchContacts')}
                emptyText={t('detail.relationships.emptyCompanyContacts')}
                onItemClick={(id) => navigate({ to: `/dashboard/contacts/${id}` })}
                onLink={(item) => handleLinkContact(item)}
                onCreateNew={() => setCreateContactDrawerOpen(true)}
                searchResults={contactSearchResultsForPanel}
                onSearchChange={setSidebarContactSearch}
              />
            ),
          },
        ]}
        attachments={
          <div>
            <p className="text-sm text-muted-foreground mb-3">
              {t('detail.attachments.empty')}
            </p>
            <Button variant="outline" size="sm">
              <Upload className="h-4 w-4 mr-1.5" variant="stroke" />
              {t('detail.attachments.selectFile')}
            </Button>
          </div>
        }
        quickActionItems={[
          { key: "scheduleActivity", label: t("entityActions.scheduleActivity"), onClick: () => setShowActivityForm(true) },
          { key: "addNote", label: t("entityActions.addNote"), onClick: () => {} },
          { key: "share", label: t("entityActions.share"), onClick: () => {} },
        ]}
        defaultTab={t('detail.tabs.overview', 'Przegląd')}
        tabs={[
          {
            label: t('detail.tabs.overview', 'Przegląd'),
            content: company ? (
              <CompanyOverviewTab
                company={company}
                contactCount={contactRelationships.length}
                dealSummary={dealSummary}
                recentActivities={(activities ?? []).slice(0, 5) as any}
                customFields={overviewCustomFields}
              />
            ) : null,
          },
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
                  entries={activitiesToFeedEntries((activities ?? []) as any, t)}
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
                      <h3 className="font-semibold">
                        {t('detail.activitySection.title')}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {t('detail.activitySection.descriptionOther')}
                      </p>
                    </div>
                    <Button
                      className="bg-primary"
                      onClick={() => setShowActivityForm(true)}
                    >
                      <Plus className="h-4 w-4 mr-1" variant="stroke" />
                      {t('detail.activitySection.add')}
                    </Button>
                  </div>
                )}

                {showActivityForm && (
                  <div className="rounded-lg border p-5">
                    <ActivityForm
                      linkedEntityType="company"
                      linkedEntityLabel={company?.name ?? ""}
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

                {scheduledActivitiesData &&
                scheduledActivitiesData.length > 0 ? (
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
                      {t('detail.activitySection.emptyCompany')}
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
                entityType="company"
                entityId={companyId}
                companyId={companyId as Id<"companies">}
              />
            ),
          },
          {
            label: t('detail.tabs.documents'),
            count: companyDocuments?.length ?? 0,
            content: (
              <EntityDocumentsTab
                entityType="company"
                entityId={companyId}
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
            content: (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{t('detail.notes.title')}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t('detail.notes.descriptionAlt')}
                    </p>
                  </div>
                  <Button
                    className="bg-primary"
                    onClick={() => setIsAddingNote(true)}
                  >
                    <Plus className="h-4 w-4 mr-1" variant="stroke" />
                    {t('detail.notes.add')}
                  </Button>
                </div>

                {isAddingNote && (
                  <div className="space-y-2 rounded-lg border p-4">
                    <RichTextEditor
                      value={newNote}
                      onChange={(val) => setNewNote(val ?? "")}
                      placeholder={t('detail.notes.placeholderAlt')}
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
                      <Button
                        size="sm"
                        onClick={handleAddNote}
                        disabled={!newNote.trim()}
                      >
                        {t('detail.notes.save')}
                      </Button>
                    </div>
                  </div>
                )}

                {notesData && notesData.length > 0 ? (
                  <ul className="space-y-3">
                    {notesData.map((note) => (
                      <li
                        key={note._id}
                        className="rounded-lg border p-4 space-y-1"
                      >
                        <div className="flex items-start justify-between">
                          <p className="text-sm whitespace-pre-wrap">
                            {plateJsonToText(note.content as string)}
                          </p>
                          {note.isPinned && (
                            <Pin className="h-4 w-4 text-primary shrink-0" variant="stroke" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(note.createdAt).toLocaleDateString(
                            "pl-PL",
                            {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            }
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  !isAddingNote && (
                    <p className="text-sm text-muted-foreground">
                      {t('detail.notes.empty')}
                    </p>
                  )
                )}
              </div>
            ),
          },
        ]}
      />

      {/* === Edit company drawer === */}
      {company && <SidePanel
        open={editDrawerOpen}
        onOpenChange={setEditDrawerOpen}
        title={t('detail.editCompany')}
      >
        <CompanyForm
          initialData={{
            name: company.name,
            domain: company.domain ?? undefined,
            industry: company.industry ?? undefined,
            size: company.size ?? undefined,
            website: company.website ?? undefined,
            phone: company.phone ?? undefined,
            address: company.address ?? undefined,
            notes: company.notes ?? undefined,
            tagIds: company.tagIds as Id<"tagDefinitions">[] | undefined,
            categoryId: company.categoryId as Id<"categoryDefinitions"> | undefined,
          }}
          customFieldDefinitions={companyCfDefs}
          customFieldValues={companyCfValues}
          onSubmit={handleEditSubmit}
          onCancel={() => setEditDrawerOpen(false)}
          isSubmitting={isSubmitting}
          extraFields={
            <>
              <RelationshipField
                label={t('detail.relationships.leads')}
                placeholder={t('detail.relationships.searchLeads')}
                items={
                  dealSearchResults?.page?.map((d) => ({
                    id: d._id,
                    label: d.title,
                    sublabel: d.value
                      ? `$${d.value.toLocaleString()}`
                      : undefined,
                  })) ?? []
                }
                selectedItems={selectedDeals}
                onSearch={setDealSearch}
                onSelect={handleLinkDeal}
                onRemove={handleUnlinkDeal}
              />
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
            </>
          }
        />
      </SidePanel>}

      {/* === Create contact drawer === */}
      <SidePanel
        open={createContactDrawerOpen}
        onOpenChange={setCreateContactDrawerOpen}
        title={t('detail.createContact')}
        description={t('detail.createContactDescCompany')}
      >
        <ContactForm
          onSubmit={handleCreateContact}
          onCancel={() => setCreateContactDrawerOpen(false)}
          isSubmitting={isSubmitting}
        />
      </SidePanel>

      {/* === Create lead drawer === */}
      <SidePanel
        open={createLeadDrawerOpen}
        onOpenChange={setCreateLeadDrawerOpen}
        title={t('detail.createLead')}
        description={t('detail.createLeadDescCompany')}
      >
        <LeadForm
          onSubmit={handleCreateLead}
          onCancel={() => setCreateLeadDrawerOpen(false)}
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
    </>
  );
}
