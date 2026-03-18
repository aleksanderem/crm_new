import { useState, useMemo, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { SidePanel } from "@/components/crm/side-panel";
import { CompanyForm } from "@/components/forms/company-form";
import { ContactForm } from "@/components/forms/contact-form";
import { RelationshipField } from "@/components/crm/relationship-field";
import type { RelationshipItem } from "@/components/crm/relationship-field";
import { ActivityForm } from "@/components/crm/activity-form";
import { ActivityDetailDrawer } from "@/components/crm/activity-detail-drawer";
import { ActivityTimeline } from "@/components/activity-timeline/activity-timeline";
import { LeadForm } from "@/components/forms/lead-form";
import { ScheduledActivitiesList } from "@/components/shared/scheduled-activities-list";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
  FileText,
  Pin,
  User,
  Search,
  Upload,
} from "@/lib/ez-icons";
import { Id } from "@cvx/_generated/dataModel";
import { useCustomFieldForm } from "@/hooks/use-custom-field-form";
import { useTranslation } from "react-i18next";
import { EmailEntityTab } from "@/components/email/email-entity-tab";
import { EntityQuickActions } from "@/components/crm/entity-quick-actions";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DocumentInstanceTable } from "@/components/documents/document-instance-table";
import { DocumentFromTemplateDialog } from "@/components/documents/document-from-template-dialog";
import { DocumentInstanceView } from "@/components/documents/document-instance-view";
import { EntityDetailLayout } from "@/components/crm/entity-detail-layout";
import type { DetailField } from "@/components/crm/entity-detail-layout";

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
  const updateCompany = useMutation(api.companies.update);
  const removeCompany = useMutation(api.companies.remove);
  const createRelationship = useMutation(api.relationships.create);
  const removeRelationship = useMutation(api.relationships.remove);
  const createContact = useMutation(api.contacts.create);
  const createNote = useMutation(api.notes.create);
  const createLead = useMutation(api.leads.create);
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

  // Company entity custom fields
  const {
    definitions: companyCfDefs,
    saveValues: _saveCompanyCfValues,
  } = useCustomFieldForm({ organizationId, entityType: "company" });

  const { data: companyCfValuesRaw } = useQuery({
    ...convexQuery(api.customFields.getValues, {
      organizationId,
      entityType: "company" as any,
      entityId: companyId,
    }),
    enabled: !!companyId,
  });

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

  // Drawer state
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [createContactDrawerOpen, setCreateContactDrawerOpen] = useState(false);
  const [activityDrawerOpen, setActivityDrawerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showNewDocDialog, setShowNewDocDialog] = useState(false);
  const [viewingDocId, setViewingDocId] = useState<Id<"documentInstances"> | null>(null);
  const [newNote, setNewNote] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [createLeadDrawerOpen, setCreateLeadDrawerOpen] = useState(false);
  const [showSidebarDealLink, setShowSidebarDealLink] = useState(false);
  const [showSidebarContactLink, setShowSidebarContactLink] = useState(false);

  // Relationship search state for edit drawer
  const [dealSearch, setDealSearch] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [guestContactSearch, setGuestContactSearch] = useState("");
  const [sidebarDealSearch, setSidebarDealSearch] = useState("");
  const [sidebarContactSearch, setSidebarContactSearch] = useState("");

  const { data: company, isLoading } = useQuery(
    convexQuery(api.companies.getById, {
      organizationId,
      companyId: companyId as Id<"companies">,
    })
  );

  useEffect(() => {
    if (company && organizationId) {
      trackView({ organizationId, entityType: "companies", entityId: company._id, entityLabel: company.name });
    }
  }, [company?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: activitiesData } = useQuery(
    convexQuery(api.activities.getForEntity, {
      organizationId,
      entityType: "company",
      entityId: companyId,
      paginationOpts: { numItems: 50, cursor: null },
    })
  );
  const activities = activitiesData?.page;

  const { data: relationships } = useQuery(
    convexQuery(api.relationships.getForEntity, {
      organizationId,
      entityType: "company",
      entityId: companyId,
    })
  );

  const { data: notesData } = useQuery(
    convexQuery(api.notes.listByEntity, {
      organizationId,
      entityType: "company",
      entityId: companyId,
    })
  );

  const { data: scheduledActivitiesData } = useQuery(
    convexQuery(api.scheduledActivities.listByEntity, {
      organizationId,
      linkedEntityType: "company",
      linkedEntityId: companyId,
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

  const { data: contactSearchResults } = useQuery({
    ...convexQuery(api.contacts.list, {
      organizationId,
      paginationOpts: { numItems: 20, cursor: null },
      search: contactSearch || undefined,
    }),
    enabled: contactSearch.length > 0,
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

  const { data: sidebarContactResults } = useQuery({
    ...convexQuery(api.contacts.list, {
      organizationId,
      paginationOpts: { numItems: 10, cursor: null },
      search: sidebarContactSearch || undefined,
    }),
    enabled: sidebarContactSearch.length > 0,
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

  // --- Handlers ---

  const handleEditSubmit = async (
    formData: {
      name: string;
      domain?: string;
      industry?: string;
      size?: string;
      website?: string;
      phone?: string;
      notes?: string;
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
        notes: formData.notes,
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
      navigate({ to: "/dashboard/companies" });
    }
  };

  const handleLinkDeal = async (item: RelationshipItem) => {
    await createRelationship({
      organizationId,
      sourceType: "company",
      sourceId: companyId,
      targetType: "deal",
      targetId: item.id,
    });
  };

  const handleUnlinkDeal = async (targetId: string) => {
    const rel = dealRelationships.find((r) => r.targetId === targetId);
    if (rel) {
      await removeRelationship({ organizationId, relationshipId: rel._id });
    }
  };

  const handleLinkContact = async (item: RelationshipItem) => {
    await createRelationship({
      organizationId,
      sourceType: "company",
      sourceId: companyId,
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

  const handleCreateContact = async (
    formData: {
      firstName: string;
      lastName?: string;
      email?: string;
      phone?: string;
      title?: string;
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

  const selectedActivity = scheduledActivitiesData?.find(
    (a) => a._id === selectedActivityId
  ) ?? null;

  const dealRelationships =
    relationships?.filter(
      (r) => r.targetType === "deal" || r.targetType === "lead"
    ) ?? [];
  const contactRelationships =
    relationships?.filter((r) => r.targetType === "contact") ?? [];

  // All detail fields for EntityDetailLayout
  const allFields: DetailField[] = company ? [
    {
      label: t('detail.fields.domain'),
      value: company.domain ? (
        <a href={`https://${company.domain}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{company.domain}</a>
      ) : "—",
      fieldKey: "domain",
    },
    { label: t('detail.fields.phone'), value: company.phone ?? "—", fieldKey: "phone" },
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

  // --- Deals sidebar association content ---
  const dealsAssociationContent = (
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
                onClick={() => navigate({ to: `/dashboard/leads/${r.targetId}` })}
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
            {t('detail.relationships.emptyCompanyLeads')}
          </p>
        )
      )}
    </>
  );

  // --- Contacts sidebar association content ---
  const contactsAssociationContent = (
    <>
      {showSidebarContactLink && (
        <div className="mb-3 relative">
          <div className="flex items-center w-full rounded-md border bg-transparent">
            <Search className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" variant="stroke" />
            <Input
              type="text"
              className="h-8 border-0 shadow-none focus-visible:ring-0 bg-transparent px-2"
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
                            <span className="text-xs text-muted-foreground">
                              ({c.email})
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
                    ({(r as any).targetSublabel})
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        !showSidebarContactLink && (
          <p className="text-sm text-muted-foreground">
            {t('detail.relationships.emptyCompanyContacts')}
          </p>
        )
      )}
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
            title: t('detail.relationships.leads'),
            count: dealRelationships.length,
            onCreateNew: () => setCreateLeadDrawerOpen(true),
            children: dealsAssociationContent,
          },
          {
            title: t('detail.relationships.contacts'),
            count: contactRelationships.length,
            onCreateNew: () => setCreateContactDrawerOpen(true),
            children: contactsAssociationContent,
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
        beforeTabs={
          <EntityQuickActions entityType="company" entityId={companyId} onAction={(action) => {
            switch (action) {
              case "scheduleActivity": setShowActivityForm(true); break;
            }
          }} />
        }
        defaultTab={t('detail.tabs.all')}
        tabs={[
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
                      linkedEntityType="company"
                      linkedEntityLabel={company?.name ?? ""}
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
            content: (
              <>
                <DocumentInstanceTable
                  organizationId={organizationId}
                  sourceKey="company"
                  sourceInstanceId={companyId}
                  onView={(id) => setViewingDocId(id)}
                  onNewFromTemplate={() => setShowNewDocDialog(true)}
                  showNewButton
                />

                <DocumentFromTemplateDialog
                  open={showNewDocDialog}
                  onOpenChange={setShowNewDocDialog}
                  organizationId={organizationId}
                  module="crm"
                  sources={{ company: companyId }}
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
                    <Textarea
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder={t('detail.notes.placeholderAlt')}
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
                            {note.content}
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
            notes: company.notes ?? undefined,
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
