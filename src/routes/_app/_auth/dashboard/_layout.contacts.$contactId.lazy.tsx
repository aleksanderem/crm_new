import { useState, useMemo, useEffect } from "react";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { SidePanel } from "@/components/crm/side-panel";
import { ContactForm } from "@/components/forms/contact-form";
import { CompanyForm } from "@/components/forms/company-form";
import { RelationshipField } from "@/components/crm/relationship-field";
import type { RelationshipItem } from "@/components/crm/relationship-field";
import { ActivityForm } from "@/components/crm/activity-form";
import { ActivityDetailDrawer } from "@/components/crm/activity-detail-drawer";
import { ActivityTimeline } from "@/components/activity-timeline/activity-timeline";
import { LeadForm } from "@/components/forms/lead-form";
import { ScheduledActivitiesList } from "@/components/shared/scheduled-activities-list";
import { Input } from "@/components/ui/input";
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
  Tag,
  Upload,
  PhoneCall,
  FileText,
  Pin,
  Search,
  Building2,
} from "@/lib/ez-icons";
import { Id } from "@cvx/_generated/dataModel";
import { useCustomFieldForm } from "@/hooks/use-custom-field-form";
import { useTranslation } from "react-i18next";
import { EmailEntityTab } from "@/components/email/email-entity-tab";
import { EntityQuickActions } from "@/components/crm/entity-quick-actions";
import { EntityDetailLayout } from "@/components/crm/entity-detail-layout";
import { EntityDocumentsTab } from "@/components/documents/entity-documents-tab";

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
  const updateContact = useMutation(api.contacts.update);
  const removeContact = useMutation(api.contacts.remove);
  const createRelationship = useMutation(api.relationships.create);
  const removeRelationship = useMutation(api.relationships.remove);
  const createCompany = useMutation(api.companies.create);
  const createLead = useMutation(api.leads.create);
  const createNote = useMutation(api.notes.create);
  const createScheduledActivity = useMutation(api.scheduledActivities.create);
  const markActivityComplete = useMutation(api.scheduledActivities.markComplete);
  const markActivityIncomplete = useMutation(api.scheduledActivities.markIncomplete);
  const updateScheduledActivity = useMutation(api.scheduledActivities.update);
  const removeScheduledActivity = useMutation(api.scheduledActivities.remove);
  const setCustomFields = useMutation(api.customFields.setValues);
  const trackView = useMutation(api.recentlyViewed.track);

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

  // Contact entity custom fields
  const {
    definitions: contactCfDefs,
    saveValues: _saveContactCfValues,
  } = useCustomFieldForm({ organizationId, entityType: "contact" });

  const { data: contactCfValuesRaw } = useQuery({
    ...convexQuery(api.customFields.getValues, {
      organizationId,
      entityType: "contact" as any,
      entityId: contactId,
    }),
    enabled: !!contactId,
  });

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

  const { data: selectedActivityCfRaw } = useQuery({
    ...convexQuery(api.customFields.getValues, {
      organizationId,
      entityType: "activity",
      entityId: selectedActivityId ?? "",
    }),
    enabled: !!selectedActivityId,
  });

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
  const [showSidebarDealLink, setShowSidebarDealLink] = useState(false);
  const [showSidebarCompanyLink, setShowSidebarCompanyLink] = useState(false);

  // Relationship search state for edit drawer
  const [dealSearch, setDealSearch] = useState("");
  const [companySearch, setCompanySearch] = useState("");
  const [guestContactSearch, setGuestContactSearch] = useState("");
  const [sidebarDealSearch, setSidebarDealSearch] = useState("");
  const [sidebarCompanySearch, setSidebarCompanySearch] = useState("");

  const { data: contact, isLoading } = useQuery(
    convexQuery(api.contacts.getById, {
      organizationId,
      contactId: contactId as Id<"contacts">,
    })
  );

  useEffect(() => {
    if (contact && organizationId) {
      const label = `${contact.firstName} ${contact.lastName ?? ""}`.trim();
      trackView({ organizationId, entityType: "contacts", entityId: contact._id, entityLabel: label });
    }
  }, [contact?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: activitiesData } = useQuery(
    convexQuery(api.activities.getForEntity, {
      organizationId,
      entityType: "contact",
      entityId: contactId,
      paginationOpts: { numItems: 50, cursor: null },
    })
  );
  const activities = activitiesData?.page;

  const { data: relationships } = useQuery(
    convexQuery(api.relationships.getForEntity, {
      organizationId,
      entityType: "contact",
      entityId: contactId,
    })
  );

  const { data: notesData } = useQuery(
    convexQuery(api.notes.listByEntity, {
      organizationId,
      entityType: "contact",
      entityId: contactId,
    })
  );

  const { data: scheduledActivitiesData } = useQuery(
    convexQuery(api.scheduledActivities.listByEntity, {
      organizationId,
      linkedEntityType: "contact",
      linkedEntityId: contactId,
    })
  );

  // Search queries for relationship fields in edit drawer
  const { data: dealSearchResults } = useQuery({
    ...convexQuery(api.leads.list, {
      organizationId,
      paginationOpts: { numItems: 20, cursor: null },
      search: dealSearch || undefined,
    }),
    enabled: dealSearch.length > 0,
  });

  const { data: companySearchResults } = useQuery({
    ...convexQuery(api.companies.list, {
      organizationId,
      paginationOpts: { numItems: 20, cursor: null },
      search: companySearch || undefined,
    }),
    enabled: companySearch.length > 0,
  });

  const { data: guestContactResults } = useQuery({
    ...convexQuery(api.contacts.list, {
      organizationId,
      paginationOpts: { numItems: 10, cursor: null },
      search: guestContactSearch || undefined,
    }),
    enabled: guestContactSearch.length > 0,
  });

  // Sidebar inline search queries
  const { data: sidebarDealResults } = useQuery({
    ...convexQuery(api.leads.list, {
      organizationId,
      paginationOpts: { numItems: 10, cursor: null },
      search: sidebarDealSearch || undefined,
    }),
    enabled: sidebarDealSearch.length > 0,
  });

  const { data: sidebarCompanyResults } = useQuery({
    ...convexQuery(api.companies.list, {
      organizationId,
      paginationOpts: { numItems: 10, cursor: null },
      search: sidebarCompanySearch || undefined,
    }),
    enabled: sidebarCompanySearch.length > 0,
  });

  // --- Handlers ---

  const handleEditSubmit = async (
    formData: {
      firstName: string;
      lastName?: string;
      email?: string;
      phone?: string;
      title?: string;
      source?: string;
      tags?: string[];
      notes?: string;
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
        tags: formData.tags,
      });
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
      navigate({ to: "/dashboard/contacts" });
    }
  };

  const handleLinkDeal = async (item: RelationshipItem) => {
    await createRelationship({
      organizationId,
      sourceType: "contact",
      sourceId: contactId,
      targetType: "deal",
      targetId: item.id,
    });
  };

  const handleUnlinkDeal = async (targetId: string) => {
    const rel = dealRelationships.find(
      (r) => r.targetId === targetId
    );
    if (rel) {
      await removeRelationship({ organizationId, relationshipId: rel._id });
    }
  };

  const handleLinkCompany = async (item: RelationshipItem) => {
    await createRelationship({
      organizationId,
      sourceType: "contact",
      sourceId: contactId,
      targetType: "company",
      targetId: item.id,
    });
  };

  const handleUnlinkCompany = async (targetId: string) => {
    const rel = companyRelationships.find(
      (r) => r.targetId === targetId
    );
    if (rel) {
      await removeRelationship({ organizationId, relationshipId: rel._id });
    }
  };

  const handleCreateCompany = async (
    formData: {
      name: string;
      domain?: string;
      industry?: string;
      size?: string;
      website?: string;
      phone?: string;
      notes?: string;
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
        sourceType: "contact",
        sourceId: contactId,
        targetType: "deal",
        targetId: leadId,
      });
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

  const fullName = contact ? `${contact.firstName} ${contact.lastName ?? ""}`.trim() : "";
  const avatarFallback = contact ? `${contact.firstName[0]}${contact.lastName?.[0] ?? ""}` : "";

  const dealRelationships =
    relationships?.filter((r) => r.targetType === "deal" || r.targetType === "lead") ?? [];
  const companyRelationships =
    relationships?.filter((r) => r.targetType === "company") ?? [];

  const selectedActivity = scheduledActivitiesData?.find(
    (a) => a._id === selectedActivityId
  ) ?? null;

  const contactAny = contact as typeof contact & {
    source?: string;
    tags?: string[];
  };

  // Build relationship items for edit drawer
  const selectedDeals: RelationshipItem[] = dealRelationships.map((r) => ({
    id: r.targetId,
    label: (r as any).targetName ?? r.targetId,
    sublabel: (r as any).targetSublabel,
  }));

  const selectedCompanies: RelationshipItem[] = companyRelationships.map(
    (r) => ({
      id: r.targetId,
      label: (r as any).targetName ?? r.targetId,
      sublabel: (r as any).targetSublabel,
    })
  );

  // All detail fields for sidebar
  const allFields = contact
    ? [
        { label: t('detail.fields.email'), value: contact.email, fieldKey: "email" },
        { label: t('detail.fields.phone'), value: contact.phone, fieldKey: "phone" },
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
          {t('detail.deleteContact')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // --- Sidebar association sections ---
  const dealsAssociationChildren = (
    <>
      {showSidebarDealLink && (
        <div className="mb-3 relative">
          <div className="flex items-center w-full rounded-md border bg-transparent">
            <Search className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" variant="stroke" />
            <Input
              type="text"
              className="h-8 border-0 shadow-none focus-visible:ring-0 bg-transparent px-2"
              placeholder={t('detail.relationships.searchLeads')}
              value={sidebarDealSearch}
              onChange={(e) => setSidebarDealSearch(e.target.value)}
              autoFocus
            />
          </div>
          {sidebarDealSearch.length > 0 && (
            <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
              {sidebarDealResults?.page?.filter(
                (d) => !dealRelationships.some((r) => r.targetId === d._id)
              ).length ? (
                <ul className="max-h-[200px] overflow-y-auto p-1">
                  {sidebarDealResults.page
                    .filter((d) => !dealRelationships.some((r) => r.targetId === d._id))
                    .map((d) => (
                      <li key={d._id}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                          onClick={async () => {
                            await handleLinkDeal({ id: d._id, label: d.title });
                            setSidebarDealSearch("");
                            setShowSidebarDealLink(false);
                          }}
                        >
                          <FileText className="h-4 w-4 text-muted-foreground" variant="stroke" />
                          <span>{d.title}</span>
                          {d.value != null && (
                            <span className="text-xs text-muted-foreground">
                              ${d.value.toLocaleString()}
                            </span>
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
      {dealRelationships.length > 0 ? (
        <ul className="space-y-2">
          {dealRelationships.map((r) => (
            <li key={r._id}>
              <button
                className="flex items-center gap-2 text-sm text-primary hover:underline"
                onClick={() =>
                  navigate({
                    to: `/dashboard/leads/${r.targetId}`,
                  })
                }
              >
                <FileText className="h-4 w-4 text-muted-foreground" variant="stroke" />
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
        !showSidebarDealLink && (
          <p className="text-sm text-muted-foreground">
            {t('detail.relationships.emptyContactLeads')}
          </p>
        )
      )}
    </>
  );

  const companiesAssociationChildren = (
    <>
      {showSidebarCompanyLink && (
        <div className="mb-3 relative">
          <div className="flex items-center w-full rounded-md border bg-transparent">
            <Search className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" variant="stroke" />
            <Input
              type="text"
              className="h-8 border-0 shadow-none focus-visible:ring-0 bg-transparent px-2"
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
                            await handleLinkCompany({
                              id: c._id,
                              label: c.name,
                            });
                            setSidebarCompanySearch("");
                            setShowSidebarCompanyLink(false);
                          }}
                        >
                          <Building2 className="h-4 w-4 text-muted-foreground" variant="stroke" />
                          <span>{c.name}</span>
                          {c.domain && (
                            <span className="text-xs text-muted-foreground">
                              ({c.domain})
                            </span>
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
                onClick={() =>
                  navigate({
                    to: `/dashboard/companies/${r.targetId}`,
                  })
                }
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
            {t('detail.relationships.emptyContactCompany')}
          </p>
        )
      )}
    </>
  );

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
        />
      ),
    },
    {
      label: t('detail.tabs.documents'),
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
        subtitle={<Tag className="h-4 w-4 text-muted-foreground" variant="stroke" />}
        avatarFallback={avatarFallback}
        primaryAction={{
          label: t('detail.actions.addLead'),
          onClick: () => setCreateLeadDrawerOpen(true),
        }}
        onEdit={() => setEditDrawerOpen(true)}
        owner={{
          name: fullName || "?",
        }}
        actionsMenu={actionsMenu}
        fields={allFields}
        expandedFieldCount={3}
        associations={[
          {
            title: t('detail.relationships.leads'),
            count: dealRelationships.length,
            onCreateNew: () => {
              setShowSidebarDealLink(!showSidebarDealLink);
              setSidebarDealSearch("");
            },
            children: dealsAssociationChildren,
          },
          {
            title: t('detail.relationships.companies'),
            count: companyRelationships.length,
            onCreateNew: () => {
              setShowSidebarCompanyLink(!showSidebarCompanyLink);
              setSidebarCompanySearch("");
            },
            children: companiesAssociationChildren,
          },
        ]}
        attachments={attachmentsContent}
        tabs={tabs}
        defaultTab={t('detail.tabs.all')}
        beforeTabs={
          <EntityQuickActions entityType="contact" entityId={contactId} onAction={(action) => {
            switch (action) {
              case "scheduleActivity": setShowActivityForm(true); break;
            }
          }} />
        }
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
