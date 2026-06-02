import { useState, useMemo, useEffect } from "react";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useSupabaseContact, useSupabaseContactsList } from "@/hooks/use-supabase-contacts";
import { useSupabaseActivityTypesList } from "@/hooks/use-supabase-activity-types";
import { useSupabaseActivitiesByEntity } from "@/hooks/use-supabase-activities";
import {
  useSupabaseRelationshipsByEntity,
  type MappedRelationship,
} from "@/hooks/use-supabase-relationships";
import { useSupabaseNotesByEntity } from "@/hooks/use-supabase-notes";
import { useSupabaseScheduledActivitiesByEntity } from "@/hooks/use-supabase-scheduled-activities";
import { useSupabaseLeadsList } from "@/hooks/use-supabase-leads";
import { useSupabaseCompaniesList } from "@/hooks/use-supabase-companies";
import { useSupabaseCustomFieldDefinitions, useSupabaseCustomFieldValues } from "@/hooks/use-supabase-custom-fields";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { formatPhoneNumber } from "@/lib/phone";
import { SidePanel } from "@/components/crm/side-panel";
import { ContactForm } from "@/components/forms/contact-form";
import { CompanyForm } from "@/components/forms/company-form";
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
  Pencil,
  Plus,
  Upload,
  PhoneCall,
  Pin,
} from "@/lib/ez-icons";
import { Id } from "@cvx/_generated/dataModel";
import { useCustomFieldForm } from "@/hooks/use-custom-field-form";
import { useTranslation } from "react-i18next";
import { EmailEntityTab } from "@/components/email/email-entity-tab";
import { EntityDetailLayout } from "@/components/crm/entity-detail-layout";
import { EntityAssociationPanel } from "@/components/crm/entity-association-panel";
import type { SearchResultItem } from "@/components/crm/entity-association-panel";
import { EntityDocumentsTab } from "@/components/documents/entity-documents-tab";
import { useSidebarSlot } from "@/components/layout/sidebar-slot-context";

export const Route = createLazyFileRoute(
  "/_app/_auth/dashboard/_layout/contacts/$contactId"
)({
  component: ContactDetail,
});

