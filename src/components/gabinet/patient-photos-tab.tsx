import { useMemo, useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import type { MappedGabinetAppointment } from "@/lib/supabase/mappers/gabinet/appointments";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Eye,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "@/lib/ez-icons";
import { ColumnsIcon, ImageOffIcon } from "lucide-react";

interface AppointmentPhoto {
  storageId: Id<"_storage">;
  type: "before" | "after";
  caption?: string;
  uploadedAt: number;
}

interface PatientPhotosTabProps {
  organizationId: Id<"organizations">;
  appointments: MappedGabinetAppointment[] | undefined;
  treatments: { _id: string; name: string }[] | undefined;
}

interface AppointmentWithPhotos {
  appointment: MappedGabinetAppointment;
  photos: AppointmentPhoto[];
}

function isAppointmentPhoto(value: unknown): value is AppointmentPhoto {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.storageId === "string" &&
    (p.type === "before" || p.type === "after") &&
    typeof p.uploadedAt === "number"
  );
}

export function PatientPhotosTab({
  organizationId,
  appointments,
  treatments,
}: PatientPhotosTabProps) {
  const { t } = useTranslation();

  const groups: AppointmentWithPhotos[] = useMemo(() => {
    if (!appointments) return [];
    return appointments
      .map((appointment) => {
        const raw = Array.isArray(appointment.photos) ? appointment.photos : [];
        const photos = (raw as unknown[]).filter(isAppointmentPhoto);
        return { appointment, photos };
      })
      .filter((g) => g.photos.length > 0)
      .sort((a, b) =>
        (b.appointment.date + b.appointment.startTime).localeCompare(
          a.appointment.date + a.appointment.startTime,
        ),
      );
  }, [appointments]);

  const allStorageIds = useMemo(
    () => groups.flatMap((g) => g.photos.map((p) => p.storageId)),
    [groups],
  );

  const { data: photoUrls } = useQuery({
    ...convexQuery(api.gabinet.appointments.getPhotoUrls, {
      organizationId,
      storageIds: allStorageIds,
    }),
    enabled: allStorageIds.length > 0,
  });

  const urlMap = useMemo(() => {
    const map = new Map<string, string | null>();
    if (photoUrls) {
      allStorageIds.forEach((id, i) => map.set(id, photoUrls[i]));
    }
    return map;
  }, [photoUrls, allStorageIds]);

  // Flat list of all (groupIndex, photoIndex) for lightbox navigation across
  // all appointment groups in display order.
  const flatPhotos = useMemo(
    () =>
      groups.flatMap((g, gi) =>
        g.photos.map((p, pi) => ({
          group: g,
          groupIndex: gi,
          photoIndex: pi,
          photo: p,
        })),
      ),
    [groups],
  );

  // For the comparison view: chronological lists of all "before" and "after"
  // photos across every appointment. Sorted oldest → newest so the first
  // photo on each side is the earliest one for the patient (typical starting
  // point when comparing progress).
  const beforeEntries = useMemo(
    () =>
      flatPhotos
        .filter((f) => f.photo.type === "before")
        .sort((a, b) => a.photo.uploadedAt - b.photo.uploadedAt),
    [flatPhotos],
  );
  const afterEntries = useMemo(
    () =>
      flatPhotos
        .filter((f) => f.photo.type === "after")
        .sort((a, b) => a.photo.uploadedAt - b.photo.uploadedAt),
    [flatPhotos],
  );
  const canCompare = beforeEntries.length > 0 && afterEntries.length > 0;

  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareAppointmentId, setCompareAppointmentId] = useState<
    string | null
  >(null);

  const dialogBeforeEntries = useMemo(
    () =>
      compareAppointmentId === null
        ? beforeEntries
        : beforeEntries.filter(
            (e) => e.group.appointment._id === compareAppointmentId,
          ),
    [beforeEntries, compareAppointmentId],
  );
  const dialogAfterEntries = useMemo(
    () =>
      compareAppointmentId === null
        ? afterEntries
        : afterEntries.filter(
            (e) => e.group.appointment._id === compareAppointmentId,
          ),
    [afterEntries, compareAppointmentId],
  );

  const closePreview = useCallback(() => setPreviewIndex(null), []);

  const goPrev = useCallback(() => {
    setPreviewIndex((idx) =>
      idx === null
        ? null
        : (idx - 1 + flatPhotos.length) % flatPhotos.length,
    );
  }, [flatPhotos.length]);

  const goNext = useCallback(() => {
    setPreviewIndex((idx) =>
      idx === null ? null : (idx + 1) % flatPhotos.length,
    );
  }, [flatPhotos.length]);

  useEffect(() => {
    if (previewIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewIndex, goPrev, goNext]);

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Eye
          className="h-10 w-10 text-muted-foreground/40 mb-3"
          variant="stroke"
        />
        <p className="text-sm text-muted-foreground">
          {t(
            "gabinet.patients.photos.empty",
            "Brak zdjęć z wizyt. Zdjęcia przed/po zabiegach pojawią się tutaj.",
          )}
        </p>
      </div>
    );
  }

  const previewEntry =
    previewIndex !== null ? flatPhotos[previewIndex] : undefined;
  const previewUrl = previewEntry
    ? urlMap.get(previewEntry.photo.storageId)
    : undefined;
  const previewTreatment = previewEntry
    ? treatments?.find((tr) => tr._id === previewEntry.group.appointment.treatmentId)?.name
    : undefined;

  return (
    <div className="space-y-4">
      {canCompare && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCompareAppointmentId(null);
              setCompareOpen(true);
            }}
          >
            <ColumnsIcon className="mr-1.5 size-4" />
            {t("gabinet.patients.photos.compare", "Porównaj zdjęcia")}
          </Button>
        </div>
      )}
      {groups.map((group) => {
        const beforePhotos = group.photos.filter((p) => p.type === "before");
        const afterPhotos = group.photos.filter((p) => p.type === "after");
        const canCompareGroup =
          beforePhotos.length > 0 && afterPhotos.length > 0;
        const treatmentName = treatments?.find(
          (tr) => tr._id === group.appointment.treatmentId,
        )?.name;

        return (
          <Card key={group.appointment._id}>
            <CardHeader className="px-6 py-3 border-b">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-sm">
                    {treatmentName ??
                      t("gabinet.patients.photos.noTreatment", "Wizyta")}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {group.appointment.date} · {group.appointment.startTime}–
                    {group.appointment.endTime}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canCompareGroup && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setCompareAppointmentId(group.appointment._id);
                        setCompareOpen(true);
                      }}
                    >
                      <ColumnsIcon className="mr-1.5 size-4" />
                      {t(
                        "gabinet.patients.photos.compareVisit",
                        "Porównaj",
                      )}
                    </Button>
                  )}
                  <Button asChild size="sm" variant="outline">
                    <Link
                      to="/dashboard/gabinet/appointments/$appointmentId"
                      params={{ appointmentId: group.appointment._id }}
                      search={{ tab: "documentation" }}
                    >
                      {t(
                        "gabinet.patients.photos.openAppointment",
                        "Otwórz wizytę",
                      )}
                    </Link>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-6 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <PhotoColumn
                  label={t("gabinet.documentation.before", "Przed")}
                  count={beforePhotos.length}
                  photos={beforePhotos}
                  urlMap={urlMap}
                  flatPhotos={flatPhotos}
                  appointmentId={group.appointment._id}
                  onPreview={setPreviewIndex}
                />
                <PhotoColumn
                  label={t("gabinet.documentation.after", "Po")}
                  count={afterPhotos.length}
                  photos={afterPhotos}
                  urlMap={urlMap}
                  flatPhotos={flatPhotos}
                  appointmentId={group.appointment._id}
                  onPreview={setPreviewIndex}
                />
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Dialog
        open={previewIndex !== null}
        onOpenChange={(o) => !o && closePreview()}
      >
        <DialogContent className="max-w-4xl p-0 overflow-hidden">
          <DialogTitle className="sr-only">
            {t("gabinet.documentation.photoPreview", "Podgląd zdjęcia")}
          </DialogTitle>
          {previewEntry && (
            <div className="relative bg-black">
              <div className="aspect-video w-full flex items-center justify-center">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt=""
                    className="max-h-[70vh] w-auto max-w-full object-contain"
                  />
                ) : (
                  <Loader2
                    size={24}
                    variant="stroke"
                    className="animate-spin text-white/60"
                  />
                )}
              </div>

              {flatPhotos.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={goPrev}
                    aria-label={t("common.previous", "Poprzednie")}
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
                  >
                    <ChevronLeft size={20} variant="stroke" />
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    aria-label={t("common.next", "Następne")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
                  >
                    <ChevronRight size={20} variant="stroke" />
                  </button>
                </>
              )}

              <div className="flex items-center justify-between gap-2 bg-background px-4 py-3 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge
                    variant="outline"
                    className={
                      previewEntry.photo.type === "before"
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    }
                  >
                    {previewEntry.photo.type === "before"
                      ? t("gabinet.documentation.before", "Przed")
                      : t("gabinet.documentation.after", "Po")}
                  </Badge>
                  <span className="truncate text-muted-foreground">
                    {previewTreatment ?? ""}
                    {previewTreatment ? " · " : ""}
                    {previewEntry.group.appointment.date}
                  </span>
                </div>
                {flatPhotos.length > 1 && (
                  <span className="text-muted-foreground tabular-nums">
                    {previewIndex! + 1} / {flatPhotos.length}
                  </span>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ComparisonDialog
        open={compareOpen}
        onOpenChange={(o) => {
          setCompareOpen(o);
          if (!o) setCompareAppointmentId(null);
        }}
        beforeEntries={dialogBeforeEntries}
        afterEntries={dialogAfterEntries}
        urlMap={urlMap}
        treatments={treatments}
      />
    </div>
  );
}

