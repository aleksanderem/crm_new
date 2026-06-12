import { useEffect, useMemo, useState } from "react";
import { useAction } from "convex/react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import type { FunctionArgs } from "convex/server";

type MergeFieldOverrides = NonNullable<
  FunctionArgs<typeof api.gabinet.patients.merge>["fieldOverrides"]
>;
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
import { plateJsonToText } from "@/components/plate-text";
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

// Whitelisted fields the user can pick a winning value for. Scalar field keys
// match the patient row directly; `address.*` keys read from the JSON address
// sub-object and are recomposed into a single `address` patch on submit.
const SCALAR_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "pesel",
  "dateOfBirth",
  "gender",
  "allergies",
  "bloodType",
  "emergencyContactName",
  "emergencyContactPhone",
  "medicalNotes",
  "referralSource",
] as const;
type ScalarFieldKey = (typeof SCALAR_FIELDS)[number];
const ADDRESS_SUBFIELDS = ["street", "postalCode", "city"] as const;
type AddressSubKey = (typeof ADDRESS_SUBFIELDS)[number];
type MergeFieldKey = ScalarFieldKey | `address.${AddressSubKey}`;

// Required NOT NULL columns — we never patch these with null even if the user
// somehow lands on an empty source value.
const REQUIRED_FIELDS = new Set<MergeFieldKey>(["firstName", "lastName", "email"]);

// Display order matches the Versum reference UI.
const FIELD_ORDER: ReadonlyArray<{ key: MergeFieldKey; labelKey: string }> = [
  { key: "email", labelKey: "gabinet.patients.merge.field.email" },
  { key: "firstName", labelKey: "gabinet.patients.merge.field.firstName" },
  { key: "lastName", labelKey: "gabinet.patients.merge.field.lastName" },
  { key: "phone", labelKey: "gabinet.patients.merge.field.phone" },
  { key: "gender", labelKey: "gabinet.patients.merge.field.gender" },
  { key: "pesel", labelKey: "gabinet.patients.merge.field.pesel" },
  { key: "dateOfBirth", labelKey: "gabinet.patients.merge.field.dateOfBirth" },
  { key: "address.street", labelKey: "gabinet.patients.merge.field.addressStreet" },
  { key: "address.postalCode", labelKey: "gabinet.patients.merge.field.addressPostalCode" },
  { key: "address.city", labelKey: "gabinet.patients.merge.field.addressCity" },
  { key: "allergies", labelKey: "gabinet.patients.merge.field.allergies" },
  { key: "bloodType", labelKey: "gabinet.patients.merge.field.bloodType" },
  { key: "emergencyContactName", labelKey: "gabinet.patients.merge.field.emergencyContactName" },
  { key: "emergencyContactPhone", labelKey: "gabinet.patients.merge.field.emergencyContactPhone" },
  { key: "medicalNotes", labelKey: "gabinet.patients.merge.field.medicalNotes" },
  { key: "referralSource", labelKey: "gabinet.patients.merge.field.referralSource" },
];

