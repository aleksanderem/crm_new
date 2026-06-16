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

  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

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
      {groups.map((group) => {
        const beforePhotos = group.photos.filter((p) => p.type === "before");
        const afterPhotos = group.photos.filter((p) => p.type === "after");
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
