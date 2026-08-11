import { useRef, useState } from "react";
import type { FunctionArgs } from "convex/server";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import type { MappedGabinetEmployee } from "@/lib/supabase/mappers/gabinet/employees";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useConvexUpload } from "@/hooks/use-convex-upload";
import { useConvexMutation } from "@convex-dev/react-query";
import { formatPhoneNumber } from "@/lib/phone";
import { formatBirthDate } from "@/lib/format-date";
import { Mail, Phone, MapPin, Upload, User } from "@/lib/ez-icons";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";
import { SectionHeader, ReadOnlyField } from "./section-header";
import type { EmployeeFormData } from "./types";

export function PersonalInfoSection({
  employee,
  organizationId,
  formData,
  setFormData,
  editing,
  saving,
  role,
  userEmail,
  onChangePassword,
  onUpdate,
  onStartEdit,
  onCancelEdit,
  onSaveSection,
  t,
}: {
  employee: MappedGabinetEmployee;
  organizationId: Id<"organizations">;
  formData: EmployeeFormData;
  setFormData: (data: EmployeeFormData) => void;
  editing: string | null;
  saving: boolean;
  role?: string | null;
  userEmail?: string | null;
  onChangePassword?: () => void;
  onUpdate: (args: FunctionArgs<typeof api.gabinet.employees.update>) => Promise<void>;
  onStartEdit: (s: string) => void;
  onCancelEdit: () => void;
  onSaveSection: (s: string) => Promise<void>;
  t: TFunction;
}) {
  const photoFileRef = useRef<HTMLInputElement>(null);
  const generateUploadUrl = useConvexMutation(api.app.generateUploadUrl);
  const getStorageUrl = useConvexMutation(api.app.getStorageUrl);
  const [photoUploading, setPhotoUploading] = useState(false);
  const { startUpload } = useConvexUpload(generateUploadUrl, {
    onUploadBegin: () => setPhotoUploading(true),
    onUploadComplete: async (uploaded) => {
      try {
        const storageId = (uploaded[0]!.response as { storageId: string }).storageId;
        const url = await getStorageUrl({ storageId: storageId as Id<"_storage"> });
        if (url) {
          await onUpdate({ organizationId, employeeId: employee._id, avatarUrl: url });
        } else {
          toast.error(t("gabinet.employees.errors.photoUploadFailed", { defaultValue: "Nie udało się przetworzyć zdjęcia. Spróbuj ponownie." }));
        }
      } catch (e) {
        toast.error(formatActionError(e, t, {
          key: "gabinet.employees.errors.photoUploadFailed",
          defaultValue: "Nie udało się zapisać zdjęcia profilowego.",
        }));
      } finally {
        setPhotoUploading(false);
        if (photoFileRef.current) photoFileRef.current.value = "";
      }
    },
    onUploadError: () => {
      setPhotoUploading(false);
      toast.error(t("gabinet.employees.errors.photoUploadFailed", { defaultValue: "Nie udało się przesłać zdjęcia profilowego." }));
    },
  });

  return (
    <Card>
      <CardContent className="pt-6">
        <SectionHeader
          title={t("gabinet.employees.detailedData.personalData")}
          sectionKey="personal"
          icon={<User className="h-4 w-4" variant="stroke" />}
          editing={editing}
          saving={saving}
          onStartEdit={onStartEdit}
          onCancelEdit={onCancelEdit}
          onSaveSection={onSaveSection}
          t={t}
        />

        {/* Profile photo — always visible, independent of section edit state */}
        <div className="flex items-center gap-4 mb-5 pb-5 border-b">
          <div className="relative group shrink-0">
            <Avatar className="h-20 w-20">
              {employee.avatarUrl && <AvatarImage src={employee.avatarUrl} alt={employee.firstName ?? ""} className="object-cover" />}
              <AvatarFallback className="text-2xl">
                {(employee.firstName?.[0] ?? "") + (employee.lastName?.[0] ?? "")}
              </AvatarFallback>
            </Avatar>
            <label
              htmlFor="employee-photo-upload"
              className={[
                "absolute inset-0 rounded-full flex items-center justify-center",
                "bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer",
                photoUploading ? "opacity-100 cursor-not-allowed" : "",
              ].join(" ")}
            >
              {photoUploading
                ? <span className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Upload className="h-5 w-5 text-white" variant="stroke" />}
            </label>
            <input
              ref={photoFileRef}
              id="employee-photo-upload"
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={photoUploading}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length > 0) startUpload(files);
              }}
            />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("gabinet.employees.detailedData.profilePhoto")}</p>
            <p className="text-xs text-muted-foreground">{t("gabinet.employees.detailedData.photoUploadHint")}</p>
            {employee.avatarUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                disabled={photoUploading}
                onClick={async () => {
                  await onUpdate({ organizationId, employeeId: employee._id, avatarUrl: null });
                }}
              >
                {t("gabinet.employees.detailedData.removePhoto")}
              </Button>
            )}
          </div>
        </div>

        {editing === "personal" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("gabinet.employees.firstName")}</Label>
                <Input
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("gabinet.employees.lastName")}</Label>
                <Input
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("gabinet.employees.detailedData.phone")}</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+48 ..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("gabinet.employees.detailedData.email")}</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("gabinet.employees.detailedData.dateOfBirth")}</Label>
                <Input
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("gabinet.employees.detailedData.pesel")}</Label>
                <Input
                  value={formData.pesel}
                  onChange={(e) => setFormData({ ...formData, pesel: e.target.value })}
                  placeholder="00000000000"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("gabinet.employees.detailedData.address")}</Label>
              <div className="grid grid-cols-3 gap-2">
                <Input
                  placeholder={t("gabinet.employees.detailedData.street")}
                  value={formData.addressStreet}
                  onChange={(e) => setFormData({ ...formData, addressStreet: e.target.value })}
                  className="col-span-2"
                />
                <Input
                  placeholder={t("gabinet.employees.detailedData.postalCode")}
                  value={formData.addressPostalCode}
                  onChange={(e) => setFormData({ ...formData, addressPostalCode: e.target.value })}
                />
              </div>
              <Input
                placeholder={t("gabinet.employees.detailedData.city")}
                value={formData.addressCity}
                onChange={(e) => setFormData({ ...formData, addressCity: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("gabinet.employees.detailedData.bio")}</Label>
              <Textarea
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                placeholder={t("gabinet.employees.detailedData.bioPlaceholder")}
                maxLength={1000}
                className="min-h-[80px] resize-y"
              />
              <p className="text-xs text-muted-foreground text-right">
                {formData.bio.length}/1000
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-8 gap-y-1">
            <ReadOnlyField label={t("gabinet.employees.firstName")} value={employee.firstName} />
            <ReadOnlyField label={t("gabinet.employees.lastName")} value={employee.lastName} />
            <ReadOnlyField
              label={t("gabinet.employees.detailedData.phone")}
              value={employee.phone ? formatPhoneNumber(employee.phone) : undefined}
              icon={<Phone className="h-3.5 w-3.5" />}
            />
            <div className="flex items-start gap-3 py-1.5">
              <span className="mt-0.5 text-muted-foreground"><Mail className="h-3.5 w-3.5" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{t("gabinet.employees.detailedData.email")}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium">{employee.email || userEmail || "—"}</p>
                  {(role === "admin" || role === "owner") && userEmail && onChangePassword && (
                    <Button variant="outline" size="sm" onClick={onChangePassword} className="shrink-0">
                      {t("gabinet.employees.changePassword")}
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <ReadOnlyField
              label={t("gabinet.employees.detailedData.dateOfBirth")}
              value={employee.dateOfBirth ? formatBirthDate(employee.dateOfBirth) : undefined}
            />
            <ReadOnlyField label={t("gabinet.employees.detailedData.pesel")} value={employee.pesel} />
            {(employee.address?.street || employee.address?.city) && (
              <ReadOnlyField
                label={t("gabinet.employees.detailedData.address")}
                value={[employee.address?.street, employee.address?.postalCode, employee.address?.city]
                  .filter(Boolean)
                  .join(", ")}
                icon={<MapPin className="h-3.5 w-3.5" />}
              />
            )}
            {employee.bio && (
              <div className="col-span-2 flex items-start gap-3 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">{t("gabinet.employees.detailedData.bio")}</p>
                  <p className="text-sm font-medium whitespace-pre-wrap">{employee.bio}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
