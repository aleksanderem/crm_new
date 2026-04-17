import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Upload,
  Stethoscope,
  MessageSquare,
  Eye,
  StickyNote,
} from "@/lib/ez-icons";
import { XIcon } from "lucide-react";
import { toast } from "sonner";
import { formatBytes } from "@/hooks/use-file-upload";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TreatmentParamDefinition {
  name: string;
  type: "text" | "number" | "checkbox" | "radio" | "select";
  description?: string;
  unit?: string;
  options?: string[];
  isRequired?: boolean;
}

interface TreatmentParamValue {
  name: string;
  type: string;
  value: string | number | boolean;
}

interface Photo {
  storageId: Id<"_storage">;
  type: "before" | "after";
  caption?: string;
  uploadedAt: number;
}

interface UploadingFile {
  id: string;
  file: File;
  preview: string;
  progress: number;
  type: "before" | "after";
}

interface DocumentationTabProps {
  organizationId: Id<"organizations">;
  appointmentId: Id<"gabinetAppointments">;
  appointment: {
    treatmentParameterValues?: string;
    interviewNotes?: string;
    clinicalRemarks?: string;
    photos?: Photo[];
  };
  treatmentParameters?: TreatmentParamDefinition[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DocumentationTab({
  organizationId,
  appointmentId,
  appointment,
  treatmentParameters,
}: DocumentationTabProps) {
  const { t } = useTranslation();
  const updateAppointment = useMutation(api.gabinet.appointments.update);

  // --- Parameter values ---
  const [paramValues, setParamValues] = useState<TreatmentParamValue[]>([]);
  const [isSavingParams, setIsSavingParams] = useState(false);

  useEffect(() => {
    if (appointment.treatmentParameterValues) {
      try {
        const parsed = JSON.parse(appointment.treatmentParameterValues);
        // Backward compatibility: old format had {name, value, unit} without type
        const normalized = parsed.map((p: any) => ({
          name: p.name,
          type: p.type ?? "text",
          value: p.value ?? "",
        }));
        setParamValues(normalized);
        return;
      } catch {
        // fall through to template
      }
    }
    // Initialize from treatment template definitions
    if (treatmentParameters?.length) {
      setParamValues(
        treatmentParameters.map((def) => ({
          name: def.name,
          type: def.type,
          value: def.type === "checkbox" ? false : def.type === "number" ? "" : "",
        })),
      );
    }
  }, [appointment.treatmentParameterValues, treatmentParameters]);

  const handleParamChange = (index: number, value: string | number | boolean) => {
    setParamValues((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], value };
      return next;
    });
  };

  const handleSaveParams = async () => {
    setIsSavingParams(true);
    try {
      await updateAppointment({
        organizationId,
        appointmentId,
        treatmentParameterValues: JSON.stringify(paramValues),
      });
      toast.success(t("common.saved"));
    } catch (err: any) {
      toast.error(err.message ?? t("common.error"));
    } finally {
      setIsSavingParams(false);
    }
  };

  // --- Interview notes ---
  const [interview, setInterview] = useState<string | undefined>(
    appointment.interviewNotes,
  );
  const [isSavingInterview, setIsSavingInterview] = useState(false);

  const handleSaveInterview = async () => {
    setIsSavingInterview(true);
    try {
      await updateAppointment({
        organizationId,
        appointmentId,
        interviewNotes: interview || undefined,
      });
      toast.success(t("common.saved"));
    } catch (err: any) {
      toast.error(err.message ?? t("common.error"));
    } finally {
      setIsSavingInterview(false);
    }
  };

  // --- Clinical remarks ---
  const [remarks, setRemarks] = useState<string | undefined>(
    appointment.clinicalRemarks,
  );
  const [isSavingRemarks, setIsSavingRemarks] = useState(false);

  const handleSaveRemarks = async () => {
    setIsSavingRemarks(true);
    try {
      await updateAppointment({
        organizationId,
        appointmentId,
        clinicalRemarks: remarks || undefined,
      });
      toast.success(t("common.saved"));
    } catch (err: any) {
      toast.error(err.message ?? t("common.error"));
    } finally {
      setIsSavingRemarks(false);
    }
  };

