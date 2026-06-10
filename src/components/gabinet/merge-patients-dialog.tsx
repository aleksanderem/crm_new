import { useEffect, useMemo, useState } from "react";
import { useAction } from "convex/react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowRight, AlertCircle } from "@/lib/ez-icons";
import type { MappedGabinetPatient } from "@/lib/supabase/mappers/gabinet/patients";
import { formatPhoneNumber } from "@/lib/phone";
import { formatActionError } from "@/lib/format-action-error";
import { cn } from "@/lib/utils";

interface MergePatientsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  sourcePatient: MappedGabinetPatient | null;
  allPatients: MappedGabinetPatient[];
  preselectedTargetId?: string | null;
  onMerged?: () => void;
}

function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizePhone(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function fullName(p: MappedGabinetPatient): string {
  return `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim();
}

export function MergePatientsDialog({
  open,
  onOpenChange,
  organizationId,
  sourcePatient,
  allPatients,
  preselectedTargetId,
  onMerged,
}: MergePatientsDialogProps) {
  const { t } = useTranslation();
  const mergePatients = useAction(api.gabinet.patients.merge);

  const [targetId, setTargetId] = useState<string | null>(preselectedTargetId ?? null);
  const [search, setSearch] = useState("");
  const [isMerging, setIsMerging] = useState(false);

  useEffect(() => {
    if (open) setTargetId(preselectedTargetId ?? null);
  }, [open, preselectedTargetId, sourcePatient?._id]);

  const sourceEmail = normalizeEmail(sourcePatient?.email);
  const sourcePhone = normalizePhone(sourcePatient?.phone);

  const candidates = useMemo(() => {
    if (!sourcePatient) return [] as Array<MappedGabinetPatient & { matchReason: string }>;

    const matches: Array<MappedGabinetPatient & { matchReason: string }> = [];
    const seen = new Set<string>();

    if (preselectedTargetId && preselectedTargetId !== sourcePatient._id) {
      const preselected = allPatients.find((p) => p._id === preselectedTargetId);
      if (preselected) {
        matches.push({
          ...preselected,
          matchReason: t("gabinet.patients.merge.matchSelected", { defaultValue: "Wybrany" }),
        });
        seen.add(preselected._id);
      }
    }

    for (const p of allPatients) {
      if (p._id === sourcePatient._id || seen.has(p._id)) continue;
      const pEmail = normalizeEmail(p.email);
      const pPhone = normalizePhone(p.phone);

      const matchesEmail = sourceEmail && pEmail && pEmail === sourceEmail;
      const matchesPhone = sourcePhone && pPhone && pPhone === sourcePhone;

      if (matchesEmail || matchesPhone) {
        const reasons: string[] = [];
        if (matchesEmail) reasons.push(t("gabinet.patients.merge.matchEmail"));
        if (matchesPhone) reasons.push(t("gabinet.patients.merge.matchPhone"));
        matches.push({ ...p, matchReason: reasons.join(" • ") });
        seen.add(p._id);
      }
    }

    const q = search.trim().toLowerCase();
    if (q) {
      const tokens = q.split(/\s+/).filter(Boolean);
      for (const p of allPatients) {
        if (p._id === sourcePatient._id || seen.has(p._id)) continue;
        const haystack = [p.firstName, p.lastName, p.email, p.phone]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (tokens.every((token) => haystack.includes(token))) {
          matches.push({ ...p, matchReason: t("gabinet.patients.merge.matchSearch") });
          seen.add(p._id);
        }
      }
    }

    return matches.slice(0, 50);
  }, [allPatients, sourcePatient, sourceEmail, sourcePhone, search, t, preselectedTargetId]);

  const target = useMemo(
    () => candidates.find((c) => c._id === targetId) ?? null,
    [candidates, targetId],
  );

  function handleClose() {
    if (isMerging) return;
    setTargetId(null);
    setSearch("");
    onOpenChange(false);
  }

  async function handleMerge() {
    if (!sourcePatient || !target) return;
    setIsMerging(true);
    try {
      const result = await mergePatients({
        organizationId: organizationId as Id<"organizations">,
        targetPatientId: target._id,
        sourcePatientId: sourcePatient._id,
      });
      const moved =
        result.movedAppointments +
        result.movedDocuments +
        result.movedPackageUsage +
        result.movedLoyaltyTransactions +
        result.movedPayments +
        result.movedNotes +
        result.movedActivities +
        result.movedRelationships;
      toast.success(
        t("gabinet.patients.merge.success", {
          defaultValue: "Scalono pacjenta. Przeniesiono {{count}} powiązanych rekordów.",
          count: moved,
        }),
      );
      onMerged?.();
      handleClose();
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.patients.merge.error",
          defaultValue: "Nie udało się scalić pacjentów.",
        }),
      );
    } finally {
      setIsMerging(false);
    }
  }

  if (!sourcePatient) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("gabinet.patients.merge.title", { defaultValue: "Scal klientów" })}</DialogTitle>
          <DialogDescription>
            {t("gabinet.patients.merge.description", {
              defaultValue:
                "Wybierz klienta, do którego mają zostać przeniesione dane. Klient źródłowy zostanie dezaktywowany.",
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("gabinet.patients.merge.sourceLabel", { defaultValue: "Źródło (zostanie dezaktywowane)" })}
            </div>
            <div className="mt-1 font-medium">{fullName(sourcePatient)}</div>
            <div className="text-sm text-muted-foreground">
              {sourcePatient.email || "—"}
              {sourcePatient.phone ? ` • ${formatPhoneNumber(sourcePatient.phone)}` : ""}
            </div>
          </div>

          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("gabinet.patients.merge.searchPlaceholder", {
              defaultValue: "Szukaj klienta po imieniu, e-mailu lub telefonie...",
            })}
          />

          <div className="max-h-64 overflow-y-auto rounded-md border">
            {candidates.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                {sourceEmail || sourcePhone
                  ? t("gabinet.patients.merge.noDuplicates", {
                      defaultValue:
                        "Brak duplikatów po e-mailu lub telefonie. Skorzystaj z wyszukiwarki powyżej, aby wybrać innego klienta.",
                    })
                  : t("gabinet.patients.merge.noContactInfo", {
                      defaultValue:
                        "Klient nie ma e-maila ani telefonu, więc automatyczne dopasowanie nie jest możliwe. Wyszukaj klienta ręcznie.",
                    })}
              </div>
            ) : (
              <ul className="divide-y">
                {candidates.map((c) => {
                  const isSelected = c._id === targetId;
                  return (
                    <li key={c._id}>
                      <button
                        type="button"
                        onClick={() => setTargetId(c._id)}
                        className={cn(
                          "flex w-full items-start justify-between gap-3 p-3 text-left transition-colors hover:bg-muted/50",
                          isSelected && "bg-primary/10 hover:bg-primary/10",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{fullName(c) || "—"}</div>
                          <div className="truncate text-sm text-muted-foreground">
                            {c.email || "—"}
                            {c.phone ? ` • ${formatPhoneNumber(c.phone)}` : ""}
                          </div>
                        </div>
                        <Badge
                          variant={isSelected ? "default" : "outline"}
                          className="shrink-0 text-[10px]"
                        >
                          {c.matchReason}
                        </Badge>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {target && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" variant="stroke" />
                <div>
                  <div className="flex flex-wrap items-center gap-1.5 font-medium">
                    <span>{fullName(sourcePatient) || "—"}</span>
                    <ArrowRight className="h-3.5 w-3.5" variant="stroke" />
                    <span>{fullName(target) || "—"}</span>
                  </div>
                  <p className="mt-1">
                    {t("gabinet.patients.merge.warning", {
                      defaultValue:
                        "Wszystkie wizyty, dokumenty, płatności, punkty lojalnościowe i notatki zostaną przeniesione. Operacja jest nieodwracalna.",
                    })}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isMerging}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleMerge}
            disabled={!target || isMerging}
            variant="destructive"
          >
            {isMerging && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("gabinet.patients.merge.confirm", { defaultValue: "Scal" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
