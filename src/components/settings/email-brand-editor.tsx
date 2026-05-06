import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import { useConvexUpload } from "@/hooks/use-convex-upload";
import { useConvexMutation } from "@convex-dev/react-query";
import { useSupabaseEmailBrandConfig } from "@/hooks/use-supabase-email-config";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface EmailBrandEditorProps {
  organizationId: Id<"organizations">;
}

const DEFAULTS = {
  primaryColor: "#2563eb",
  backgroundColor: "#f3f4f6",
  contentBackgroundColor: "#ffffff",
  textColor: "#1f2937",
  secondaryTextColor: "#6b7280",
  accentColor: "#7c3aed",
};

export function EmailBrandEditor({ organizationId }: EmailBrandEditorProps) {
  const { t } = useTranslation();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: config, isLoading } = useSupabaseEmailBrandConfig(organizationId) as { data: any; isLoading: boolean };

  const upsert = useAction(api.emailBrandConfig.upsert);
  const generateUploadUrl = useConvexMutation(api.app.generateUploadUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [companyName, setCompanyName] = useState("");
  const [footerText, setFooterText] = useState("");
  const [primaryColor, setPrimaryColor] = useState(DEFAULTS.primaryColor);
  const [backgroundColor, setBackgroundColor] = useState(DEFAULTS.backgroundColor);
  const [contentBgColor, setContentBgColor] = useState(DEFAULTS.contentBackgroundColor);
  const [textColor, setTextColor] = useState(DEFAULTS.textColor);
  const [secondaryTextColor, setSecondaryTextColor] = useState(DEFAULTS.secondaryTextColor);
  const [accentColor, setAccentColor] = useState(DEFAULTS.accentColor);
  const [website, setWebsite] = useState("");
  const [facebook, setFacebook] = useState("");
  const [instagram, setInstagram] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [logoStorageId, setLogoStorageId] = useState<Id<"_storage"> | undefined>();
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!config) return;
    setCompanyName(config.companyName ?? "");
    setFooterText(config.footerText ?? "");
    setPrimaryColor(config.primaryColor ?? DEFAULTS.primaryColor);
    setBackgroundColor(config.backgroundColor ?? DEFAULTS.backgroundColor);
    setContentBgColor(config.contentBackgroundColor ?? DEFAULTS.contentBackgroundColor);
    setTextColor(config.textColor ?? DEFAULTS.textColor);
    setSecondaryTextColor(config.secondaryTextColor ?? DEFAULTS.secondaryTextColor);
    setAccentColor(config.accentColor ?? DEFAULTS.accentColor);
    setWebsite(config.socialLinks?.website ?? "");
    setFacebook(config.socialLinks?.facebook ?? "");
    setInstagram(config.socialLinks?.instagram ?? "");
    setLinkedin(config.socialLinks?.linkedin ?? "");
    setLogoStorageId(config.logoStorageId ?? undefined);
    setLogoPreviewUrl(config.logoUrl ?? undefined);
  }, [config]);

  const { startUpload, isUploading } = useConvexUpload(generateUploadUrl, {
    onUploadComplete: async (uploaded) => {
      if (fileInputRef.current) fileInputRef.current.value = "";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const storageId = (uploaded[0].response as any).storageId as Id<"_storage">;
      setLogoStorageId(storageId);
      setLogoPreviewUrl(URL.createObjectURL(uploaded[0].file));
    },
  });

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    startUpload([file]);
  };

  const handleRemoveLogo = () => {
    setLogoStorageId(undefined);
    setLogoPreviewUrl(undefined);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const socialLinks =
        website || facebook || instagram || linkedin
          ? {
              website: website || undefined,
              facebook: facebook || undefined,
              instagram: instagram || undefined,
              linkedin: linkedin || undefined,
            }
          : undefined;

      await upsert({
        organizationId,
        logoStorageId,
        companyName: companyName || undefined,
        primaryColor,
        backgroundColor,
        contentBackgroundColor: contentBgColor,
        textColor,
        secondaryTextColor,
        accentColor,
        footerText: footerText || undefined,
        socialLinks,
      });
      toast.success(t("settings.emailBrand.saved"));
    } catch {
      toast.error(t("settings.emailBrand.saveError"));
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      {/* Form */}
      <div className="space-y-6">
        {/* Logo */}
        <div className="space-y-2">
          <Label>Logo</Label>
          <div className="flex items-center gap-3">
            {logoPreviewUrl ? (
              <img
                src={logoPreviewUrl}
                alt="Logo"
                className="h-12 max-w-[200px] rounded object-contain bg-muted p-1"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
                Logo
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {t("common.upload", { defaultValue: "Wgraj" })}
            </Button>
            {logoPreviewUrl && (
              <Button variant="ghost" size="sm" onClick={handleRemoveLogo}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoSelect}
            />
          </div>
        </div>

        {/* Company Info */}
        <div className="space-y-2">
          <Label>{t("settings.emailBrand.companyName")}</Label>
          <Input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder={t("settings.emailBrand.companyNamePlaceholder")}
          />
        </div>

        {/* Colors */}
        <div className="space-y-3">
          <Label className="text-base">{t("settings.emailBrand.colors")}</Label>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ColorField label={t("settings.emailBrand.primaryColor")} value={primaryColor} onChange={setPrimaryColor} />
            <ColorField label={t("settings.emailBrand.accentColor")} value={accentColor} onChange={setAccentColor} />
            <ColorField label={t("settings.emailBrand.backgroundColor")} value={backgroundColor} onChange={setBackgroundColor} />
            <ColorField label={t("settings.emailBrand.contentBgColor")} value={contentBgColor} onChange={setContentBgColor} />
            <ColorField label={t("settings.emailBrand.textColor")} value={textColor} onChange={setTextColor} />
            <ColorField label={t("settings.emailBrand.secondaryTextColor")} value={secondaryTextColor} onChange={setSecondaryTextColor} />
          </div>
        </div>

        {/* Footer */}
        <div className="space-y-2">
          <Label>{t("settings.emailBrand.footerText")}</Label>
          <Textarea
            value={footerText}
            onChange={(e) => setFooterText(e.target.value)}
            placeholder={t("settings.emailBrand.footerTextPlaceholder")}
            rows={2}
          />
        </div>

        {/* Social Links */}
        <div className="space-y-3">
          <Label className="text-base">{t("settings.emailBrand.socialLinks")}</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("settings.emailBrand.website")}</Label>
              <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Facebook</Label>
              <Input value={facebook} onChange={(e) => setFacebook(e.target.value)} placeholder="https://facebook.com/..." />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Instagram</Label>
              <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="https://instagram.com/..." />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">LinkedIn</Label>
              <Input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="https://linkedin.com/..." />
            </div>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("common.save")}
        </Button>
      </div>

      {/* Live Preview */}
      <div className="space-y-2">
        <Label className="text-base">Preview</Label>
        <div
          className="rounded-lg border p-4"
          style={{ backgroundColor }}
        >
          <div
            className="mx-auto rounded-lg"
            style={{
              maxWidth: 380,
              backgroundColor: contentBgColor,
            }}
          >
            {/* Header */}
            <div
              className="border-b px-4 py-3 text-center"
              style={{ borderColor: "#e5e7eb" }}
            >
              {logoPreviewUrl ? (
                <img
                  src={logoPreviewUrl}
                  alt="Logo"
                  className="mx-auto h-8 object-contain"
                />
              ) : (
                <span
                  className="text-sm font-semibold"
                  style={{ color: textColor }}
                >
                  {companyName || "Your Company"}
                </span>
              )}
            </div>

            {/* Body */}
            <div className="px-4 py-5" style={{ color: textColor }}>
              <p className="text-xs leading-relaxed">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.
              </p>
              <div className="mt-3 text-center">
                <span
                  className="inline-block rounded px-4 py-1.5 text-xs font-medium text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  {t("common.action", { defaultValue: "Akcja" })}
                </span>
              </div>
              <p className="mt-3 text-xs">
                <a href="#" style={{ color: accentColor }} onClick={(e) => e.preventDefault()}>
                  Link tekstowy
                </a>
              </p>
            </div>

            {/* Footer */}
            <div
              className="rounded-b-lg px-4 py-3 text-center"
              style={{
                backgroundColor: "#f9fafb",
                color: secondaryTextColor,
              }}
            >
              <p className="text-[10px]">
                {footerText || "ul. Przykładowa 1, 00-001 Warszawa"}
              </p>
              {(website || facebook || instagram || linkedin) && (
                <div className="mt-1 flex items-center justify-center gap-2 text-[10px]">
                  {website && <span>www</span>}
                  {facebook && <span>fb</span>}
                  {instagram && <span>ig</span>}
                  {linkedin && <span>in</span>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-8 cursor-pointer rounded border border-border bg-transparent p-0"
      />
      <div className="flex-1">
        <p className="text-xs">{label}</p>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-0.5 h-7 font-mono text-xs"
        />
      </div>
    </div>
  );
}
