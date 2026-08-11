import { useState, useMemo, useEffect, useRef, type ReactNode } from "react";
import type { FunctionArgs } from "convex/server";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import type { GabinetEmployeeRole } from "@cvx/schema";
import type { MappedGabinetEmployee } from "@/lib/supabase/mappers/gabinet/employees";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";
import { plateJsonToText } from "@/components/plate-text";
import { useConvexUpload } from "@/hooks/use-convex-upload";
import { useConvexMutation } from "@convex-dev/react-query";
import { formatPhoneNumber } from "@/lib/phone";
import { formatBirthDate, parseBirthDateToIso } from "@/lib/format-date";
import {
  Pencil,
  Search,
  X,
  Briefcase,
  Mail,
  Phone,
  MapPin,
  DollarSign,
  Star,
  FileText,
  Upload,
  ClipboardList,
  User,
  Plus,
} from "@/lib/ez-icons";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";
import { ROLES } from "./edit-employee-drawer";

export const EMPLOYMENT_TYPES = ["umowa_o_prace", "umowa_zlecenie", "b2b", "staz"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export function DetailedDataTab({
  employee,
  userEmail,
  treatments,
  treatmentMap,
  organizationId,
  role,
  onChangePassword,
  onUpdate,
  onSetTreatments,
  t,
  i18nLanguage,
  limitedView,
  qualificationsOnlyView,
}: {
  employee: MappedGabinetEmployee;
  userEmail?: string | null;
  treatments: Array<{ _id: string; name: string }> | undefined;
  treatmentMap: Map<string, string>;
  organizationId: Id<"organizations">;
  role?: string | null;
  onChangePassword?: () => void;
  onUpdate: (args: FunctionArgs<typeof api.gabinet.employees.update>) => Promise<void>;
  onSetTreatments: (args: FunctionArgs<typeof api.gabinet.employees.setQualifiedTreatments>) => Promise<void>;
  t: TFunction;
  i18nLanguage: string;
  limitedView?: boolean;
  qualificationsOnlyView?: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state mirrors
  const [formData, setFormData] = useState({
    firstName: employee.firstName ?? "",
    lastName: employee.lastName ?? "",
    phone: employee.phone ?? "",
    email: employee.email ?? "",
    dateOfBirth: parseBirthDateToIso(employee.dateOfBirth),
    pesel: employee.pesel ?? "",
    addressStreet: employee.address?.street ?? "",
    addressCity: employee.address?.city ?? "",
    addressPostalCode: employee.address?.postalCode ?? "",
    employmentType: employee.employmentType ?? "",
    hireDate: employee.hireDate ?? "",
    endDate: employee.endDate ?? "",
    position: employee.position ?? "",
    department: employee.department ?? "",
    role: employee.role,
    notes: employee.notes ?? "",
    skills: (employee.skills ?? []).join(", "),
    yearsOfExperience: employee.yearsOfExperience?.toString() ?? "",
    baseSalary: employee.baseSalary?.toString() ?? "",
    commissionPercent: employee.commissionPercent?.toString() ?? "",
    bankAccount: employee.bankAccount ?? "",
    bio: employee.bio ?? "",
  });

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

  // Certifications state
  const [certifications, setCertifications] = useState(
    employee.certifications ?? []
  );
  const [newCertName, setNewCertName] = useState("");
  const [newCertDate, setNewCertDate] = useState("");
  const [newCertExpiry, setNewCertExpiry] = useState("");

  // Treatment filter and pending selection for edit mode
  const [treatmentSearchLocal, setTreatmentSearchLocal] = useState("");
  const [pendingTreatmentIds, setPendingTreatmentIds] = useState<string[]>([]);
  const filteredTreatmentsLocal = useMemo(() => {
    if (!treatments) return [];
    if (!treatmentSearchLocal) return treatments;
    const q = treatmentSearchLocal.toLowerCase();
    return treatments.filter((tr) => tr.name.toLowerCase().includes(q));
  }, [treatments, treatmentSearchLocal]);

  // Re-sync form when employee data changes
  useEffect(() => {
    setFormData({
      firstName: employee.firstName ?? "",
      lastName: employee.lastName ?? "",
      phone: employee.phone ?? "",
      email: employee.email ?? "",
      dateOfBirth: parseBirthDateToIso(employee.dateOfBirth),
      pesel: employee.pesel ?? "",
      addressStreet: employee.address?.street ?? "",
      addressCity: employee.address?.city ?? "",
      addressPostalCode: employee.address?.postalCode ?? "",
      employmentType: employee.employmentType ?? "",
      hireDate: employee.hireDate ?? "",
      endDate: employee.endDate ?? "",
      position: employee.position ?? "",
      department: employee.department ?? "",
      role: employee.role,
      notes: employee.notes ?? "",
      skills: (employee.skills ?? []).join(", "),
      yearsOfExperience: employee.yearsOfExperience?.toString() ?? "",
      baseSalary: employee.baseSalary?.toString() ?? "",
      commissionPercent: employee.commissionPercent?.toString() ?? "",
      bankAccount: employee.bankAccount ?? "",
      bio: employee.bio ?? "",
    });
    setCertifications(employee.certifications ?? []);
  }, [employee]);

  const startEdit = (section: string) => {
    if (section === "treatments") {
      setPendingTreatmentIds([...employee.qualifiedTreatmentIds]);
      setTreatmentSearchLocal("");
    }
    setEditing(section);
  };

  const cancelEdit = () => {
    setEditing(null);
    // Reset form data
    setFormData({
      firstName: employee.firstName ?? "",
      lastName: employee.lastName ?? "",
      phone: employee.phone ?? "",
      email: employee.email ?? "",
      dateOfBirth: parseBirthDateToIso(employee.dateOfBirth),
      pesel: employee.pesel ?? "",
      addressStreet: employee.address?.street ?? "",
      addressCity: employee.address?.city ?? "",
      addressPostalCode: employee.address?.postalCode ?? "",
      employmentType: employee.employmentType ?? "",
      hireDate: employee.hireDate ?? "",
      endDate: employee.endDate ?? "",
      position: employee.position ?? "",
      department: employee.department ?? "",
      role: employee.role,
      notes: employee.notes ?? "",
      skills: (employee.skills ?? []).join(", "),
      yearsOfExperience: employee.yearsOfExperience?.toString() ?? "",
      baseSalary: employee.baseSalary?.toString() ?? "",
      commissionPercent: employee.commissionPercent?.toString() ?? "",
      bankAccount: employee.bankAccount ?? "",
      bio: employee.bio ?? "",
    });
    setCertifications(employee.certifications ?? []);
    setPendingTreatmentIds([]);
    setTreatmentSearchLocal("");
  };

  const saveSection = async (section: string) => {
    setSaving(true);
    try {
      const updatePayload: FunctionArgs<typeof api.gabinet.employees.update> = {
        organizationId,
        employeeId: employee._id,
      };

      if (section === "personal") {
        updatePayload.firstName = formData.firstName || undefined;
        updatePayload.lastName = formData.lastName || undefined;
        updatePayload.phone = formData.phone || null;
        updatePayload.email = formData.email || null;
        updatePayload.dateOfBirth = formData.dateOfBirth || null;
        updatePayload.pesel = formData.pesel || null;
        updatePayload.address =
          formData.addressStreet || formData.addressCity || formData.addressPostalCode
            ? {
                street: formData.addressStreet || undefined,
                city: formData.addressCity || undefined,
                postalCode: formData.addressPostalCode || undefined,
              }
            : null;
        updatePayload.bio = formData.bio || null;
      } else if (section === "employment") {
        updatePayload.employmentType = (formData.employmentType || null) as EmploymentType | null;
        updatePayload.hireDate = formData.hireDate || null;
        updatePayload.endDate = formData.endDate || null;
        updatePayload.position = formData.position || null;
        updatePayload.department = formData.department || null;
        updatePayload.role = formData.role as GabinetEmployeeRole;
        updatePayload.notes = formData.notes || null;
      } else if (section === "qualifications") {
        const skillsList = formData.skills
          ? formData.skills.split(",").map((s: string) => s.trim()).filter(Boolean)
          : [];
        updatePayload.skills = skillsList.length > 0 ? skillsList : null;
        updatePayload.yearsOfExperience = formData.yearsOfExperience
          ? Number(formData.yearsOfExperience)
          : null;
        updatePayload.certifications =
          certifications.length > 0 ? certifications : null;
      } else if (section === "compensation") {
        updatePayload.baseSalary = formData.baseSalary
          ? Number(formData.baseSalary)
          : null;
        updatePayload.commissionPercent = formData.commissionPercent
          ? Number(formData.commissionPercent)
          : null;
        updatePayload.bankAccount = formData.bankAccount || null;
      } else if (section === "treatments") {
        await onSetTreatments({
          organizationId,
          employeeId: employee._id,
          treatmentIds: pendingTreatmentIds,
        });
        toast.success(t("common.saved"));
        setEditing(null);
        return;
      }

      await onUpdate(updatePayload);
      toast.success(t("common.saved"));
      setEditing(null);
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.employees.errors.saveFailed",
          defaultValue: "Nie udało się zapisać zmian pracownika.",
        }),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAddCertification = () => {
    if (!newCertName.trim()) return;
    setCertifications([
      ...certifications,
      {
        name: newCertName.trim(),
        dateObtained: newCertDate || undefined,
        expiryDate: newCertExpiry || undefined,
      },
    ]);
    setNewCertName("");
    setNewCertDate("");
    setNewCertExpiry("");
  };

  const handleRemoveCertification = (index: number) => {
    setCertifications(certifications.filter((_, i) => i !== index));
  };

  const readOnlyField = (label: string, value: string | undefined | null, icon?: ReactNode) => (
    <div className="flex items-start gap-3 py-1.5">
      {icon && <span className="mt-0.5 text-muted-foreground">{icon}</span>}
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value || "—"}</p>
      </div>
    </div>
  );

  const sectionHeader = (
    title: string,
    sectionKey: string,
    icon: ReactNode,
  ) => (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <h4 className="text-base font-semibold">{title}</h4>
      </div>
      {editing !== sectionKey ? (
        <Button variant="ghost" size="sm" onClick={() => startEdit(sectionKey)}>
          <Pencil className="h-3.5 w-3.5 mr-1" variant="stroke" />
          {t("common.edit")}
        </Button>
      ) : (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={cancelEdit}>
            {t("common.cancel")}
          </Button>
          <Button size="sm" onClick={() => saveSection(sectionKey)} disabled={saving}>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl">
      {!qualificationsOnlyView && <>
      {/* Section: Dane osobowe (Personal Data) */}
      <Card>
        <CardContent className="pt-6">
          {sectionHeader(
            t("gabinet.employees.detailedData.personalData"),
            "personal",
            <User className="h-4 w-4" variant="stroke" />,
          )}

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
              {readOnlyField(t("gabinet.employees.firstName"), employee.firstName)}
              {readOnlyField(t("gabinet.employees.lastName"), employee.lastName)}
              {readOnlyField(
                t("gabinet.employees.detailedData.phone"),
                employee.phone ? formatPhoneNumber(employee.phone) : undefined,
                <Phone className="h-3.5 w-3.5" />,
              )}
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
              {readOnlyField(
                t("gabinet.employees.detailedData.dateOfBirth"),
                employee.dateOfBirth ? formatBirthDate(employee.dateOfBirth) : undefined,
              )}
              {readOnlyField(t("gabinet.employees.detailedData.pesel"), employee.pesel)}
              {(employee.address?.street || employee.address?.city) &&
                readOnlyField(
                  t("gabinet.employees.detailedData.address"),
                  [employee.address?.street, employee.address?.postalCode, employee.address?.city]
                    .filter(Boolean)
                    .join(", "),
                  <MapPin className="h-3.5 w-3.5" />,
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

      {/* Section: Zatrudnienie (Employment) */}
      <Card>
        <CardContent className="pt-6">
          {sectionHeader(
            t("gabinet.employees.detailedData.employment"),
            "employment",
            <Briefcase className="h-4 w-4" variant="stroke" />,
          )}
          {editing === "employment" ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("gabinet.employees.detailedData.employmentType")}</Label>
                  <Select
                    value={formData.employmentType}
                    onValueChange={(v) => setFormData({ ...formData, employmentType: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("gabinet.employees.detailedData.selectEmploymentType")} />
                    </SelectTrigger>
                    <SelectContent>
                      {EMPLOYMENT_TYPES.map((et) => (
                        <SelectItem key={et} value={et}>
                          {t(`gabinet.employees.detailedData.employmentTypes.${et}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("gabinet.employees.detailedData.position")}</Label>
                  <Input
                    value={formData.position}
                    onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                    placeholder={t("gabinet.employees.detailedData.positionPlaceholder")}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("gabinet.employees.hireDate")}</Label>
                  <Input
                    type="date"
                    value={formData.hireDate}
                    onChange={(e) => setFormData({ ...formData, hireDate: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("gabinet.employees.detailedData.endDate")}</Label>
                  <Input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("gabinet.employees.detailedData.department")}</Label>
                  <Input
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("gabinet.employees.role")}</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(v) => setFormData({ ...formData, role: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {t(`gabinet.employees.roles.${r}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t("gabinet.employees.detailedData.notesComments")}</Label>
                <RichTextEditor
                  value={formData.notes}
                  onChange={(val) => setFormData({ ...formData, notes: val ?? "" })}
                  minHeight="80px"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-8 gap-y-1">
              {readOnlyField(
                t("gabinet.employees.detailedData.employmentType"),
                employee.employmentType
                  ? t(`gabinet.employees.detailedData.employmentTypes.${employee.employmentType}`)
                  : undefined,
              )}
              {readOnlyField(t("gabinet.employees.detailedData.position"), employee.position)}
              {readOnlyField(t("gabinet.employees.hireDate"), employee.hireDate)}
              {readOnlyField(t("gabinet.employees.detailedData.endDate"), employee.endDate)}
              {readOnlyField(t("gabinet.employees.detailedData.department"), employee.department)}
              {readOnlyField(
                t("gabinet.employees.role"),
                t(`gabinet.employees.roles.${employee.role}`),
              )}
              {readOnlyField(
                t("common.status"),
                employee.isActive
                  ? t("gabinet.employees.active")
                  : t("common.inactive"),
              )}
              {employee.notes &&
                readOnlyField(t("gabinet.employees.detailedData.notesComments"), plateJsonToText(employee.notes))}
            </div>
          )}
        </CardContent>
      </Card>
      </>}

      {(!limitedView || qualificationsOnlyView) && <>
      {/* Section: Kwalifikacje (Qualifications) */}
      <Card>
        <CardContent className="pt-6">
          {sectionHeader(
            t("gabinet.employees.detailedData.qualifications"),
            "qualifications",
            <Star className="h-4 w-4" />,
          )}
          {editing === "qualifications" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("gabinet.employees.detailedData.skills")}</Label>
                  <Input
                    value={formData.skills}
                    onChange={(e) => setFormData({ ...formData, skills: e.target.value })}
                    placeholder={t("gabinet.employees.detailedData.skillsPlaceholder")}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("gabinet.employees.detailedData.skillsHint")}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("gabinet.employees.detailedData.yearsOfExperience")}</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={formData.yearsOfExperience}
                    onChange={(e) => setFormData({ ...formData, yearsOfExperience: e.target.value })}
                  />
                </div>
              </div>

              {/* Certifications editor */}
              <div className="space-y-2">
                <Label>{t("gabinet.employees.detailedData.certifications")}</Label>
                {certifications.map((cert, idx) => (
                  <div key={idx} className="flex items-center gap-2 rounded-md border p-2">
                    <span className="flex-1 text-sm">{cert.name}</span>
                    {cert.dateObtained && (
                      <span className="text-xs text-muted-foreground">{cert.dateObtained}</span>
                    )}
                    {cert.expiryDate && (
                      <span className="text-xs text-muted-foreground">
                        → {cert.expiryDate}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-destructive"
                      onClick={() => handleRemoveCertification(idx)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Input
                      placeholder={t("gabinet.employees.detailedData.certNamePlaceholder")}
                      value={newCertName}
                      onChange={(e) => setNewCertName(e.target.value)}
                      className="h-8"
                    />
                  </div>
                  <Input
                    type="date"
                    value={newCertDate}
                    onChange={(e) => setNewCertDate(e.target.value)}
                    className="h-8 w-36"
                  />
                  <Input
                    type="date"
                    value={newCertExpiry}
                    onChange={(e) => setNewCertExpiry(e.target.value)}
                    className="h-8 w-36"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={handleAddCertification}
                    disabled={!newCertName.trim()}
                  >
                    <Plus className="h-3 w-3" variant="stroke" />
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Skills */}
              {employee.skills && employee.skills.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    {t("gabinet.employees.detailedData.skills")}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {employee.skills.map((skill, idx) => (
                      <Badge key={idx} variant="secondary">{skill}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {readOnlyField(
                t("gabinet.employees.detailedData.yearsOfExperience"),
                employee.yearsOfExperience != null ? String(employee.yearsOfExperience) : undefined,
              )}
              {/* Certifications list */}
              {employee.certifications && employee.certifications.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    {t("gabinet.employees.detailedData.certifications")}
                  </p>
                  <div className="space-y-1">
                    {employee.certifications.map((cert, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">{cert.name}</span>
                        {cert.dateObtained && (
                          <span className="text-xs text-muted-foreground">{cert.dateObtained}</span>
                        )}
                        {cert.expiryDate && (
                          <span className="text-xs text-muted-foreground">
                            → {cert.expiryDate}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(!employee.skills || employee.skills.length === 0) &&
                !employee.yearsOfExperience &&
                (!employee.certifications || employee.certifications.length === 0) && (
                  <p className="text-sm text-muted-foreground">
                    {t("gabinet.employees.detailedData.noQualificationsYet")}
                  </p>
                )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section: Przypisane zabiegi (Assigned Treatments) */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-primary"><ClipboardList className="h-4 w-4" /></span>
              <h4 className="text-base font-semibold">{t("gabinet.employees.detailedData.assignedTreatments")}</h4>
            </div>
            <Button variant="ghost" size="sm" onClick={() => startEdit("treatments")}>
              <Pencil className="h-3.5 w-3.5 mr-1" variant="stroke" />
              {t("common.edit")}
            </Button>
          </div>
          {employee.qualifiedTreatmentIds.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {employee.qualifiedTreatmentIds.map((tid) => (
                <Badge key={tid} variant="secondary">
                  {treatmentMap.get(tid) || "..."}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("gabinet.employees.noQualifications")}
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={editing === "treatments"} onOpenChange={(open) => { if (!open) cancelEdit(); }}>
        <DialogContent className="max-w-2xl flex flex-col overflow-hidden gap-4">
          <DialogHeader>
            <DialogTitle>{t("gabinet.employees.detailedData.assignedTreatments")}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center w-full rounded-md border bg-transparent shrink-0">
            <Search className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" variant="stroke" />
            <input
              type="text"
              className="h-8 w-full bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
              placeholder={t("gabinet.employees.searchTreatments")}
              value={treatmentSearchLocal}
              onChange={(e) => setTreatmentSearchLocal(e.target.value)}
            />
          </div>
          <div className="flex-1 overflow-y-auto rounded-md border min-h-0">
            {filteredTreatmentsLocal.length === 0 ? (
              <p className="py-3 px-3 text-sm text-muted-foreground text-center">
                {t("detail.relationships.noResults")}
              </p>
            ) : (
              filteredTreatmentsLocal.map((tr) => (
                <label
                  key={tr._id}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-accent cursor-pointer"
                >
                  <Checkbox
                    checked={pendingTreatmentIds.includes(tr._id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setPendingTreatmentIds([...pendingTreatmentIds, tr._id]);
                      } else {
                        setPendingTreatmentIds(pendingTreatmentIds.filter((id) => id !== tr._id));
                      }
                    }}
                  />
                  <span className="text-sm">{tr.name}</span>
                </label>
              ))
            )}
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="ghost" onClick={cancelEdit}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => saveSection("treatments")} disabled={saving}>
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!qualificationsOnlyView && <>
      {/* Section: Wynagrodzenie (Compensation) */}
      <Card>
        <CardContent className="pt-6">
          {sectionHeader(
            t("gabinet.employees.detailedData.compensation"),
            "compensation",
            <DollarSign className="h-4 w-4" />,
          )}
          {editing === "compensation" ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("gabinet.employees.detailedData.baseSalary")}</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={0.01}
                    value={formData.baseSalary}
                    onChange={(e) => setFormData({ ...formData, baseSalary: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("gabinet.employees.detailedData.commissionPercent")}</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step={0.1}
                    value={formData.commissionPercent}
                    onChange={(e) => setFormData({ ...formData, commissionPercent: e.target.value })}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t("gabinet.employees.detailedData.bankAccount")}</Label>
                <Input
                  value={formData.bankAccount}
                  onChange={(e) => setFormData({ ...formData, bankAccount: e.target.value })}
                  placeholder="PL00 0000 0000 0000 0000 0000 0000"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-8 gap-y-1">
              {readOnlyField(
                t("gabinet.employees.detailedData.baseSalary"),
                employee.baseSalary != null
                  ? `${employee.baseSalary.toLocaleString(i18nLanguage)} PLN`
                  : undefined,
              )}
              {readOnlyField(
                t("gabinet.employees.detailedData.commissionPercent"),
                employee.commissionPercent != null ? `${employee.commissionPercent}%` : undefined,
              )}
              {readOnlyField(t("gabinet.employees.detailedData.bankAccount"), employee.bankAccount)}
              {!employee.baseSalary && !employee.commissionPercent && !employee.bankAccount && (
                <p className="text-sm text-muted-foreground col-span-2">
                  {t("gabinet.employees.detailedData.noCompensationYet")}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      </>}
      </>}
    </div>
  );
}