  // --- Photos ---
  const photos = appointment.photos ?? [];
  const beforePhotos = photos.filter((p) => p.type === "before");
  const afterPhotos = photos.filter((p) => p.type === "after");

  const storageIds = photos.map((p) => p.storageId);
  const { data: photoUrls } = useQuery({
    ...convexQuery(api.gabinet.appointments.getPhotoUrls, {
      organizationId,
      storageIds,
    }),
    enabled: storageIds.length > 0,
  });

  const urlMap = new Map<string, string | null>();
  if (photoUrls) {
    storageIds.forEach((id, i) => urlMap.set(id, photoUrls[i]));
  }

  const generateUploadUrl = useMutation(api.app.generateUploadUrl);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);

  // Use a ref to always have the latest photos array in the XHR callback
  const photosRef = useRef(photos);
  photosRef.current = photos;

  const uploadFile = useCallback(
    async (file: File, type: "before" | "after") => {
      const id = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const preview = URL.createObjectURL(file);

      setUploadingFiles((prev) => [...prev, { id, file, preview, progress: 0, type }]);

      try {
        const url = await generateUploadUrl();

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();

          xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
              const progress = Math.round((e.loaded / e.total) * 100);
              setUploadingFiles((prev) =>
                prev.map((f) => (f.id === id ? { ...f, progress } : f)),
              );
            }
          });

          xhr.addEventListener("load", async () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const { storageId } = JSON.parse(xhr.responseText);
                const newPhoto: Photo = {
                  storageId,
                  type,
                  uploadedAt: Date.now(),
                };
                await updateAppointment({
                  organizationId,
                  appointmentId,
                  photos: [...photosRef.current, newPhoto],
                });
                toast.success(t("common.saved"));
                resolve();
              } catch (err: any) {
                toast.error(err.message ?? t("common.error"));
                reject(err);
              }
            } else {
              toast.error(t("common.error"));
              reject(new Error("Upload failed"));
            }
          });

          xhr.addEventListener("error", () => {
            toast.error(t("common.error"));
            reject(new Error("Upload failed"));
          });

          xhr.open("POST", url);
          xhr.setRequestHeader("Content-Type", file.type);
          xhr.send(file);
        });
      } catch {
        // errors already toasted above
      } finally {
        setUploadingFiles((prev) => prev.filter((f) => f.id !== id));
        URL.revokeObjectURL(preview);
      }
    },
    [generateUploadUrl, updateAppointment, organizationId, appointmentId, t],
  );

  const handleRemovePhoto = async (storageId: Id<"_storage">) => {
    const updated = photos.filter((p) => p.storageId !== storageId);
    try {
      await updateAppointment({
        organizationId,
        appointmentId,
        photos: updated,
      });
      toast.success(t("common.saved"));
    } catch (err: any) {
      toast.error(err.message ?? t("common.error"));
    }
  };

  return (
    <div className="space-y-4">
      {/* Treatment Parameters */}
      {paramValues.length > 0 && (
        <Card>
          <CardHeader className="px-6 py-3 border-b">
            <CardTitle className="text-sm flex items-center gap-2">
              <Stethoscope className="h-4 w-4" variant="stroke" />
              {t("gabinet.documentation.parameters", "Parametry zabiegowe")}
            </CardTitle>
            <CardDescription className="text-xs">
              {t(
                "gabinet.documentation.parametersDesc",
                "Uzupełnij wartości parametrów zabiegu dla tej wizyty.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 py-4">
            <div className="space-y-4">
              {paramValues.map((param, i) => {
                const def = treatmentParameters?.find((d) => d.name === param.name);
                const paramType = def?.type ?? param.type ?? "text";
                return (
                  <div key={param.name} className="space-y-1.5">
                    <Label className="text-sm">
                      {param.name}
                      {def?.unit && (
                        <span className="ml-1 text-muted-foreground font-normal">
                          ({def.unit})
                        </span>
                      )}
                      {def?.isRequired && <span className="text-destructive"> *</span>}
                    </Label>
                    {def?.description && (
                      <p className="text-xs text-muted-foreground">{def.description}</p>
                    )}
                    {paramType === "text" && (
                      <Input
                        value={String(param.value ?? "")}
                        onChange={(e) => handleParamChange(i, e.target.value)}
                        placeholder="—"
                      />
                    )}
                    {paramType === "number" && (
                      <Input
                        type="number"
                        value={String(param.value ?? "")}
                        onChange={(e) => handleParamChange(i, e.target.value)}
                        placeholder="—"
                        className="w-40"
                      />
                    )}
                    {paramType === "checkbox" && (
                      <div className="flex items-center gap-2 pt-1">
                        <Checkbox
                          checked={param.value === true || param.value === "true"}
                          onCheckedChange={(checked) => handleParamChange(i, !!checked)}
                        />
                        <span className="text-sm text-muted-foreground">
                          {def?.options?.[0] ?? t("common.yes", "Tak")}
                        </span>
                      </div>
                    )}
                    {paramType === "radio" && def?.options && (
                      <RadioGroup
                        value={String(param.value ?? "")}
                        onValueChange={(val) => handleParamChange(i, val)}
                        className="flex flex-col gap-2 pt-1"
                      >
                        {def.options.map((opt) => (
                          <div key={opt} className="flex items-center gap-2">
                            <RadioGroupItem value={opt} id={`${param.name}-${opt}`} />
                            <Label htmlFor={`${param.name}-${opt}`} className="text-sm font-normal cursor-pointer">
                              {opt}
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                    )}
                    {paramType === "select" && def?.options && (
                      <Select
                        value={String(param.value ?? "")}
                        onValueChange={(val) => handleParamChange(i, val)}
                      >
                        <SelectTrigger className="w-60">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          {def.options.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                );
              })}
              <div className="flex justify-end pt-1">
                <Button
                  size="sm"
                  onClick={handleSaveParams}
                  disabled={isSavingParams}
                >
                  {isSavingParams ? t("common.saving") : t("common.save")}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Interview Notes */}
      <Card>
        <CardHeader className="px-6 py-3 border-b">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquare className="h-4 w-4" variant="stroke" />
            {t("gabinet.documentation.interview", "Wywiad")}
          </CardTitle>
          <CardDescription className="text-xs">
            {t(
              "gabinet.documentation.interviewDesc",
              "Notatki z wywiadu z pacjentem przed zabiegiem.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 py-4">
          <RichTextEditor
            value={appointment.interviewNotes}
            onChange={setInterview}
            placeholder={t(
              "gabinet.documentation.interviewPlaceholder",
              "Opisz wywiad z pacjentem...",
            )}
          />
          <div className="flex justify-end pt-3">
            <Button
              size="sm"
              onClick={handleSaveInterview}
              disabled={isSavingInterview}
            >
              {isSavingInterview ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Before/After Photos */}
      <Card>
        <CardHeader className="px-6 py-3 border-b">
          <CardTitle className="text-sm flex items-center gap-2">
            <Eye className="h-4 w-4" variant="stroke" />
            {t("gabinet.documentation.photos", "Zdjęcia przed / po")}
          </CardTitle>
          <CardDescription className="text-xs">
            {t(
              "gabinet.documentation.photosDesc",
              "Dodaj zdjęcia dokumentujące stan przed i po zabiegu.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 py-4">
          <div className="grid grid-cols-2 gap-4">
            <PhotoColumn
              type="before"
              label={t("gabinet.documentation.before", "Przed")}
              photos={beforePhotos}
              urlMap={urlMap}
              onRemove={handleRemovePhoto}
              uploadFile={uploadFile}
              uploadingFiles={uploadingFiles}
              t={t as (key: string, fallback?: string) => string}
            />
            <PhotoColumn
              type="after"
              label={t("gabinet.documentation.after", "Po")}
              photos={afterPhotos}
              urlMap={urlMap}
              onRemove={handleRemovePhoto}
              uploadFile={uploadFile}
              uploadingFiles={uploadingFiles}
              t={t as (key: string, fallback?: string) => string}
            />
          </div>
        </CardContent>
      </Card>

      {/* Clinical Remarks */}
      <Card>
        <CardHeader className="px-6 py-3 border-b">
          <CardTitle className="text-sm flex items-center gap-2">
            <StickyNote className="h-4 w-4" variant="stroke" />
            {t("gabinet.documentation.remarks", "Uwagi")}
          </CardTitle>
          <CardDescription className="text-xs">
            {t(
              "gabinet.documentation.remarksDesc",
              "Dodatkowe uwagi kliniczne dotyczące zabiegu.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 py-4">
          <RichTextEditor
            value={appointment.clinicalRemarks}
            onChange={setRemarks}
            placeholder={t(
              "gabinet.documentation.remarksPlaceholder",
              "Dodaj uwagi...",
            )}
          />
          <div className="flex justify-end pt-3">
            <Button
              size="sm"
              onClick={handleSaveRemarks}
              disabled={isSavingRemarks}
            >
              {isSavingRemarks ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PhotoColumn — drag & drop upload zone with progress (file-upload-06 style)
// ---------------------------------------------------------------------------

function PhotoColumn({
  type,
  label,
  photos,
  urlMap,
  onRemove,
  uploadFile,
  uploadingFiles,
  t,
}: {
  type: "before" | "after";
  label: string;
  photos: Photo[];
  urlMap: Map<string, string | null>;
  onRemove: (storageId: Id<"_storage">) => void;
  uploadFile: (file: File, type: "before" | "after") => void;
  uploadingFiles: UploadingFile[];
  t: (key: string, fallback?: string) => string;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const myUploads = uploadingFiles.filter((f) => f.type === type);

  const handleFiles = (files: FileList | File[]) => {
    Array.from(files).forEach((f) => {
      if (f.type.startsWith("image/")) uploadFile(f, type);
    });
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>

      {/* Already-uploaded photos */}
      <PhotoGrid photos={photos} urlMap={urlMap} onRemove={onRemove} />

      {/* Uploading files with real progress */}
      {myUploads.map((upload) => (
        <div
          key={upload.id}
          className="bg-muted flex flex-col gap-1 rounded-lg p-3"
        >
          <div className="flex items-center gap-3">
            <img
              src={upload.preview}
              alt=""
              className="size-10 shrink-0 rounded object-cover"
            />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="truncate text-sm font-medium">{upload.file.name}</p>
              <p className="text-muted-foreground text-xs">
                {formatBytes(upload.file.size)}
              </p>
            </div>
          </div>
          <div className="mt-1 flex flex-col gap-1">
            <span className="text-muted-foreground self-end text-xs">
              {upload.progress}%
            </span>
            <div className="bg-primary/10 h-1.5 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary h-full transition-all duration-300 ease-out"
                style={{ width: `${upload.progress}%` }}
              />
            </div>
          </div>
        </div>
      ))}

      {/* Drop zone */}
      <div
        role="button"
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDragging(false);
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragging(false);
          if (e.dataTransfer.files?.length) {
            handleFiles(e.dataTransfer.files);
          }
        }}
        data-dragging={isDragging || undefined}
        className="border-input data-[dragging=true]:bg-accent/50 data-[dragging=true]:border-primary/50 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/50"
      >
        <Upload size={24} variant="stroke" className="stroke-1" />
        <p>
          {t("gabinet.documentation.dragOrClick", "Przeciągnij lub kliknij")}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) {
              handleFiles(e.target.files);
              e.target.value = "";
            }
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PhotoGrid
// ---------------------------------------------------------------------------

function PhotoGrid({
  photos,
  urlMap,
  onRemove,
}: {
  photos: Photo[];
  urlMap: Map<string, string | null>;
  onRemove: (storageId: Id<"_storage">) => void;
}) {
  if (photos.length === 0) return null;

  return (
    <div className="space-y-2">
      {photos.map((photo) => {
        const url = urlMap.get(photo.storageId);
        return (
          <div
            key={photo.storageId}
            className="bg-muted group flex items-center gap-3 rounded-lg p-3"
          >
            <div className="size-10 shrink-0 overflow-hidden rounded">
              {url ? (
                <img
                  src={url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-muted">
                  <Loader2
                    size={14}
                    variant="stroke"
                    className="animate-spin text-muted-foreground"
                  />
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="truncate text-sm font-medium">
                {url ? url.split("/").pop() : "..."}
              </p>
              <p className="text-muted-foreground text-xs">
                {new Date(photo.uploadedAt).toLocaleDateString()}
              </p>
            </div>
            <Button
              variant="ghost"
              className="size-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-transparent"
              onClick={() => onRemove(photo.storageId)}
              aria-label="Remove"
            >
              <XIcon className="size-4" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
