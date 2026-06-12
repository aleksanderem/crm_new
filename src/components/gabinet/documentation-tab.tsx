import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMutation, useAction } from "convex/react";
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
  ChevronLeft,
  ChevronRight,
} from "@/lib/ez-icons";
import { XIcon, ColumnsIcon, ImageOffIcon } from "lucide-react";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";
import { formatBytes } from "@/hooks/use-file-upload";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

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
  onChanged?: () => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DocumentationTab({
  organizationId,
  appointmentId,
  appointment,
  treatmentParameters,
  onChanged,
}: DocumentationTabProps) {
  const { t } = useTranslation();
  const updateAppointment = useAction(api.gabinet.appointments.update);

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
      await onChanged?.();
    } catch (err) {
      toast.error(
        formatActionError(err, t, {
          key: "gabinet.documentation.errors.saveParamsFailed",
          defaultValue: "Nie udało się zapisać parametrów zabiegowych.",
        }),
      );
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
        interviewNotes: interview || null,
      });
      toast.success(t("common.saved"));
      await onChanged?.();
    } catch (err) {
      toast.error(
        formatActionError(err, t, {
          key: "gabinet.documentation.errors.saveInterviewFailed",
          defaultValue: "Nie udało się zapisać wywiadu.",
        }),
      );
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
        clinicalRemarks: remarks || null,
      });
      toast.success(t("common.saved"));
      await onChanged?.();
    } catch (err) {
      toast.error(
        formatActionError(err, t, {
          key: "gabinet.documentation.errors.saveRemarksFailed",
          defaultValue: "Nie udało się zapisać uwag klinicznych.",
        }),
      );
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
                await onChanged?.();
                resolve();
              } catch (err) {
                toast.error(
                  formatActionError(err, t, {
                    key: "gabinet.documentation.errors.photoUploadFailed",
                    defaultValue: "Nie udało się dodać zdjęcia.",
                  }),
                );
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
    [generateUploadUrl, updateAppointment, organizationId, appointmentId, t, onChanged],
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
      await onChanged?.();
    } catch (err) {
      toast.error(
        formatActionError(err, t, {
          key: "gabinet.documentation.errors.photoRemoveFailed",
          defaultValue: "Nie udało się usunąć zdjęcia.",
        }),
      );
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
      <PhotosSection
        beforePhotos={beforePhotos}
        afterPhotos={afterPhotos}
        urlMap={urlMap}
        onRemove={handleRemovePhoto}
        uploadFile={uploadFile}
        uploadingFiles={uploadingFiles}
        t={t as (key: string, fallback?: string) => string}
      />

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
// PhotosSection — combined card with shared lightbox state for before+after
// ---------------------------------------------------------------------------

function PhotosSection({
  beforePhotos,
  afterPhotos,
  urlMap,
  onRemove,
  uploadFile,
  uploadingFiles,
  t,
}: {
  beforePhotos: Photo[];
  afterPhotos: Photo[];
  urlMap: Map<string, string | null>;
  onRemove: (storageId: Id<"_storage">) => void;
  uploadFile: (file: File, type: "before" | "after") => void;
  uploadingFiles: UploadingFile[];
  t: (key: string, fallback?: string) => string;
}) {
  const orderedPhotos = useMemo(
    () => [...beforePhotos, ...afterPhotos],
    [beforePhotos, afterPhotos],
  );
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [compareMode, setCompareMode] = useState(false);

  const closePreview = useCallback(() => {
    setPreviewIndex(null);
    setCompareMode(false);
  }, []);

  return (
    <>
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
              baseIndex={0}
              urlMap={urlMap}
              onRemove={onRemove}
              onPreview={setPreviewIndex}
              uploadFile={uploadFile}
              uploadingFiles={uploadingFiles}
              t={t}
            />
            <PhotoColumn
              type="after"
              label={t("gabinet.documentation.after", "Po")}
              photos={afterPhotos}
              baseIndex={beforePhotos.length}
              urlMap={urlMap}
              onRemove={onRemove}
              onPreview={setPreviewIndex}
              uploadFile={uploadFile}
              uploadingFiles={uploadingFiles}
              t={t}
            />
          </div>
        </CardContent>
      </Card>

      <PhotoPreviewDialog
        photos={orderedPhotos}
        beforeCount={beforePhotos.length}
        afterCount={afterPhotos.length}
        urlMap={urlMap}
        index={previewIndex}
        onChangeIndex={setPreviewIndex}
        compareMode={compareMode}
        onToggleCompare={setCompareMode}
        onClose={closePreview}
        t={t}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// PhotoColumn — drag & drop upload zone with progress (file-upload-06 style)
// ---------------------------------------------------------------------------

function PhotoColumn({
  type,
  label,
  photos,
  baseIndex,
  urlMap,
  onRemove,
  onPreview,
  uploadFile,
  uploadingFiles,
  t,
}: {
  type: "before" | "after";
  label: string;
  photos: Photo[];
  baseIndex: number;
  urlMap: Map<string, string | null>;
  onRemove: (storageId: Id<"_storage">) => void;
  onPreview: (globalIndex: number) => void;
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
      <PhotoGrid
        photos={photos}
        baseIndex={baseIndex}
        urlMap={urlMap}
        onRemove={onRemove}
        onPreview={onPreview}
      />

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
  baseIndex,
  urlMap,
  onRemove,
  onPreview,
}: {
  photos: Photo[];
  baseIndex: number;
  urlMap: Map<string, string | null>;
  onRemove: (storageId: Id<"_storage">) => void;
  onPreview: (globalIndex: number) => void;
}) {
  if (photos.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-2">
      {photos.map((photo, idx) => {
        const url = urlMap.get(photo.storageId);
        return (
          <div
            key={photo.storageId}
            className="group bg-muted relative aspect-square overflow-hidden rounded-lg"
          >
            {url ? (
              <button
                type="button"
                onClick={() => onPreview(baseIndex + idx)}
                className="block h-full w-full cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Preview photo"
              >
                <img
                  src={url}
                  alt=""
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
              </button>
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Loader2
                  size={16}
                  variant="stroke"
                  className="animate-spin text-muted-foreground"
                />
              </div>
            )}
            <Button
              variant="secondary"
              size="icon"
              className="absolute right-1 top-1 size-6 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(photo.storageId);
              }}
              aria-label="Remove"
            >
              <XIcon className="size-3.5" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PhotoPreviewDialog — lightbox for viewing photos at full size with nav
// ---------------------------------------------------------------------------

function PhotoPreviewDialog({
  photos,
  beforeCount,
  afterCount,
  urlMap,
  index,
  onChangeIndex,
  compareMode,
  onToggleCompare,
  onClose,
  t,
}: {
  photos: Photo[];
  beforeCount: number;
  afterCount: number;
  urlMap: Map<string, string | null>;
  index: number | null;
  onChangeIndex: (index: number) => void;
  compareMode: boolean;
  onToggleCompare: (next: boolean) => void;
  onClose: () => void;
  t: (key: string, fallback?: string) => string;
}) {
  const open = index !== null;
  const photo = index !== null ? photos[index] : undefined;
  const url = photo ? urlMap.get(photo.storageId) : undefined;

  // Pair index for compare mode: derived from the single-mode index so that
  // toggling between modes keeps the user roughly where they were.
  const pairCount = Math.max(beforeCount, afterCount);
  const canCompare = beforeCount > 0 && afterCount > 0;
  const pairIndex =
    index === null
      ? 0
      : index < beforeCount
        ? Math.min(index, pairCount - 1)
        : Math.min(index - beforeCount, pairCount - 1);

  const beforePair = beforeCount > 0 ? photos[Math.min(pairIndex, beforeCount - 1)] : undefined;
  const afterPair =
    afterCount > 0 ? photos[beforeCount + Math.min(pairIndex, afterCount - 1)] : undefined;
  const beforePairUrl = beforePair ? urlMap.get(beforePair.storageId) : undefined;
  const afterPairUrl = afterPair ? urlMap.get(afterPair.storageId) : undefined;

  const goPrev = useCallback(() => {
    if (index === null || photos.length === 0) return;
    if (compareMode) {
      if (pairCount === 0) return;
      const nextPair = (pairIndex - 1 + pairCount) % pairCount;
      // Anchor preview index to the "before" side of the new pair when possible
      // so toggling out of compare mode lands on a sensible photo.
      onChangeIndex(
        beforeCount > 0
          ? Math.min(nextPair, beforeCount - 1)
          : beforeCount + Math.min(nextPair, afterCount - 1),
      );
    } else {
      onChangeIndex((index - 1 + photos.length) % photos.length);
    }
  }, [index, photos.length, onChangeIndex, compareMode, pairIndex, pairCount, beforeCount, afterCount]);

  const goNext = useCallback(() => {
    if (index === null || photos.length === 0) return;
    if (compareMode) {
      if (pairCount === 0) return;
      const nextPair = (pairIndex + 1) % pairCount;
      onChangeIndex(
        beforeCount > 0
          ? Math.min(nextPair, beforeCount - 1)
          : beforeCount + Math.min(nextPair, afterCount - 1),
      );
    } else {
      onChangeIndex((index + 1) % photos.length);
    }
  }, [index, photos.length, onChangeIndex, compareMode, pairIndex, pairCount, beforeCount, afterCount]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, goPrev, goNext]);

  // If photos disappear (e.g. removed), close compare mode automatically.
  useEffect(() => {
    if (!canCompare && compareMode) onToggleCompare(false);
  }, [canCompare, compareMode, onToggleCompare]);

  if (!photo) return null;

  const beforeLabel = t("gabinet.documentation.before", "Przed");
  const afterLabel = t("gabinet.documentation.after", "Po");
  const compareLabel = t("gabinet.documentation.compare", "Porównaj");
  const exitCompareLabel = t("gabinet.documentation.exitCompare", "Zamknij porównanie");
  const showNav = compareMode ? pairCount > 1 : photos.length > 1;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={`flex max-h-[95dvh] w-[95vw] flex-col gap-3 bg-background p-4 ${
          compareMode ? "max-w-[95vw] sm:max-w-6xl" : "max-w-[95vw] sm:max-w-4xl"
        }`}
      >
        <DialogTitle className="sr-only">Photo preview</DialogTitle>
        <div className="flex items-center justify-end gap-2">
          {canCompare && (
            <Button
              variant={compareMode ? "default" : "secondary"}
              size="sm"
              onClick={() => onToggleCompare(!compareMode)}
              aria-pressed={compareMode}
            >
              <ColumnsIcon className="mr-1.5 size-4" />
              {compareMode ? exitCompareLabel : compareLabel}
            </Button>
          )}
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center">
          {compareMode ? (
            <div className="grid w-full grid-cols-2 gap-3">
              <ComparePane
                label={beforeLabel}
                url={beforePairUrl}
                photo={beforePair}
                t={t}
              />
              <ComparePane
                label={afterLabel}
                url={afterPairUrl}
                photo={afterPair}
                t={t}
              />
            </div>
          ) : url ? (
            <img
              src={url}
              alt=""
              className="max-h-[80dvh] max-w-full rounded-md object-contain"
            />
          ) : (
            <Loader2
              size={32}
              variant="stroke"
              className="animate-spin text-muted-foreground"
            />
          )}
          {showNav && (
            <>
              <Button
                variant="secondary"
                size="icon"
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full shadow"
                onClick={goPrev}
                aria-label="Previous"
              >
                <ChevronLeft className="size-5" variant="stroke" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full shadow"
                onClick={goNext}
                aria-label="Next"
              >
                <ChevronRight className="size-5" variant="stroke" />
              </Button>
            </>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          {compareMode ? (
            <>
              <span>
                {beforePair
                  ? new Date(beforePair.uploadedAt).toLocaleString()
                  : "—"}
                {" · "}
                {afterPair
                  ? new Date(afterPair.uploadedAt).toLocaleString()
                  : "—"}
              </span>
              {pairCount > 1 && (
                <span>
                  {pairIndex + 1} / {pairCount}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="flex items-center gap-2">
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                  {photo.type === "before" ? beforeLabel : afterLabel}
                </span>
                {new Date(photo.uploadedAt).toLocaleString()}
              </span>
              {photos.length > 1 && (
                <span>
                  {(index ?? 0) + 1} / {photos.length}
                </span>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ComparePane({
  label,
  url,
  photo,
  t,
}: {
  label: string;
  url: string | null | undefined;
  photo: Photo | undefined;
  t: (key: string, fallback?: string) => string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="bg-muted flex aspect-square w-full items-center justify-center overflow-hidden rounded-md">
        {photo && url ? (
          <img
            src={url}
            alt=""
            className="max-h-[70dvh] w-full object-contain"
          />
        ) : photo ? (
          <Loader2
            size={24}
            variant="stroke"
            className="animate-spin text-muted-foreground"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
            <ImageOffIcon className="size-6" />
            <span>{t("gabinet.documentation.noPhoto", "Brak zdjęcia")}</span>
          </div>
        )}
      </div>
    </div>
  );
}
