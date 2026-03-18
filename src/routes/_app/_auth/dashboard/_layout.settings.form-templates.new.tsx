import { useState, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft } from "@/lib/ez-icons";
import { toast } from "sonner";
import { getAvailableVariables } from "@cvx/documents/scopeResolver";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/form-templates/new",
)({
  component: NewFormTemplatePage,
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

function NewFormTemplatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { organizationId } = useOrganization();

  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<FormCategory>("custom");
  const [modules, setModules] = useState<Module[]>(["platform"]);
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [requiresSignature, setRequiresSignature] = useState(false);
  const [signatureMethod, setSignatureMethod] =
    useState<SignatureMethod>("click");
  const [signerRole, setSignerRole] = useState<SignerRole>("client");
  const [formJson, setFormJson] = useState("{}");
  const [variableBindings, setVariableBindings] = useState<
    Record<string, string>
  >({});

  const createTemplate = useMutation(api.documents.templates.create);

  // Available variables based on selected entity types
  const availableVariables = useMemo(() => {
    const vars = entityTypes.flatMap((et) => {
      try {
        return getAvailableVariables(et as Parameters<typeof getAvailableVariables>[0]);
      } catch {
        return [];
      }
    });
    // Deduplicate by path
    const seen = new Set<string>();
    return vars.filter((v) => {
      if (seen.has(v.path)) return false;
      seen.add(v.path);
      return true;
    });
  }, [entityTypes]);

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

  const isFormJsonValid = useMemo(() => {
    try {
      JSON.parse(formJson);
      return true;
    } catch {
      return false;
    }
  }, [formJson]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error(t("settings.formTemplates.nameRequired"));
      return;
    }
    if (!isFormJsonValid) {
      toast.error(t("settings.formTemplates.invalidJson"));
      return;
    }

    setSaving(true);
    try {
      const templateId = await createTemplate({
        organizationId,
        name: name.trim(),
        description: description.trim() || undefined,
        category,
        formJson,
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
        ...(Object.keys(variableBindings).length > 0
          ? { variableBindings: JSON.stringify(variableBindings) }
          : {}),
      });

      toast.success(t("settings.formTemplates.created"));
      navigate({
        to: "/dashboard/settings/form-templates/$id",
        params: { id: templateId },
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with breadcrumb */}
      <div className="flex items-center gap-3">
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
          <span className="text-foreground">
            {t("settings.formTemplates.newTemplate")}
          </span>
        </div>
        <div className="ml-auto">
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving
              ? t("common.saving")
              : t("settings.formTemplates.createTemplate")}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: metadata */}
        <div className="space-y-6 lg:col-span-1">
          {/* Basic info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("settings.formTemplates.basicInfo")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
                <Textarea
                  id="template-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t(
                    "settings.formTemplates.descriptionPlaceholder",
                  )}
                  rows={3}
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
            </CardContent>
          </Card>

          {/* Modules */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("settings.formTemplates.modulesLabel")}
              </CardTitle>
              <CardDescription>
                {t("settings.formTemplates.modulesDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
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
            </CardContent>
          </Card>

          {/* Entity types */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("settings.formTemplates.entityTypesLabel")}
              </CardTitle>
              <CardDescription>
                {t("settings.formTemplates.entityTypesDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
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
            </CardContent>
          </Card>

          {/* Signature */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("settings.formTemplates.signatureTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
                <div className="space-y-4 border-t pt-4">
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
            </CardContent>
          </Card>
        </div>

        {/* Right column: form JSON + variables */}
        <div className="space-y-6 lg:col-span-2">
          {/* Form JSON editor */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("settings.formTemplates.formJsonTitle")}
              </CardTitle>
              <CardDescription>
                {t("settings.formTemplates.formJsonDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="form-json">
                    {t("settings.formTemplates.formJsonLabel")}
                  </Label>
                  {!isFormJsonValid && (
                    <Badge variant="destructive" className="text-xs">
                      {t("settings.formTemplates.invalidJson")}
                    </Badge>
                  )}
                </div>
                <Textarea
                  id="form-json"
                  value={formJson}
                  onChange={(e) => setFormJson(e.target.value)}
                  placeholder='{"pages": [{"name": "page1", "elements": []}]}'
                  rows={20}
                  className="font-mono text-sm"
                />
              </div>
            </CardContent>
          </Card>

          {/* Variable bindings */}
          {entityTypes.length > 0 && availableVariables.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t("settings.formTemplates.variableBindingsTitle")}
                </CardTitle>
                <CardDescription>
                  {t("settings.formTemplates.variableBindingsDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {availableVariables.map((variable) => (
                    <div
                      key={variable.path}
                      className="flex items-center gap-3"
                    >
                      <div className="min-w-[200px]">
                        <div className="text-sm font-medium">
                          {variable.label}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {variable.path}
                          {variable.group && (
                            <Badge
                              variant="outline"
                              className="ml-2 text-xs"
                            >
                              {variable.group}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Input
                        value={variableBindings[variable.path] ?? ""}
                        onChange={(e) =>
                          setVariableBindings((prev) => ({
                            ...prev,
                            [variable.path]: e.target.value,
                          }))
                        }
                        placeholder={t(
                          "settings.formTemplates.variableBindingPlaceholder",
                        )}
                        className="flex-1 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