function ContactDetail() {
  const { contactId } = Route.useParams();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { setShellSidebarMode } = useSidebarSlot();
  // @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
  const updateContact = useAction(api.contacts.update);
  const removeContact = useAction(api.contacts.remove);
  const createRelationship = useAction(api.relationships.create);
  const removeRelationship = useAction(api.relationships.remove);
  const createCompany = useAction(api.companies.create);
  const createLead = useAction(api.leads.create);
  const createNote = useAction(api.notes.create);
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

  // ── Supabase reads replacing convexQuery ──

  const { data: activityTypeDefs } = useSupabaseActivityTypesList(organizationId);

  const { data: activityCustomFieldDefs } = useSupabaseCustomFieldDefinitions(
    organizationId,
    "activity",
  );

  // Contact entity custom fields
  const {
    definitions: contactCfDefs,
    saveValues: _saveContactCfValues,
  } = useCustomFieldForm({ organizationId, entityType: "contact" });

  const { data: contactCfValuesRaw } = useSupabaseCustomFieldValues(
    organizationId,
    "contact",
    contactId,
  );

  const contactCfValues = useMemo(() => {
    if (!contactCfValuesRaw || !contactCfDefs) return {};
    const defIdToKey: Record<string, string> = {};
    contactCfDefs.forEach((d) => { defIdToKey[d._id] = d.fieldKey; });
    const result: Record<string, unknown> = {};
    contactCfValuesRaw.forEach((v) => {
      const key = defIdToKey[v.fieldDefinitionId];
      if (key) result[key] = v.value;
    });
    return result;
  }, [contactCfValuesRaw, contactCfDefs]);

  // Custom field values for the selected activity in the drawer
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);

  const { data: selectedActivityCfRaw } = useSupabaseCustomFieldValues(
    organizationId,
    "activity",
    selectedActivityId ?? undefined,
  );

  // Build fieldKey → value map for the drawer
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
  const [activityDrawerOpen, setActivityDrawerOpen] = useState(false);
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [createCompanyDrawerOpen, setCreateCompanyDrawerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [createLeadDrawerOpen, setCreateLeadDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string | undefined>(undefined);
  const [autoComposeCounter, setAutoComposeCounter] = useState(0);
  // sidebar link toggle state removed — EntityAssociationPanel manages its own modal

  // Relationship search state for edit drawer
  const [dealSearch, setDealSearch] = useState("");
  const [companySearch, setCompanySearch] = useState("");
  const [guestContactSearch, setGuestContactSearch] = useState("");
  const [sidebarDealSearch, setSidebarDealSearch] = useState("");
  const [sidebarCompanySearch, setSidebarCompanySearch] = useState("");

  // Contact entity read from Supabase (PostgreSQL)
  const { data: contact, isLoading } = useSupabaseContact(
    organizationId,
    contactId,
  );

  useEffect(() => {
    setShellSidebarMode("icon-only");
    return () => setShellSidebarMode("default");
  }, [setShellSidebarMode]);

  useEffect(() => {
    if (contact && organizationId) {
      const label = `${contact.firstName} ${contact.lastName ?? ""}`.trim();
      trackView({ organizationId, entityType: "contacts", entityId: contact._id, entityLabel: label });
    }
  }, [contact?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: activities } = useSupabaseActivitiesByEntity(
    organizationId,
    "contact",
    contactId,
  );

  const { data: contactDocuments } = useQuery({
    queryKey: [
      "documents.documents.listByEntity",
      organizationId,
      "contact",
      contactId,
    ],
    queryFn: () =>
      listDocumentsByEntity({
        organizationId,
        entityType: "contact",
        entityId: contactId,
      }),
    enabled: !!organizationId && !!contactId,
  });

  const relationshipsQueryKey = [...supabaseKeys.objectRelationships.list(organizationId), "contact", contactId] as const;
  const relationshipsQuery = useSupabaseRelationshipsByEntity(
    organizationId,
    "contact",
    contactId,
  );
  const relationships = relationshipsQuery.data;

  const { data: notesData } = useSupabaseNotesByEntity(
    organizationId,
    "contact",
    contactId,
  );

  const { data: scheduledActivitiesData } = useSupabaseScheduledActivitiesByEntity(
    organizationId,
    "contact",
    contactId,
  );

  // Search queries for relationship fields in edit drawer
  const { data: dealSearchResults } = useSupabaseLeadsList(
    organizationId,
    { search: dealSearch || undefined, enabled: dealSearch.length > 0 },
  );

  const { data: companySearchResults } = useSupabaseCompaniesList(
    organizationId,
    { search: companySearch || undefined, enabled: companySearch.length > 0 },
  );

  const { data: guestContactResults } = useSupabaseContactsList(
    organizationId,
    { search: guestContactSearch || undefined, enabled: guestContactSearch.length > 0 },
  );

  // Sidebar inline search queries
  const sidebarDealSearchQuery = sidebarDealSearch.trim();
  const sidebarCompanySearchQuery = sidebarCompanySearch.trim();

  const { data: sidebarDealResults, isFetching: isSearchingDeals } = useSupabaseLeadsList(
    organizationId,
    { search: sidebarDealSearchQuery || undefined, enabled: sidebarDealSearchQuery.length >= 3 },
  );

  const { data: sidebarCompanyResults, isFetching: isSearchingCompanies } = useSupabaseCompaniesList(
    organizationId,
    { search: sidebarCompanySearchQuery || undefined, enabled: sidebarCompanySearchQuery.length >= 3 },
  );

  // Full-list lookups NOT needed — relationships already carry targetName/targetSublabel

  // --- Handlers ---

  const handleEditSubmit = async (
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
      await updateContact({
        organizationId,
        contactId: contactId as Id<"contacts">,
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        title: formData.title,
        source: formData.source,
        notes: formData.notes,
        tags: formData.tags,
        tagIds: formData.tagIds,
        categoryId: formData.categoryId,
      });
      // Invalidate Supabase caches after update
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.contacts.detail(organizationId, contactId) });
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.contacts.list(organizationId) });
      // Save contact custom field values
      if (contactCfDefs) {
        const fieldsToSave = contactCfDefs
          .filter((d) => customFieldRecord[d.fieldKey] !== undefined && customFieldRecord[d.fieldKey] !== "")
          .map((d) => ({
            fieldDefinitionId: d._id as Id<"customFieldDefinitions">,
            value: customFieldRecord[d.fieldKey],
          }));
        if (fieldsToSave.length > 0) {
          await setCustomFields({
            organizationId,
            entityType: "contact" as any,
            entityId: contactId,
            fields: fieldsToSave,
          });
        }
      }
      setEditDrawerOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm(t('detail.confirmDeleteContact'))) {
      await removeContact({
        organizationId,
        contactId: contactId as Id<"contacts">,
      });
      // Invalidate Supabase list cache before navigating away
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.contacts.list(organizationId) });
      navigate({ to: "/dashboard/contacts" });
    }
  };

  const handleLinkDeal = async (item: RelationshipItem) => {
    const optimisticRelationship: MappedRelationship = {
      _id: `optimistic:contact:${contactId}:deal:${item.id}`,
      organizationId,
      sourceType: "contact",
      sourceId: contactId,
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
        sourceType: "contact",
        sourceId: contactId,
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
    const rel = dealRelationships.find(
      (r) => r.targetId === targetId
    );
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

      void queryClient.invalidateQueries({ queryKey: supabaseKeys.objectRelationships.list(organizationId) });
    }
  };

  const handleLinkCompany = async (item: RelationshipItem) => {
    const optimisticRelationship: MappedRelationship = {
      _id: `optimistic:contact:${contactId}:company:${item.id}`,
      organizationId,
      sourceType: "contact",
      sourceId: contactId,
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
        sourceType: "contact",
        sourceId: contactId,
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
    const rel = companyRelationships.find(
      (r) => r.targetId === targetId
    );
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

      void queryClient.invalidateQueries({ queryKey: supabaseKeys.objectRelationships.list(organizationId) });
    }
  };

  const handleCreateCompany = async (
    formData: {
      name: string;
      domain?: string | null;
      industry?: string | null;
      size?: string | null;
      website?: string | null;
      phone?: string | null;
      notes?: string | null;
    },
    _customFields: Record<string, unknown>
  ) => {
    setIsSubmitting(true);
    try {
      const companyId = await createCompany({
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
        sourceType: "contact",
        sourceId: contactId,
        targetType: "company",
        targetId: companyId,
      });
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.objectRelationships.list(organizationId) });
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
        entityType: "contact",
        entityId: contactId,
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
      value?: number | null;
      status: string;
      notes?: string | null;
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
        sourceType: "contact",
        sourceId: contactId,
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
      linkedEntityType: "contact",
      linkedEntityId: contactId,
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
        entityType: "contact",
        entityId: contactId,
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

  const fullName = contact ? `${contact.firstName} ${contact.lastName ?? ""}`.trim() : "";
  const avatarFallback = contact ? `${contact.firstName[0]}${contact.lastName?.[0] ?? ""}` : "";

  const relationshipItems = relationships ?? [];
  const dealRelationships =
    relationshipItems.filter((r) => r.targetType === "deal" || r.targetType === "lead");
  const companyRelationships = relationshipItems.filter((r) => r.targetType === "company");

  const selectedActivity = scheduledActivitiesData?.find(
    (a) => a._id === selectedActivityId
  ) ?? null;

  const contactAny = contact as typeof contact & {
    source?: string;
    tags?: string[];
  };

  const selectedDeals: RelationshipItem[] = dealRelationships.map((r) => ({
    id: r.targetId,
    label: r.targetName ?? r.targetId,
    sublabel: r.targetSublabel,
  }));

  const selectedCompanies: RelationshipItem[] = companyRelationships.map((r) => ({
    id: r.targetId,
    label: r.targetName ?? r.targetId,
    sublabel: r.targetSublabel,
  }));

  // Association items for sidebar panels — use targetName/targetSublabel from relationships directly
  const dealAssociationItems = dealRelationships.map((r) => ({
    id: r.targetId,
    label: r.targetName ?? r.targetId,
    sublabel: r.targetSublabel,
  }));

  const companyAssociationItems = companyRelationships.map((r) => ({
    id: r.targetId,
    label: r.targetName ?? r.targetId,
    sublabel: r.targetSublabel,
  }));

  const dealSearchResultsForPanel: SearchResultItem[] = (sidebarDealResults?.page ?? [])
    .map((d) => ({ id: d._id, label: d.title, sublabel: d.value != null ? `${d.value.toLocaleString()} PLN` : undefined }));

  const companySearchResultsForPanel: SearchResultItem[] = (sidebarCompanyResults ?? [])
    .map((c) => ({ id: c._id, label: c.name, sublabel: c.domain ?? undefined }));

  // All detail fields for sidebar
  const allFields = contact
    ? [
        { label: t('detail.fields.email'), value: contact.email, fieldKey: "email" },
        { label: t('detail.fields.phone'), value: contact.phone ? formatPhoneNumber(contact.phone) : undefined, fieldKey: "phone" },
        { label: t('detail.fields.source'), value: contactAny?.source, fieldKey: "source" },
        { label: t('detail.fields.jobTitle'), value: contact.title, fieldKey: "title" },
        { label: t('detail.fields.tags'), value: contactAny?.tags?.join(", "), fieldKey: "tags" },
        {
          label: t('detail.fields.created'),
          value: new Date(contact.createdAt).toLocaleDateString("pl-PL", {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
          fieldKey: "createdAt",
        },
      ]
    : [];

  // --- Sidebar content passed as props (no useEffect loop) ---
  const quickActionItems = [
    { key: "scheduleActivity", label: t("entityActions.scheduleActivity", { defaultValue: "Zaplanuj aktywność" }), onClick: () => { setActiveTab(t('detail.tabs.activities')); setShowActivityForm(true); } },
    { key: "sendEmail", label: t("entityActions.sendEmail", { defaultValue: "Wyślij email" }), onClick: () => { setActiveTab(t('detail.tabs.emails')); setAutoComposeCounter(c => c + 1); } },
    { key: "addNote", label: t("entityActions.addNote", { defaultValue: "Dodaj notatkę" }), onClick: () => { setActiveTab(t('detail.tabs.notes')); setIsAddingNote(true); } },
    { key: "logCall", label: t("entityActions.logCall", { defaultValue: "Zarejestruj połączenie" }), onClick: () => setActiveTab(t('detail.tabs.calls')) },
  ];

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
        <DropdownMenuItem onClick={() => setCreateLeadDrawerOpen(true)}>
          <Plus className="mr-2 h-4 w-4" variant="stroke" />
          {t('detail.actions.addLead')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setEditDrawerOpen(true)}>
          <Pencil className="mr-2 h-4 w-4" variant="stroke" />
          {t('detail.actions.edit')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={handleDelete}
          className="text-destructive focus:text-destructive"
        >
          {t('detail.deleteContact')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // --- Sidebar association sections ---
  // --- Attachments placeholder ---
  const attachmentsContent = (
    <div>
      <p className="text-sm text-muted-foreground mb-3">
        {t('detail.attachments.empty')}
      </p>
      <Button variant="outline" size="sm">
        <Upload className="h-4 w-4 mr-1.5" variant="stroke" />
        {t('detail.attachments.selectFile')}
      </Button>
    </div>
  );

  // --- Tab content ---
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
                linkedEntityType="contact"
                linkedEntityLabel={fullName}
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
                {t('detail.activitySection.emptyContact')}
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
          entityType="contact"
          entityId={contactId}
          contactId={contactId as Id<"contacts">}
          defaultTo={contact?.email ?? undefined}
          autoCompose={autoComposeCounter}
        />
      ),
    },
    {
      label: t('detail.tabs.documents'),
      count: contactDocuments?.length ?? 0,
      content: (
        <EntityDocumentsTab
          entityType="contact"
          entityId={contactId}
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
  ];

  return (
    <>
      <EntityDetailLayout
        variant="default"
        isLoading={isLoading}
        notFound={!isLoading && !contact}
        onBack={() => navigate({ to: "/dashboard/contacts" })}
        title={fullName}
        avatarFallback={avatarFallback}
        actionsMenu={actionsMenu}
        fields={allFields}
        associations={[
          {
            title: "",
            count: 0,
            children: (
              <EntityAssociationPanel
                title={t("detail.relationships.leads")}
                items={dealAssociationItems}
                searchPlaceholder={t('detail.relationships.searchLeads')}
                emptyText={t('detail.relationships.emptyContactLeads')}
                onItemClick={(id) => navigate({ to: `/dashboard/leads/${id}` })}
                onLink={(item) => handleLinkDeal({ id: item.id, label: item.label })}
                onUnlink={handleUnlinkDeal}
                onCreateNew={() => setCreateLeadDrawerOpen(true)}
                searchResults={dealSearchResultsForPanel}
                isSearching={isSearchingDeals}
                onSearchChange={setSidebarDealSearch}
              />
            ),
          },
          {
            title: "",
            count: 0,
            children: (
              <EntityAssociationPanel
                title={t("detail.relationships.companies")}
                items={companyAssociationItems}
                searchPlaceholder={t('detail.relationships.searchCompanies')}
                emptyText={t('detail.relationships.emptyContactCompany')}
                onItemClick={(id) => navigate({ to: `/dashboard/companies/${id}` })}
                onLink={(item) => handleLinkCompany({ id: item.id, label: item.label })}
                onUnlink={handleUnlinkCompany}
                onCreateNew={() => setCreateCompanyDrawerOpen(true)}
                searchResults={companySearchResultsForPanel}
                isSearching={isSearchingCompanies}
                onSearchChange={setSidebarCompanySearch}
              />
            ),
          },
        ]}
        attachments={attachmentsContent}
        quickActionItems={quickActionItems}
        tabs={tabs}
        defaultTab={t('detail.tabs.all')}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* === Edit contact drawer === */}
      <SidePanel
        open={editDrawerOpen}
        onOpenChange={setEditDrawerOpen}
        title={t('detail.editContact')}
      >
        <ContactForm
          initialData={{
            firstName: contact?.firstName ?? "",
            lastName: contact?.lastName ?? undefined,
            email: contact?.email ?? undefined,
            phone: contact?.phone ?? undefined,
            title: contact?.title ?? undefined,
            source: contactAny?.source,
            tags: contactAny?.tags,
            tagIds: contact?.tagIds as Id<"tagDefinitions">[] | undefined,
            categoryId: contact?.categoryId as Id<"categoryDefinitions"> | undefined,
            notes: contact?.notes ?? undefined,
          }}
          customFieldDefinitions={contactCfDefs}
          customFieldValues={contactCfValues}
          onSubmit={handleEditSubmit}
          onCancel={() => setEditDrawerOpen(false)}
          isSubmitting={isSubmitting}
          showSourceAndTags
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
      </SidePanel>

      {/* === Create company drawer === */}
      <SidePanel
        open={createCompanyDrawerOpen}
        onOpenChange={setCreateCompanyDrawerOpen}
        title={t('detail.createCompany')}
        description={t('detail.createCompanyDescContact')}
      >
        <CompanyForm
          onSubmit={handleCreateCompany}
          onCancel={() => setCreateCompanyDrawerOpen(false)}
          isSubmitting={isSubmitting}
        />
      </SidePanel>

      {/* === Create lead drawer === */}
      <SidePanel
        open={createLeadDrawerOpen}
        onOpenChange={setCreateLeadDrawerOpen}
        title={t('detail.createLead')}
        description={t('detail.createLeadDescContact')}
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