function PhotoColumn({
  label,
  count,
  photos,
  urlMap,
  flatPhotos,
  appointmentId,
  onPreview,
}: {
  label: string;
  count: number;
  photos: AppointmentPhoto[];
  urlMap: Map<string, string | null>;
  flatPhotos: {
    group: AppointmentWithPhotos;
    photo: AppointmentPhoto;
  }[];
  appointmentId: string;
  onPreview: (index: number) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        {label} ({count})
      </p>
      {photos.length === 0 ? (
        <p className="text-xs text-muted-foreground/60">—</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo) => {
            const url = urlMap.get(photo.storageId);
            const flatIndex = flatPhotos.findIndex(
              (f) =>
                f.group.appointment._id === appointmentId &&
                f.photo.storageId === photo.storageId,
            );
            return (
              <button
                key={photo.storageId}
                type="button"
                onClick={() => flatIndex >= 0 && onPreview(flatIndex)}
                className="group bg-muted relative aspect-square overflow-hidden rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Preview photo"
              >
                {url ? (
                  <img
                    src={url}
                    alt=""
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Loader2
                      size={16}
                      variant="stroke"
                      className="animate-spin text-muted-foreground"
                    />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

type CompareEntry = {
  group: AppointmentWithPhotos;
  photo: AppointmentPhoto;
};

function ComparisonDialog({
  open,
  onOpenChange,
  beforeEntries,
  afterEntries,
  urlMap,
  treatments,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  beforeEntries: CompareEntry[];
  afterEntries: CompareEntry[];
  urlMap: Map<string, string | null>;
  treatments: { _id: string; name: string }[] | undefined;
}) {
  const { t } = useTranslation();
  const [beforeIdx, setBeforeIdx] = useState(0);
  const [afterIdx, setAfterIdx] = useState(afterEntries.length - 1);

  useEffect(() => {
    if (!open) return;
    setBeforeIdx(0);
    setAfterIdx(Math.max(0, afterEntries.length - 1));
  }, [open, afterEntries.length]);

  const safeBeforeIdx = Math.min(beforeIdx, Math.max(0, beforeEntries.length - 1));
  const safeAfterIdx = Math.min(afterIdx, Math.max(0, afterEntries.length - 1));
  const beforeEntry = beforeEntries[safeBeforeIdx];
  const afterEntry = afterEntries[safeAfterIdx];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[95dvh] w-[95vw] max-w-[95vw] flex-col gap-3 bg-background p-4 sm:max-w-6xl">
        <DialogTitle className="text-base">
          {t("gabinet.patients.photos.compareTitle", "Porównanie zdjęć przed i po")}
        </DialogTitle>
        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
          <ComparisonPane
            label={t("gabinet.documentation.before", "Przed")}
            colorClass="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
            entries={beforeEntries}
            index={safeBeforeIdx}
            onIndexChange={setBeforeIdx}
            urlMap={urlMap}
            treatments={treatments}
            entry={beforeEntry}
          />
          <ComparisonPane
            label={t("gabinet.documentation.after", "Po")}
            colorClass="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            entries={afterEntries}
            index={safeAfterIdx}
            onIndexChange={setAfterIdx}
            urlMap={urlMap}
            treatments={treatments}
            entry={afterEntry}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ComparisonPane({
  label,
  colorClass,
  entries,
  index,
  onIndexChange,
  urlMap,
  treatments,
  entry,
}: {
  label: string;
  colorClass: string;
  entries: CompareEntry[];
  index: number;
  onIndexChange: (next: number) => void;
  urlMap: Map<string, string | null>;
  treatments: { _id: string; name: string }[] | undefined;
  entry: CompareEntry | undefined;
}) {
  const { t } = useTranslation();
  const url = entry ? urlMap.get(entry.photo.storageId) : undefined;
  const treatmentName = entry
    ? treatments?.find((tr) => tr._id === entry.group.appointment.treatmentId)?.name
    : undefined;
  const showNav = entries.length > 1;

  const goPrev = () => {
    if (entries.length === 0) return;
    onIndexChange((index - 1 + entries.length) % entries.length);
  };
  const goNext = () => {
    if (entries.length === 0) return;
    onIndexChange((index + 1) % entries.length);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Badge variant="outline" className={colorClass}>
          {label}
        </Badge>
        {showNav && (
          <span className="text-muted-foreground tabular-nums text-xs">
            {index + 1} / {entries.length}
          </span>
        )}
      </div>
      <div className="bg-muted relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-md">
        {entry && url ? (
          <img
            src={url}
            alt=""
            className="max-h-[70dvh] w-full object-contain"
          />
        ) : entry ? (
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
        {showNav && (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label={t("common.previous", "Poprzednie")}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
            >
              <ChevronLeft size={20} variant="stroke" />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label={t("common.next", "Następne")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
            >
              <ChevronRight size={20} variant="stroke" />
            </button>
          </>
        )}
      </div>
      <div className="text-xs text-muted-foreground">
        {entry ? (
          <>
            {treatmentName ? (
              <span className="font-medium text-foreground">{treatmentName} · </span>
            ) : null}
            <span>
              {entry.group.appointment.date} · {entry.group.appointment.startTime}
            </span>
          </>
        ) : (
          "—"
        )}
      </div>
    </div>
  );
}
