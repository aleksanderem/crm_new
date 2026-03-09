import { useState, useMemo, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Eye, Settings2, Filter } from "@/lib/ez-icons";
import type { Id } from "@cvx/_generated/dataModel";
import { EmailBlockBuilder } from "@/components/email/email-block-builder";
import {
  blocksToHtml,
  type EmailLayoutData,
} from "@/components/email/blocks-to-html";
import type { EmailBlock } from "@/lib/email-block-types";
import { toast } from "sonner";
import { StarterTemplateGallery } from "@/components/email/starter-template-gallery";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/email-templates/",
)({
  component: EmailTemplatesPage,
});

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

function EmailTemplatesPage() {
  const { t } = useTranslation();

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <PageHeader
        title={t("emailTemplates.title")}
        description={t("emailTemplates.description")}
      />

      <Tabs defaultValue="templates" className="w-full">
        <TabsList>
          <TabsTrigger value="templates">
            {t("emailTemplates.tabTemplates")}
          </TabsTrigger>
          <TabsTrigger value="starter">
            Gotowe szablony
          </TabsTrigger>
          <TabsTrigger value="layout">
            {t("emailTemplates.tabLayout")}
          </TabsTrigger>
          <TabsTrigger value="bindings">
            {t("emailTemplates.tabBindings")}
          </TabsTrigger>
          <TabsTrigger value="eventlog">
            {t("emailTemplates.tabEventLog")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="mt-4">
          <TemplatesTab />
        </TabsContent>

        <TabsContent value="starter" className="mt-4">
          <StarterTab />
        </TabsContent>

        <TabsContent value="layout" className="mt-4">
          <LayoutTab />
        </TabsContent>

        <TabsContent value="bindings" className="mt-4">
          <EventBindingsTab />
        </TabsContent>

        <TabsContent value="eventlog" className="mt-4">
          <EventLogTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Starter Templates Tab — ready-made gallery
// ---------------------------------------------------------------------------

function StarterTab() {
  const navigate = useNavigate();
  return (
    <StarterTemplateGallery
      onCreated={(templateId) =>
        navigate({
          to: "/dashboard/email-templates/$templateId",
          params: { templateId },
        })
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Templates Tab — list only, edit/create via dedicated routes
// ---------------------------------------------------------------------------

function TemplatesTab() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();

  const updateTemplate = useMutation(api.emailTemplates.update);
  const removeTemplate = useMutation(api.emailTemplates.remove);

  const { data: templates } = useQuery(
    convexQuery(api.emailTemplates.list, { organizationId }),
  );

  const handleToggleActive = async (
    templateId: Id<"emailTemplates">,
    isActive: boolean,
  ) => {
    await updateTemplate({ organizationId, templateId, isActive });
  };

  const handleDelete = async (templateId: Id<"emailTemplates">) => {
    await removeTemplate({ organizationId, templateId });
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button asChild>
          <Link to="/dashboard/email-templates/new">
            <Plus className="mr-2 h-4 w-4" variant="stroke" />
            {t("emailTemplates.addTemplate")}
          </Link>
        </Button>
      </div>

      <div className="space-y-2">
        {(!templates || templates.length === 0) && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("emailTemplates.empty")}
          </p>
        )}
        {templates?.map((template) => (
          <Card key={template._id}>
            <CardContent className="flex items-center justify-between py-3">
              <Link
                to="/dashboard/email-templates/$templateId"
                params={{ templateId: template._id }}
                className="min-w-0 flex-1"
              >
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{template.name}</p>
                  {template.module && (
                    <Badge variant="outline" className="text-xs">
                      {template.module === "crm"
                        ? "CRM"
                        : template.module === "gabinet"
                          ? "Gabinet"
                          : template.module}
                    </Badge>
                  )}
                  {template.category && (
                    <Badge variant="secondary" className="text-xs">
                      {template.category}
                    </Badge>
                  )}
                  {!template.isActive && (
                    <Badge variant="outline" className="text-xs">
                      {t("common.inactive")}
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {template.subject}
                </p>
              </Link>
              <div className="flex items-center gap-2">
                <Switch
                  checked={template.isActive}
                  onCheckedChange={(checked) =>
                    handleToggleActive(template._id, checked)
                  }
                />
                <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                  <Link
                    to="/dashboard/email-templates/$templateId"
                    params={{ templateId: template._id }}
                  >
                    <Pencil className="h-4 w-4" variant="stroke" />
                  </Link>
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Trash2 className="h-4 w-4" variant="stroke" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {t("common.confirmDelete")}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("common.actionCannotBeUndone")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDelete(template._id)}
                      >
                        {t("common.delete")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Layout Tab — Global email wrapper
// ---------------------------------------------------------------------------

interface LayoutFormData {
  headerBlocks: EmailBlock[];
  footerBlocks: EmailBlock[];
  backgroundColor: string;
  contentBackgroundColor: string;
  primaryColor: string;
  logoUrl: string;
  companyName: string;
  footerText: string;
}

const defaultLayout: LayoutFormData = {
  headerBlocks: [],
  footerBlocks: [],
  backgroundColor: "#f4f4f5",
  contentBackgroundColor: "#ffffff",
  primaryColor: "#2563eb",
  logoUrl: "",
  companyName: "",
  footerText: "",
};

function parseBlocks(json: string): EmailBlock[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function LayoutTab() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const upsertLayout = useMutation(api.emailLayouts.upsert);

  const { data: layout, isLoading } = useQuery(
    convexQuery(api.emailLayouts.get, { organizationId }),
  );

  const [form, setForm] = useState<LayoutFormData>(defaultLayout);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (layout && !initialized) {
      setForm({
        headerBlocks: parseBlocks(layout.headerBlocks),
        footerBlocks: parseBlocks(layout.footerBlocks),
        backgroundColor: layout.backgroundColor,
        contentBackgroundColor: layout.contentBackgroundColor,
        primaryColor: layout.primaryColor,
        logoUrl: layout.logoUrl ?? "",
        companyName: layout.companyName ?? "",
        footerText: layout.footerText ?? "",
      });
      setInitialized(true);
    } else if (!isLoading && layout === null && !initialized) {
      setInitialized(true);
    }
  }, [layout, isLoading, initialized]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await upsertLayout({
        organizationId,
        headerBlocks: JSON.stringify(form.headerBlocks),
        footerBlocks: JSON.stringify(form.footerBlocks),
        backgroundColor: form.backgroundColor,
        contentBackgroundColor: form.contentBackgroundColor,
        primaryColor: form.primaryColor,
        logoUrl: form.logoUrl || undefined,
        companyName: form.companyName || undefined,
        footerText: form.footerText || undefined,
      });
      toast.success(t("emailTemplates.layoutSaved"));
    } finally {
      setIsSaving(false);
    }
  };

  const previewHtml = useMemo(() => {
    const sampleContent: EmailBlock[] = [
      {
        id: "preview-1",
        type: "heading",
        content: { html: "<h2>Przykładowa treść e-maila</h2>" },
      },
      {
        id: "preview-2",
        type: "text",
        content: {
          html: "<p>To jest podgląd układu globalnego. Treść szablonu e-maila pojawi się w tym miejscu, opakowana nagłówkiem i stopką zdefiniowanymi powyżej.</p>",
        },
      },
      {
        id: "preview-3",
        type: "button",
        content: {
          label: "Przycisk CTA",
          url: "#",
          align: "center",
          bgColor: form.primaryColor,
          textColor: "#ffffff",
        },
      },
    ];

    const layoutData: EmailLayoutData = {
      headerBlocks: form.headerBlocks,
      footerBlocks: form.footerBlocks,
      backgroundColor: form.backgroundColor,
      contentBackgroundColor: form.contentBackgroundColor,
      primaryColor: form.primaryColor,
      logoUrl: form.logoUrl || undefined,
      companyName: form.companyName || undefined,
      footerText: form.footerText || undefined,
    };

    return blocksToHtml(sampleContent, layoutData);
  }, [form]);

  if (isLoading) {
    return (
      <div className="space-y-6 py-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {t("emailTemplates.layoutDescription")}
      </p>

      {/* Brand settings */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-4 py-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label>{t("emailTemplates.companyName")}</Label>
            <Input
              value={form.companyName}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, companyName: e.target.value }))
              }
              placeholder="Moja Firma Sp. z o.o."
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("emailTemplates.logoUrl")}</Label>
            <Input
              value={form.logoUrl}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, logoUrl: e.target.value }))
              }
              placeholder="https://example.com/logo.png"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("emailTemplates.footerTextLabel")}</Label>
            <Input
              value={form.footerText}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, footerText: e.target.value }))
              }
              placeholder={t("emailTemplates.footerTextPlaceholder")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("emailTemplates.backgroundColor")}</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.backgroundColor}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    backgroundColor: e.target.value,
                  }))
                }
                className="h-9 w-9 cursor-pointer rounded border"
              />
              <Input
                value={form.backgroundColor}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    backgroundColor: e.target.value,
                  }))
                }
                className="flex-1"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("emailTemplates.contentBackgroundColor")}</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.contentBackgroundColor}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    contentBackgroundColor: e.target.value,
                  }))
                }
                className="h-9 w-9 cursor-pointer rounded border"
              />
              <Input
                value={form.contentBackgroundColor}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    contentBackgroundColor: e.target.value,
                  }))
                }
                className="flex-1"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("emailTemplates.primaryColor")}</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.primaryColor}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    primaryColor: e.target.value,
                  }))
                }
                className="h-9 w-9 cursor-pointer rounded border"
              />
              <Input
                value={form.primaryColor}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    primaryColor: e.target.value,
                  }))
                }
                className="flex-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Header blocks */}
      <div className="space-y-2">
        <Label className="text-base">
          {t("emailTemplates.headerBlocks")}
        </Label>
        <EmailBlockBuilder
          blocks={form.headerBlocks}
          onChange={(headerBlocks) =>
            setForm((prev) => ({ ...prev, headerBlocks }))
          }
        />
      </div>

      {/* Footer blocks */}
      <div className="space-y-2">
        <Label className="text-base">
          {t("emailTemplates.footerBlocks")}
        </Label>
        <EmailBlockBuilder
          blocks={form.footerBlocks}
          onChange={(footerBlocks) =>
            setForm((prev) => ({ ...prev, footerBlocks }))
          }
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? t("common.saving") : t("common.save")}
        </Button>
        <Button variant="outline" onClick={() => setShowPreview((v) => !v)}>
          <Eye className="mr-2 h-4 w-4" variant="stroke" />
          {t("emailTemplates.preview")}
        </Button>
      </div>

      {/* Preview */}
      {showPreview && (
        <Card>
          <CardContent className="py-4">
            <div
              className="mx-auto max-w-[640px]"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event Bindings Tab
// ---------------------------------------------------------------------------

type EventType = {
  _id: Id<"emailEventTypes">;
  eventType: string;
  module: "crm" | "gabinet" | "platform";
  displayName: string;
  description?: string;
  isActive: boolean;
};

type Binding = {
  _id: Id<"emailEventBindings">;
  eventType: string;
  templateId: Id<"emailTemplates">;
  enabled: boolean;
  priority: number;
  templateName: string | null;
  templateIsActive: boolean;
};

const MODULE_LABELS: Record<string, string> = {
  crm: "CRM",
  gabinet: "Gabinet",
  platform: "Platform",
};

function EventBindingsTab() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const [editingEventType, setEditingEventType] = useState<string | null>(null);
  const [editTemplateId, setEditTemplateId] = useState<string>("");
  const [editPriority, setEditPriority] = useState<string>("0");
  const [isSaving, setIsSaving] = useState(false);

  const upsertBinding = useMutation(api.emailEventBindings.upsertBinding);
  const toggleBinding = useMutation(api.emailEventBindings.toggleBinding);
  const deleteBinding = useMutation(api.emailEventBindings.deleteBinding);

  const { data: eventTypes, isLoading: loadingTypes } = useQuery(
    convexQuery(api.emailEvents.listEventTypes, { organizationId }),
  );
  const { data: bindings, isLoading: loadingBindings } = useQuery(
    convexQuery(api.emailEventBindings.listBindings, { organizationId }),
  );
  const { data: templates } = useQuery(
    convexQuery(api.emailTemplates.list, { organizationId }),
  );

  const isLoading = loadingTypes || loadingBindings;

  const bindingsByEventType = useMemo(() => {
    const map = new Map<string, Binding>();
    for (const b of bindings ?? []) {
      map.set(b.eventType, b as Binding);
    }
    return map;
  }, [bindings]);

  const groupedTypes = useMemo(() => {
    const groups: Record<string, EventType[]> = {};
    for (const et of eventTypes ?? []) {
      const mod = et.module as string;
      if (!groups[mod]) groups[mod] = [];
      groups[mod].push(et as EventType);
    }
    return groups;
  }, [eventTypes]);

  const openEdit = (eventType: string) => {
    const existing = bindingsByEventType.get(eventType);
    setEditTemplateId(existing?.templateId ?? "");
    setEditPriority(String(existing?.priority ?? 0));
    setEditingEventType(eventType);
  };

  const handleSaveBinding = async () => {
    if (!editingEventType || !editTemplateId) return;
    setIsSaving(true);
    try {
      await upsertBinding({
        organizationId,
        eventType: editingEventType,
        templateId: editTemplateId as Id<"emailTemplates">,
        priority: Number(editPriority) || 0,
      });
      toast.success(t("emailTemplates.bindingSaved"));
      setEditingEventType(null);
    } catch {
      toast.error(t("common.error"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (
    bindingId: Id<"emailEventBindings">,
    enabled: boolean,
  ) => {
    try {
      await toggleBinding({ organizationId, bindingId, enabled });
      toast.success(
        enabled
          ? t("emailTemplates.bindingEnabled")
          : t("emailTemplates.bindingDisabled"),
      );
    } catch {
      toast.error(t("common.error"));
    }
  };

  const handleDelete = async (bindingId: Id<"emailEventBindings">) => {
    try {
      await deleteBinding({ organizationId, bindingId });
      toast.success(t("emailTemplates.bindingDeleted"));
    } catch {
      toast.error(t("common.error"));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const modules = Object.keys(groupedTypes);

  if (modules.length === 0) {
    return (
      <div className="py-12 text-center">
        <Settings2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" variant="stroke" />
        <p className="text-sm text-muted-foreground">
          {t("emailTemplates.noEventTypes")}
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        {t("emailTemplates.bindingsDescription")}
      </p>

      <div className="space-y-6">
        {modules.map((mod) => (
          <div key={mod}>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {MODULE_LABELS[mod] ?? mod}
            </h3>
            <div className="space-y-2">
              {groupedTypes[mod].map((et) => {
                const binding = bindingsByEventType.get(et.eventType);
                return (
                  <Card key={et._id}>
                    <CardContent className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{et.displayName}</p>
                          <Badge variant="outline" className="font-mono text-xs">
                            {et.eventType}
                          </Badge>
                        </div>
                        {et.description && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {et.description}
                          </p>
                        )}
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {binding
                            ? (binding.templateName ?? t("emailTemplates.unknownTemplate"))
                            : t("emailTemplates.noTemplate")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {binding && (
                          <Switch
                            checked={binding.enabled}
                            onCheckedChange={(checked) =>
                              handleToggle(binding._id, checked)
                            }
                          />
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(et.eventType)}
                        >
                          <Pencil className="mr-1.5 h-3.5 w-3.5" variant="stroke" />
                          {binding
                            ? t("common.edit")
                            : t("emailTemplates.bindTemplate")}
                        </Button>
                        {binding && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" variant="stroke" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  {t("common.confirmDelete")}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("common.actionCannotBeUndone")}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>
                                  {t("common.cancel")}
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(binding._id)}
                                >
                                  {t("common.delete")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <Dialog
        open={editingEventType !== null}
        onOpenChange={(open) => !open && setEditingEventType(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("emailTemplates.editBinding")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t("emailTemplates.selectTemplateLabel")}</Label>
              <Select value={editTemplateId} onValueChange={setEditTemplateId}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={t("emailTemplates.selectTemplate")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(templates ?? [])
                    .filter((tmpl) => tmpl.isActive)
                    .map((tmpl) => (
                      <SelectItem key={tmpl._id} value={tmpl._id}>
                        {tmpl.name}
                        {tmpl.module && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({tmpl.module})
                          </span>
                        )}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("emailTemplates.priority")}</Label>
              <Input
                type="number"
                value={editPriority}
                onChange={(e) => setEditPriority(e.target.value)}
                min={0}
              />
              <p className="text-xs text-muted-foreground">
                {t("emailTemplates.priorityHint")}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEventType(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSaveBinding}
              disabled={isSaving || !editTemplateId}
            >
              {isSaving ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Event Log Tab
// ---------------------------------------------------------------------------

const STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  sent: "default",
  pending: "secondary",
  failed: "destructive",
  skipped: "outline",
};

function EventLogTab() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null);

  const { data: log, isLoading } = useQuery(
    convexQuery(api.emailEvents.getEventLog, {
      organizationId,
      status:
        statusFilter !== "all"
          ? (statusFilter as "pending" | "sent" | "failed" | "skipped")
          : undefined,
      limit: 100,
    }),
  );

  const selectedEntryData = useMemo(
    () => log?.find((e) => e._id === selectedEntry),
    [log, selectedEntry],
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-10 w-full rounded" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" variant="stroke" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("emailTemplates.logStatusAll")}</SelectItem>
            <SelectItem value="sent">
              {t("emailTemplates.logStatusSent")}
            </SelectItem>
            <SelectItem value="pending">
              {t("emailTemplates.logStatusPending")}
            </SelectItem>
            <SelectItem value="failed">
              {t("emailTemplates.logStatusFailed")}
            </SelectItem>
            <SelectItem value="skipped">
              {t("emailTemplates.logStatusSkipped")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!log || log.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {t("emailTemplates.noLogEntries")}
          </p>
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("emailTemplates.logColTime")}</TableHead>
                <TableHead>{t("emailTemplates.logColEventType")}</TableHead>
                <TableHead>{t("emailTemplates.logColRecipient")}</TableHead>
                <TableHead>{t("emailTemplates.logColTemplate")}</TableHead>
                <TableHead>{t("emailTemplates.logColStatus")}</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {log.map((entry) => (
                <TableRow
                  key={entry._id}
                  className="cursor-pointer"
                  onClick={() =>
                    setSelectedEntry(
                      entry._id === selectedEntry ? null : entry._id,
                    )
                  }
                >
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">
                      {entry.eventType}
                    </code>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div>{entry.recipientName}</div>
                    <div className="text-xs text-muted-foreground">
                      {entry.recipientEmail}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {"templateName" in entry
                      ? ((entry.templateName as string | null) ?? "—")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={STATUS_VARIANTS[entry.status] ?? "outline"}
                    >
                      {entry.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Eye className="h-3.5 w-3.5" variant="stroke" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog
        open={selectedEntry !== null}
        onOpenChange={(open) => !open && setSelectedEntry(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("emailTemplates.logEntryDetails")}</DialogTitle>
          </DialogHeader>
          {selectedEntryData && (
            <div className="space-y-3 py-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t("emailTemplates.logColEventType")}
                  </p>
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">
                    {selectedEntryData.eventType}
                  </code>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t("emailTemplates.logColStatus")}
                  </p>
                  <Badge
                    variant={
                      STATUS_VARIANTS[selectedEntryData.status] ?? "outline"
                    }
                  >
                    {selectedEntryData.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t("emailTemplates.logColRecipient")}
                  </p>
                  <p>{selectedEntryData.recipientName}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedEntryData.recipientEmail}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t("emailTemplates.logColTime")}
                  </p>
                  <p>{new Date(selectedEntryData.createdAt).toLocaleString()}</p>
                </div>
              </div>
              {selectedEntryData.errorMessage && (
                <div>
                  <p className="mb-1 text-xs font-medium text-destructive">
                    {t("emailTemplates.logErrorMessage")}
                  </p>
                  <pre className="overflow-auto rounded bg-destructive/10 p-2 text-xs text-destructive">
                    {selectedEntryData.errorMessage}
                  </pre>
                </div>
              )}
              {selectedEntryData.payload && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    {t("emailTemplates.logPayload")}
                  </p>
                  <pre className="max-h-48 overflow-auto rounded bg-muted p-2 text-xs">
                    {(() => {
                      try {
                        return JSON.stringify(
                          JSON.parse(selectedEntryData.payload!),
                          null,
                          2,
                        );
                      } catch {
                        return selectedEntryData.payload;
                      }
                    })()}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
