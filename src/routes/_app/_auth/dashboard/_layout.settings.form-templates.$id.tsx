import { useState, useEffect, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ChevronDown, ChevronUp } from "@/lib/ez-icons";
import { toast } from "sonner";
import { DocumentTemplateEditor } from "@/components/documents/document-template-editor";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/form-templates/$id",
)({
  component: EditFormTemplatePage,
});

type FormCategory =
  | "consent"
  | "medical_record"
  | "prescription"
  | "referral"
  | "contract"
  | "invoice"
  | "protocol"
  | "intake"
  | "custom";

type SignatureMethod = "click" | "sms" | "email_otp" | "draw";
type SignerRole = "client" | "patient" | "employee" | "external";
type Module = "crm" | "gabinet" | "platform";
type EntityType =
  | "contact"
  | "company"
  | "lead"
  | "appointment"
  | "patient"
  | "treatment"
  | "employee";

const CATEGORY_OPTIONS: FormCategory[] = [
  "consent",
  "medical_record",
  "prescription",
  "referral",
  "contract",
  "invoice",
  "protocol",
  "intake",
  "custom",
];

const MODULE_OPTIONS: Module[] = ["crm", "gabinet", "platform"];

const ENTITY_TYPE_OPTIONS: EntityType[] = [
  "contact",
  "company",
  "lead",
  "appointment",
  "patient",
  "treatment",
  "employee",
];

const SIGNATURE_METHOD_OPTIONS: SignatureMethod[] = [
  "click",
  "sms",
  "email_otp",
  "draw",
];

const SIGNER_ROLE_OPTIONS: SignerRole[] = [
  "client",
  "patient",
  "employee",
  "external",
];

