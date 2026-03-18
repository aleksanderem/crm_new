import { useTranslation } from "react-i18next";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FormCategory =
  | "consent"
  | "medical_record"
  | "prescription"
  | "referral"
  | "contract"
  | "invoice"
  | "protocol"
  | "intake"
  | "custom";

export type SignatureMethod = "click" | "sms" | "email_otp" | "draw";
export type SignerRole = "client" | "patient" | "employee" | "external";
export type Module = "crm" | "gabinet" | "platform";
export type EntityType =
  | "contact"
  | "company"
  | "lead"
  | "appointment"
  | "patient"
  | "treatment"
  | "employee";

export interface TemplateSettings {
  name: string;
  description: string;
  category: FormCategory;
  modules: Module[];
  entityTypes: EntityType[];
  requiresSignature: boolean;
  signatureMethod: SignatureMethod;
  signerRole: SignerRole;
}

interface TemplateSettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: TemplateSettings;
  onSettingsChange: (settings: TemplateSettings) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TemplateSettingsSheet({
  open,
  onOpenChange,
  settings,
  onSettingsChange,
}: TemplateSettingsSheetProps) {
  const { t } = useTranslation();

  const update = <K extends keyof TemplateSettings>(
    key: K,
    value: TemplateSettings[K],
  ) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  const toggleModule = (mod: Module) => {
    const next = settings.modules.includes(mod)
      ? settings.modules.filter((m) => m !== mod)
      : [...settings.modules, mod];
    update("modules", next);
  };

  const toggleEntityType = (et: EntityType) => {
    const next = settings.entityTypes.includes(et)
      ? settings.entityTypes.filter((e) => e !== et)
      : [...settings.entityTypes, et];
    update("entityTypes", next);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {t("formEditor.settings.title", "Ustawienia szablonu")}
          </SheetTitle>
          <SheetDescription>
            {t(
              "formEditor.settings.description",
              "Skonfiguruj metadane, moduły i typy encji szablonu.",
            )}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="mt-6 h-[calc(100vh-10rem)] pr-4">
          <div className="space-y-6">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="tpl-name">
                {t("settings.formTemplates.nameLabel")} *
              </Label>
              <Input
                id="tpl-name"
                value={settings.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder={t("settings.formTemplates.namePlaceholder")}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="tpl-description">
                {t("settings.formTemplates.descriptionLabel")}
              </Label>
              <Textarea
                id="tpl-description"
                value={settings.description}
                onChange={(e) => update("description", e.target.value)}
                placeholder={t("settings.formTemplates.descriptionPlaceholder")}
                rows={3}
              />
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label>{t("settings.formTemplates.categoryLabel")}</Label>
              <Select
                value={settings.category}
                onValueChange={(v) => update("category", v as FormCategory)}
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

            <Separator />

            {/* Modules */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">
                {t("settings.formTemplates.modulesLabel")}
              </Label>
              {MODULE_OPTIONS.map((mod) => (
                <div key={mod} className="flex items-center gap-2">
                  <Checkbox
                    id={`sheet-module-${mod}`}
                    checked={settings.modules.includes(mod)}
                    onCheckedChange={() => toggleModule(mod)}
                  />
                  <Label
                    htmlFor={`sheet-module-${mod}`}
                    className="font-normal"
                  >
                    {t(`settings.formTemplates.modules.${mod}`)}
                  </Label>
                </div>
              ))}
            </div>

            <Separator />

            {/* Entity Types */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">
                {t("settings.formTemplates.entityTypesLabel")}
              </Label>
              {ENTITY_TYPE_OPTIONS.map((et) => (
                <div key={et} className="flex items-center gap-2">
                  <Checkbox
                    id={`sheet-entity-${et}`}
                    checked={settings.entityTypes.includes(et)}
                    onCheckedChange={() => toggleEntityType(et)}
                  />
                  <Label
                    htmlFor={`sheet-entity-${et}`}
                    className="font-normal"
                  >
                    {t(`settings.formTemplates.entityTypes.${et}`)}
                  </Label>
                </div>
              ))}
            </div>

            <Separator />

            {/* Signature */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Switch
                  id="sheet-requires-signature"
                  checked={settings.requiresSignature}
                  onCheckedChange={(v) => update("requiresSignature", v)}
                />
                <Label
                  htmlFor="sheet-requires-signature"
                  className="font-normal"
                >
                  {t("settings.formTemplates.requiresSignature")}
                </Label>
              </div>

              {settings.requiresSignature && (
                <div className="space-y-4 pl-1">
                  <div className="space-y-2">
                    <Label>
                      {t("settings.formTemplates.signatureMethodLabel")}
                    </Label>
                    <Select
                      value={settings.signatureMethod}
                      onValueChange={(v) =>
                        update("signatureMethod", v as SignatureMethod)
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
                      value={settings.signerRole}
                      onValueChange={(v) =>
                        update("signerRole", v as SignerRole)
                      }
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
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
