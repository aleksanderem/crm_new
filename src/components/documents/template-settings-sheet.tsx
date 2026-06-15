import { useTranslation } from "react-i18next";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";
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
  folderPath: string;
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
  onSave?: () => void;
  saving?: boolean;
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
  onSave,
  saving = false,
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
      <SheetContent className="flex w-full flex-col sm:max-w-lg">
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

        <ScrollArea className="-mr-4 mt-6 min-h-0 flex-1 pr-4">
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
              <RichTextEditor
                value={settings.description}
                onChange={(val) => update("description", val ?? "")}
                placeholder={t("settings.formTemplates.descriptionPlaceholder")}
                minHeight="80px"
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

            {/* Folder Path */}
            <div className="space-y-2">
              <Label htmlFor="tpl-folder-path">
                {t("settings.formTemplates.folderPathLabel")}
              </Label>
              <Input
                id="tpl-folder-path"
                value={settings.folderPath}
                onChange={(e) => update("folderPath", e.target.value)}
                placeholder={t("settings.formTemplates.folderPathPlaceholder")}
              />
              <p className="text-xs text-muted-foreground">
                {t("settings.formTemplates.folderPathHint")}
              </p>
            </div>

            <Separator />

            {/* Modules */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">
                {t("settings.formTemplates.modulesLabel")}
              </Label>
              {MODULE_OPTIONS.map((mod) => (
                <div key={mod} className="flex items-center justify-between">
                  <Label
                    htmlFor={`sheet-module-${mod}`}
                    className="font-normal"
                  >
                    {t(`settings.formTemplates.modules.${mod}`)}
                  </Label>
                  <Switch
                    id={`sheet-module-${mod}`}
                    checked={settings.modules.includes(mod)}
                    onCheckedChange={() => toggleModule(mod)}
                  />
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
                <div key={et} className="flex items-center justify-between">
                  <Label
                    htmlFor={`sheet-entity-${et}`}
                    className="font-normal"
                  >
                    {t(`settings.formTemplates.entityTypes.${et}`)}
                  </Label>
                  <Switch
                    id={`sheet-entity-${et}`}
                    checked={settings.entityTypes.includes(et)}
                    onCheckedChange={() => toggleEntityType(et)}
                  />
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

        {onSave && (
          <SheetFooter className="mt-4 border-t pt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {t("common.close")}
            </Button>
            <Button
              onClick={onSave}
              disabled={saving || !settings.name.trim()}
              className="min-w-[6rem]"
            >
              {saving
                ? t("common.saving")
                : t("formEditor.save", "Zapisz")}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