function EditFormTemplatePage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const { organizationId } = useOrganization();

  const templateId = id as string;

  const getTemplateByIdAction = useAction(api.documents.templates.getById);
  const { data: template } = useQuery({
    queryKey: ["documents.templates.getById", organizationId, templateId],
    queryFn: () =>
      getTemplateByIdAction({
        organizationId,
        templateId,
      }),
    enabled: !!organizationId && !!templateId,
  });

  const updateTemplate = useAction(api.documents.templates.update);

  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [metadataOpen, setMetadataOpen] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<FormCategory>("custom");
  const [modules, setModules] = useState<Module[]>([]);
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [requiresSignature, setRequiresSignature] = useState(false);
  const [signatureMethod, setSignatureMethod] =
    useState<SignatureMethod>("click");
  const [signerRole, setSignerRole] = useState<SignerRole>("client");
  const [contentJson, setContentJson] = useState("{}");

  // Initialize form from loaded template
  useEffect(() => {
    if (template && !initialized) {
      setName(template.name as string);
      setDescription((template.description as string | undefined) ?? "");
      setCategory(template.category as FormCategory);
      setModules((template.modules ?? []) as Module[]);
      setEntityTypes((template.entityTypes ?? []) as EntityType[]);
      setRequiresSignature(template.requiresSignature as boolean);
      if (template.signatureConfig) {
        const signatureConfig = template.signatureConfig as {
          method: SignatureMethod;
          signerRole: SignerRole;
        };
        setSignatureMethod(signatureConfig.method);
        setSignerRole(signatureConfig.signerRole);
      }
      setContentJson((template.contentJson as string | undefined) ?? "{}");
      setInitialized(true);
    }
  }, [template, initialized]);

  const toggleModule = (mod: Module) => {
    setModules((prev) =>
      prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod],
    );
  };

  const toggleEntityType = (et: EntityType) => {
    setEntityTypes((prev) =>
      prev.includes(et) ? prev.filter((e) => e !== et) : [...prev, et],
    );
  };

  const isContentJsonValid = useMemo(() => {
    try {
      JSON.parse(contentJson);
      return true;
    } catch {
      return false;
    }
  }, [contentJson]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error(t("settings.formTemplates.nameRequired"));
      return;
    }
    if (!isContentJsonValid) {
      toast.error(t("settings.formTemplates.invalidJson"));
      return;
    }

    setSaving(true);
    try {
      await updateTemplate({
        organizationId,
        templateId,
        name: name.trim(),
        description: description.trim() || undefined,
        category,
        contentJson,
        modules,
        entityTypes,
        requiresSignature,
        ...(requiresSignature
          ? {
              signatureConfig: {
                method: signatureMethod,
                signerRole,
              },
            }
          : {}),
      });

      toast.success(t("settings.formTemplates.saved"));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (!template) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">
          {t("common.loading")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header with breadcrumb */}
      <div className="flex shrink-0 items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <Link to="/dashboard/settings/form-templates">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link
            to="/dashboard/settings/form-templates"
            className="hover:text-foreground"
          >
            {t("settings.formTemplates.title")}
          </Link>
          <span>/</span>
          <span className="text-foreground">{template.name as string}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline">v{template.version as number}</Badge>
          <Badge variant={template.isActive ? "default" : "secondary"}>
            {template.isActive
              ? t("settings.formTemplates.statusActive")
              : t("settings.formTemplates.statusInactive")}
          </Badge>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </div>

      {/* Collapsible metadata section */}
      <Card className="shrink-0">
        <button
          type="button"
          className="flex w-full items-center justify-between px-6 py-3"
          onClick={() => setMetadataOpen((prev) => !prev)}
        >
          <span className="text-sm font-medium">
            {t("settings.formTemplates.basicInfo")}
            {name && (
              <span className="ml-2 text-muted-foreground">— {name}</span>
            )}
          </span>
          {metadataOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {metadataOpen && (
          <CardContent className="border-t pt-4">
            <div className="grid gap-6 lg:grid-cols-4">
              {/* Basic info */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="template-name">
                    {t("settings.formTemplates.nameLabel")} *
                  </Label>
                  <Input
                    id="template-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("settings.formTemplates.namePlaceholder")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="template-description">
                    {t("settings.formTemplates.descriptionLabel")}
                  </Label>
                  <RichTextEditor
                    value={description}
                    onChange={(val) => setDescription(val ?? "")}
                    placeholder={t(
                      "settings.formTemplates.descriptionPlaceholder",
                    )}
                    minHeight="80px"
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t("settings.formTemplates.categoryLabel")}</Label>
                  <Select
                    value={category}
                    onValueChange={(v) => setCategory(v as FormCategory)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {t(`settings.formTemplates.categories.${cat}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Modules */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">
                  {t("settings.formTemplates.modulesLabel")}
                </Label>
                {MODULE_OPTIONS.map((mod) => (
                  <div key={mod} className="flex items-center gap-2">
                    <Checkbox
                      id={`module-${mod}`}
                      checked={modules.includes(mod)}
                      onCheckedChange={() => toggleModule(mod)}
                    />
                    <Label htmlFor={`module-${mod}`} className="font-normal">
                      {t(`settings.formTemplates.modules.${mod}`)}
                    </Label>
                  </div>
                ))}
              </div>

              {/* Entity types */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">
                  {t("settings.formTemplates.entityTypesLabel")}
                </Label>
                {ENTITY_TYPE_OPTIONS.map((et) => (
                  <div key={et} className="flex items-center gap-2">
                    <Checkbox
                      id={`entity-${et}`}
                      checked={entityTypes.includes(et)}
                      onCheckedChange={() => toggleEntityType(et)}
                    />
                    <Label htmlFor={`entity-${et}`} className="font-normal">
                      {t(`settings.formTemplates.entityTypes.${et}`)}
                    </Label>
                  </div>
                ))}
              </div>

              {/* Signature */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Switch
                    id="requires-signature"
                    checked={requiresSignature}
                    onCheckedChange={setRequiresSignature}
                  />
                  <Label htmlFor="requires-signature" className="font-normal">
                    {t("settings.formTemplates.requiresSignature")}
                  </Label>
                </div>

                {requiresSignature && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>
                        {t("settings.formTemplates.signatureMethodLabel")}
                      </Label>
                      <Select
                        value={signatureMethod}
                        onValueChange={(v) =>
                          setSignatureMethod(v as SignatureMethod)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SIGNATURE_METHOD_OPTIONS.map((method) => (
                            <SelectItem key={method} value={method}>
                              {t(
                                `settings.formTemplates.signatureMethods.${method}`,
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>
                        {t("settings.formTemplates.signerRoleLabel")}
                      </Label>
                      <Select
                        value={signerRole}
                        onValueChange={(v) => setSignerRole(v as SignerRole)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SIGNER_ROLE_OPTIONS.map((role) => (
                            <SelectItem key={role} value={role}>
                              {t(
                                `settings.formTemplates.signerRoles.${role}`,
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </CardContent>
        )}
      </Card>

      {/* Document editor — takes remaining viewport height */}
      <div className="min-h-0 flex-1">
        <DocumentTemplateEditor
          value={contentJson}
          onChange={setContentJson}
          entityTypes={entityTypes}
        />
      </div>
    </div>
  );
}
