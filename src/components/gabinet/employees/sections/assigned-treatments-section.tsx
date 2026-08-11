import type { MappedGabinetEmployee } from "@/lib/supabase/mappers/gabinet/employees";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, Pencil, ClipboardList } from "@/lib/ez-icons";
import type { TFunction } from "i18next";

export function AssignedTreatmentsSection({
  employee,
  treatmentMap,
  editing,
  saving,
  treatmentSearchLocal,
  setTreatmentSearchLocal,
  filteredTreatments,
  pendingTreatmentIds,
  setPendingTreatmentIds,
  onStartEdit,
  onCancelEdit,
  onSaveSection,
  t,
}: {
  employee: MappedGabinetEmployee;
  treatmentMap: Map<string, string>;
  editing: string | null;
  saving: boolean;
  treatmentSearchLocal: string;
  setTreatmentSearchLocal: (v: string) => void;
  filteredTreatments: Array<{ _id: string; name: string }>;
  pendingTreatmentIds: string[];
  setPendingTreatmentIds: (ids: string[]) => void;
  onStartEdit: (s: string) => void;
  onCancelEdit: () => void;
  onSaveSection: (s: string) => Promise<void>;
  t: TFunction;
}) {
  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-primary"><ClipboardList className="h-4 w-4" /></span>
              <h4 className="text-base font-semibold">{t("gabinet.employees.detailedData.assignedTreatments")}</h4>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onStartEdit("treatments")}>
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

      <Dialog open={editing === "treatments"} onOpenChange={(open) => { if (!open) onCancelEdit(); }}>
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
            {filteredTreatments.length === 0 ? (
              <p className="py-3 px-3 text-sm text-muted-foreground text-center">
                {t("detail.relationships.noResults")}
              </p>
            ) : (
              filteredTreatments.map((tr) => (
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
            <Button variant="ghost" onClick={onCancelEdit}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => onSaveSection("treatments")} disabled={saving}>
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
