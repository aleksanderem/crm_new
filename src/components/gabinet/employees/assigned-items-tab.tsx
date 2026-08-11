import { useState } from "react";
import type { FunctionArgs } from "convex/server";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import type { MappedGabinetEmployee } from "@/lib/supabase/mappers/gabinet/employees";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Plus, X } from "@/lib/ez-icons";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";

export type AssignedItem = NonNullable<MappedGabinetEmployee["assignedItems"]>[number];

export function AssignedItemsTab({
  employee,
  organizationId,
  onUpdate,
  t,
}: {
  employee: MappedGabinetEmployee;
  organizationId: Id<"organizations">;
  onUpdate: (args: FunctionArgs<typeof api.gabinet.employees.update>) => Promise<void>;
  t: TFunction;
}) {
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [newQuantity, setNewQuantity] = useState("1");
  const [newIssuedDate, setNewIssuedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [newNotes, setNewNotes] = useState("");

  const items = employee.assignedItems ?? [];
  const activeItems = items.filter((it) => !it.returnedDate);
  const returnedItems = items.filter((it) => !!it.returnedDate);

  const persist = async (next: AssignedItem[]) => {
    setSaving(true);
    try {
      await onUpdate({
        organizationId,
        employeeId: employee._id,
        assignedItems: next.length > 0 ? next : null,
      });
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.employees.errors.saveFailed",
          defaultValue: "Nie udało się zapisać zmian pracownika.",
        }),
      );
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const qty = Number(newQuantity);
    const item: AssignedItem = {
      name: newName.trim(),
      quantity: Number.isFinite(qty) && qty > 0 ? qty : undefined,
      issuedDate: newIssuedDate || undefined,
      notes: newNotes.trim() || undefined,
    };
    try {
      await persist([...items, item]);
      setNewName("");
      setNewQuantity("1");
      setNewIssuedDate(new Date().toISOString().split("T")[0]);
      setNewNotes("");
      setAdding(false);
      toast.success(t("common.saved"));
    } catch {
      // toast handled in persist
    }
  };

  const handleMarkReturned = async (index: number) => {
    const next = items.map((it, i) =>
      i === index
        ? { ...it, returnedDate: new Date().toISOString().split("T")[0] }
        : it,
    );
    try {
      await persist(next);
      toast.success(t("common.saved"));
    } catch {
      // toast handled in persist
    }
  };

  const handleUnmarkReturned = async (index: number) => {
    const next = items.map((it, i) =>
      i === index ? { ...it, returnedDate: undefined } : it,
    );
    try {
      await persist(next);
      toast.success(t("common.saved"));
    } catch {
      // toast handled in persist
    }
  };

  const handleRemove = async (index: number) => {
    const next = items.filter((_, i) => i !== index);
    try {
      await persist(next);
      toast.success(t("common.saved"));
    } catch {
      // toast handled in persist
    }
  };

  const renderItemRow = (item: AssignedItem, index: number, isReturned: boolean) => (
    <div
      key={index}
      className="flex flex-wrap items-start gap-3 rounded-md border p-3"
    >
      <Briefcase className="mt-0.5 h-4 w-4 text-muted-foreground" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{item.name}</span>
          {item.quantity && item.quantity > 1 && (
            <Badge variant="secondary" className="text-xs">
              ×{item.quantity}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {item.issuedDate && (
            <span>
              {t("gabinet.employees.assignedItems.issued")}: {item.issuedDate}
            </span>
          )}
          {item.returnedDate && (
            <span>
              {t("gabinet.employees.assignedItems.returned")}: {item.returnedDate}
            </span>
          )}
        </div>
        {item.notes && (
          <p className="text-xs text-muted-foreground">{item.notes}</p>
        )}
      </div>
      <div className="flex items-center gap-1">
        {isReturned ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => handleUnmarkReturned(index)}
            disabled={saving}
          >
            {t("gabinet.employees.assignedItems.markActive")}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => handleMarkReturned(index)}
            disabled={saving}
          >
            {t("gabinet.employees.assignedItems.markReturned")}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-destructive"
          onClick={() => handleRemove(index)}
          disabled={saving}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">
            {t("gabinet.employees.assignedItems.heldTitle")}
            {activeItems.length > 0 && (
              <span className="ml-2 text-sm text-muted-foreground">
                ({activeItems.length})
              </span>
            )}
          </CardTitle>
          {!adding && (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" variant="stroke" />
              {t("gabinet.employees.assignedItems.add")}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {adding && (
            <div className="space-y-3 rounded-md border bg-muted/30 p-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_120px_160px]">
                <div className="space-y-1">
                  <Label className="text-xs">
                    {t("gabinet.employees.assignedItems.itemName")}
                  </Label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={t("gabinet.employees.assignedItems.itemNamePlaceholder")}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">
                    {t("gabinet.employees.assignedItems.quantity")}
                  </Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">
                    {t("gabinet.employees.assignedItems.issuedDate")}
                  </Label>
                  <Input
                    type="date"
                    value={newIssuedDate}
                    onChange={(e) => setNewIssuedDate(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">
                  {t("gabinet.employees.assignedItems.notes")}
                </Label>
                <Input
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder={t("gabinet.employees.assignedItems.notesPlaceholder")}
                  className="h-9"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setAdding(false);
                    setNewName("");
                    setNewQuantity("1");
                    setNewIssuedDate(new Date().toISOString().split("T")[0]);
                    setNewNotes("");
                  }}
                  disabled={saving}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  size="sm"
                  onClick={handleAdd}
                  disabled={!newName.trim() || saving}
                >
                  {t("common.save")}
                </Button>
              </div>
            </div>
          )}
          {activeItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("gabinet.employees.assignedItems.empty")}
            </p>
          ) : (
            <div className="space-y-2">
              {items.map((item, index) =>
                item.returnedDate ? null : renderItemRow(item, index, false),
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {returnedItems.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-muted-foreground">
              {t("gabinet.employees.assignedItems.returnedTitle")}
              <span className="ml-2 text-sm">({returnedItems.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {items.map((item, index) =>
                item.returnedDate ? renderItemRow(item, index, true) : null,
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