function readAddressSub(p: MappedGabinetPatient, sub: AddressSubKey): string | null {
  const addr = p.address as { street?: string; postalCode?: string; city?: string } | null | undefined;
  if (!addr) return null;
  const v = addr[sub];
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function readFieldRaw(p: MappedGabinetPatient, key: MergeFieldKey): string | null {
  if (key.startsWith("address.")) {
    return readAddressSub(p, key.slice("address.".length) as AddressSubKey);
  }
  const v = p[key as ScalarFieldKey];
  if (v == null) return null;
  // Defensive: schema declares these as strings, but if a row somehow holds a
  // non-string (legacy data, bad migration), skip rather than stringify into
  // garbage like "[object Object]".
  if (typeof v !== "string") return null;
  return v.trim() === "" ? null : v;
}

function displayValue(
  p: MappedGabinetPatient,
  key: MergeFieldKey,
  emptyPlaceholder: string,
): string {
  const raw = readFieldRaw(p, key);
  if (raw === null) return emptyPlaceholder;
  if (key === "phone" || key === "emergencyContactPhone") return formatPhoneNumber(raw);
  // medicalNotes is written by the Plate rich-text editor and stored as a JSON
  // string. Extract plain text so the comparison rows are readable rather than
  // showing raw `[{"type":"p",...}]` payloads.
  if (key === "medicalNotes") {
    const text = plateJsonToText(raw).trim();
    return text === "" ? emptyPlaceholder : text;
  }
  return raw;
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

  // Watchdog: if the merge action's promise never settles (e.g. WebSocket
  // reconnect leaves it hanging, or a state-update flush is dropped), the
  // `finally` in handleMerge never runs and the dialog becomes uncloseable —
  // both the close handler and Cancel button gate on `isMerging`. After the
  // timeout, force-clear the flag so the user can always close the dialog.
  // The action will continue server-side; results show up on the next refresh.
  useEffect(() => {
    if (!isMerging) return;
    const id = window.setTimeout(() => {
      setIsMerging(false);
      toast.warning(
        t("gabinet.patients.merge.timeout", {
          defaultValue:
            "Scalanie trwa dłużej niż zwykle. Możesz zamknąć okno — wynik pojawi się po odświeżeniu listy.",
        }),
      );
    }, 60_000);
    return () => window.clearTimeout(id);
  }, [isMerging, t]);

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

  // Per-field winner picked by the user. Only fields where target/source differ
  // are stored here; the default for those is "target" (i.e. keep the row that
  // survives unchanged).
  const [fieldChoices, setFieldChoices] = useState<Record<string, "target" | "source">>({});

  const comparisonRows = useMemo(() => {
    if (!sourcePatient || !target) return [] as Array<{
      key: MergeFieldKey;
      labelKey: string;
      targetValue: string | null;
      sourceValue: string | null;
      differs: boolean;
    }>;
    return FIELD_ORDER.map(({ key, labelKey }) => {
      const targetValue = readFieldRaw(target, key);
      const sourceValue = readFieldRaw(sourcePatient, key);
      const differs = targetValue !== sourceValue;
      return { key, labelKey, targetValue, sourceValue, differs };
    });
  }, [sourcePatient, target]);

  // Reset choices to "target" whenever the comparison changes (target selected,
  // dialog reopened, etc.). Auto-pick source for rows where target is empty so
  // the merge picks up missing data by default — matches Versum's behaviour.
  useEffect(() => {
    const next: Record<string, "target" | "source"> = {};
    for (const row of comparisonRows) {
      if (!row.differs) continue;
      next[row.key] = row.targetValue === null && row.sourceValue !== null ? "source" : "target";
    }
    setFieldChoices(next);
  }, [comparisonRows]);

  function handleClose() {
    if (isMerging) return;
    setTargetId(null);
    setSearch("");
    setFieldChoices({});
    onOpenChange(false);
  }

  function buildFieldOverrides(): MergeFieldOverrides | undefined {
    if (!sourcePatient || !target) return undefined;
    const scalars: Record<string, unknown> = {};
    let addressTouched = false;
    const nextAddress: Record<string, string> = {
      ...((target.address as { street?: string; city?: string; postalCode?: string } | null | undefined) ?? {}),
    };
    for (const row of comparisonRows) {
      if (!row.differs) continue;
      if (fieldChoices[row.key] !== "source") continue;
      // Never null-out a required column — fall through to the existing target value.
      if (REQUIRED_FIELDS.has(row.key) && row.sourceValue === null) continue;
      if (row.key.startsWith("address.")) {
        const sub = row.key.slice("address.".length) as AddressSubKey;
        if (row.sourceValue === null) {
          delete nextAddress[sub];
        } else {
          nextAddress[sub] = row.sourceValue;
        }
        addressTouched = true;
      } else {
        scalars[row.key] = row.sourceValue;
      }
    }
    if (addressTouched) {
      const hasAnySub = ADDRESS_SUBFIELDS.some((s) => typeof nextAddress[s] === "string" && nextAddress[s] !== "");
      scalars.address = hasAnySub ? nextAddress : null;
    }
    return Object.keys(scalars).length > 0 ? (scalars as MergeFieldOverrides) : undefined;
  }

  async function handleMerge() {
    if (!sourcePatient || !target) return;
    setIsMerging(true);
    try {
      const fieldOverrides = buildFieldOverrides();
      const result = await mergePatients({
        organizationId: organizationId as Id<"organizations">,
        targetPatientId: target._id,
        sourcePatientId: sourcePatient._id,
        ...(fieldOverrides ? { fieldOverrides } : {}),
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
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
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
            <div className="rounded-md border">
              <div className="border-b p-3">
                <div className="text-sm font-semibold">
                  {t("gabinet.patients.merge.fieldsTitle", { defaultValue: "Formularz scalania klientów" })}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("gabinet.patients.merge.fieldsIntro", {
                    defaultValue:
                      "Nie wszystkie dane scalanych klientów są identyczne. Wybierz poniżej, które dane zostaną użyte w wynikowej karcie klienta.",
                  })}
                </p>
              </div>
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full table-fixed text-sm">
                  <thead className="sticky top-0 bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="w-1/3 p-2 text-left font-medium" />
                      <th className="w-1/3 truncate p-2 text-left font-medium">
                        {target.firstName || fullName(target) || "—"}
                      </th>
                      <th className="w-1/3 truncate p-2 text-left font-medium">
                        {sourcePatient.firstName || fullName(sourcePatient) || "—"}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {comparisonRows.map((row) => {
                      const emptyPlaceholder = t("gabinet.patients.merge.emptyValue", { defaultValue: "—" });
                      const targetText = displayValue(target, row.key, emptyPlaceholder);
                      const sourceText = displayValue(sourcePatient, row.key, emptyPlaceholder);
                      const choice = fieldChoices[row.key] ?? "target";
                      const groupName = `merge-${row.key}`;
                      const targetRadioId = `${groupName}-target`;
                      const sourceRadioId = `${groupName}-source`;
                      return (
                        <tr key={row.key} className="align-top">
                          <th
                            scope="row"
                            className="bg-muted/30 p-2 text-left text-xs font-medium text-muted-foreground"
                          >
                            {t(row.labelKey)}
                          </th>
                          {row.differs ? (
                            <>
                              <td className="p-2">
                                <label
                                  htmlFor={targetRadioId}
                                  className="flex cursor-pointer items-start gap-2 break-words font-normal"
                                >
                                  <input
                                    id={targetRadioId}
                                    type="radio"
                                    name={groupName}
                                    value="target"
                                    checked={choice === "target"}
                                    onChange={() =>
                                      setFieldChoices((prev) => ({
                                        ...prev,
                                        [row.key]: "target",
                                      }))
                                    }
                                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
                                  />
                                  <span>{targetText}</span>
                                </label>
                              </td>
                              <td className="p-2">
                                <label
                                  htmlFor={sourceRadioId}
                                  className="flex cursor-pointer items-start gap-2 break-words font-normal"
                                >
                                  <input
                                    id={sourceRadioId}
                                    type="radio"
                                    name={groupName}
                                    value="source"
                                    checked={choice === "source"}
                                    onChange={() =>
                                      setFieldChoices((prev) => ({
                                        ...prev,
                                        [row.key]: "source",
                                      }))
                                    }
                                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
                                  />
                                  <span>{sourceText}</span>
                                </label>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="break-words p-2 text-muted-foreground">{targetText}</td>
                              <td className="break-words p-2 text-muted-foreground">{sourceText}</td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

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
