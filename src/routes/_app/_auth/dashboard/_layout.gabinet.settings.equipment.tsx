import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation, useQuery as useConvexQuery } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { SectionHeader } from "@/components/application/section-headers/section-headers";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Id } from "@cvx/_generated/dataModel";
import {
  Plus,
  ChevronDown,
  ChevronRight,
  History,
  ArrowRight,
  MapPin,
} from "@/lib/ez-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/settings/equipment"
)({
  component: EquipmentSettingsPage,
});

type EquipmentStatus = "available" | "in_use" | "maintenance" | "retired";

type EquipmentItem = {
  _id: Id<"gabinetEquipment">;
  name: string;
  description?: string;
  serialNumber?: string;
  currentLocationId?: Id<"gabinetLocations">;
  currentRoomId?: Id<"gabinetRooms">;
  status: EquipmentStatus;
};

type LocationItem = {
  _id: Id<"gabinetLocations">;
  name: string;
};

function StatusBadge({
  status,
  label,
}: {
  status: EquipmentStatus;
  label: string;
}) {
  const colorClass =
    status === "available"
      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
      : status === "in_use"
        ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
        : status === "maintenance"
          ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
          : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${colorClass}`}
    >
      {label}
    </span>
  );
}

function TransferHistoryPanel({
  equipmentId,
  organizationId,
  locations,
}: {
  equipmentId: Id<"gabinetEquipment">;
  organizationId: Id<"organizations">;
  locations: LocationItem[];
}) {
  const { t } = useTranslation();
  const transfers = useConvexQuery(api.gabinet.equipment.listTransfers, {
    organizationId,
    equipmentId,
  });

  const getLocationName = (id?: Id<"gabinetLocations">) => {
    if (!id) return "—";
    return locations.find((l) => l._id === id)?.name ?? id;
  };

  if (!transfers) {
    return (
      <p className="text-xs text-muted-foreground py-1">
        {t("common.loading")}...
      </p>
    );
  }

  if (transfers.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-1">
        {t("gabinet.equipment.transferHistory")} — none
      </p>
    );
  }

  return (
    <div className="rounded-md border divide-y">
      {transfers.map((tr) => (
        <div
          key={tr._id}
          className="flex items-center gap-2 px-3 py-2 text-xs"
        >
          <span className="text-muted-foreground">
            {new Date(tr.transferredAt).toLocaleDateString()}
          </span>
          <span>{getLocationName(tr.fromLocationId)}</span>
          <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" variant="stroke" />
          <span className="font-medium">{getLocationName(tr.toLocationId)}</span>
          {tr.notes && (
            <span className="ml-auto text-muted-foreground truncate max-w-[160px]">
              {tr.notes}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function EquipmentCard({
  item,
  organizationId,
  locations,
}: {
  item: EquipmentItem;
  organizationId: Id<"organizations">;
  locations: LocationItem[];
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [editDescription, setEditDescription] = useState(
    item.description ?? ""
  );
  const [editSerial, setEditSerial] = useState(item.serialNumber ?? "");
  const [editStatus, setEditStatus] = useState<EquipmentStatus>(item.status);
  const [saving, setSaving] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [transferLocationId, setTransferLocationId] = useState<string>("");
  const [transferRoomId, setTransferRoomId] = useState<string>("");
  const [transferNotes, setTransferNotes] = useState("");
  const [transferring, setTransferring] = useState(false);

  const updateEquipment = useMutation(api.gabinet.equipment.updateEquipment);
  const transferEquipment = useMutation(api.gabinet.equipment.transferEquipment);

  const selectedLocationData = useConvexQuery(
    api.gabinet.locations.getLocation,
    transferLocationId
      ? { organizationId, locationId: transferLocationId as Id<"gabinetLocations"> }
      : "skip"
  );

  const currentLocation = locations.find(
    (l) => l._id === item.currentLocationId
  );
  const roomsForTransferLocation = selectedLocationData?.rooms ?? [];

  const statusOptions: { value: EquipmentStatus; label: string }[] = [
    { value: "available", label: t("gabinet.equipment.statuses.available") },
    { value: "in_use", label: t("gabinet.equipment.statuses.in_use") },
    { value: "maintenance", label: t("gabinet.equipment.statuses.maintenance") },
    { value: "retired", label: t("gabinet.equipment.statuses.retired") },
  ];

  const handleSave = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      await updateEquipment({
        organizationId,
        equipmentId: item._id,
        name: editName.trim(),
        description: editDescription.trim() || undefined,
        serialNumber: editSerial.trim() || undefined,
        status: editStatus,
      });
      toast.success(t("common.saved"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  const handleTransfer = async () => {
    if (!transferLocationId) return;
    setTransferring(true);
    try {
      await transferEquipment({
        organizationId,
        equipmentId: item._id,
        toLocationId: transferLocationId as Id<"gabinetLocations">,
        toRoomId: transferRoomId
          ? (transferRoomId as Id<"gabinetRooms">)
          : undefined,
        notes: transferNotes.trim() || undefined,
      });
      toast.success(t("common.saved"));
      setTransferOpen(false);
      setTransferLocationId("");
      setTransferRoomId("");
      setTransferNotes("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setTransferring(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card">
      {/* Card header — always visible */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setExpanded((v) => !v)}
          aria-label="Toggle expand"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" variant="stroke" />
          ) : (
            <ChevronRight className="h-4 w-4" variant="stroke" />
          )}
        </button>

        <span className="flex-1 text-sm font-medium">{item.name}</span>

        {item.serialNumber && (
          <span className="text-xs text-muted-foreground font-mono">
            #{item.serialNumber}
          </span>
        )}

        {currentLocation && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" variant="stroke" />
            {currentLocation.name}
          </span>
        )}

        <StatusBadge
          status={item.status}
          label={
            statusOptions.find((o) => o.value === item.status)?.label ??
            item.status
          }
        />

        <div className="flex items-center gap-1 ml-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => {
              setExpanded(true);
            }}
          >
            {t("common.edit")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={() => setTransferOpen(true)}
          >
            <ArrowRight className="mr-1 h-3 w-3" variant="stroke" />
            {t("gabinet.equipment.transfer")}
          </Button>
        </div>
      </div>

      {/* Expanded edit panel */}
      {expanded && (
        <>
          <Separator />
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor={`eq-name-${item._id}`}>
                  {t("gabinet.equipment.name")}
                </Label>
                <Input
                  id={`eq-name-${item._id}`}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`eq-serial-${item._id}`}>
                  {t("gabinet.equipment.serialNumber")}
                </Label>
                <Input
                  id={`eq-serial-${item._id}`}
                  value={editSerial}
                  onChange={(e) => setEditSerial(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`eq-status-${item._id}`}>
                  {t("gabinet.equipment.status")}
                </Label>
                <Select
                  value={editStatus}
                  onValueChange={(v) => setEditStatus(v as EquipmentStatus)}
                >
                  <SelectTrigger id={`eq-status-${item._id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor={`eq-desc-${item._id}`}>
                  {t("gabinet.equipment.description")}
                </Label>
                <Textarea
                  id={`eq-desc-${item._id}`}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={2}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 text-muted-foreground"
                onClick={() => setHistoryOpen((v) => !v)}
              >
                <History className="h-4 w-4" variant="stroke" />
                {t("gabinet.equipment.transferHistory")}
                {historyOpen ? (
                  <ChevronDown className="h-3 w-3" variant="stroke" />
                ) : (
                  <ChevronRight className="h-3 w-3" variant="stroke" />
                )}
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || !editName.trim()}
              >
                {saving ? t("common.saving") : t("common.save")}
              </Button>
            </div>

            {historyOpen && (
              <TransferHistoryPanel
                equipmentId={item._id}
                organizationId={organizationId}
                locations={locations}
              />
            )}
          </div>
        </>
      )}

      {/* Transfer dialog */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("gabinet.equipment.transferTo")} — {item.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("gabinet.equipment.currentLocation")}</Label>
              <Select
                value={transferLocationId}
                onValueChange={(v) => {
                  setTransferLocationId(v);
                  setTransferRoomId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t("gabinet.equipment.currentLocation")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc._id} value={loc._id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {roomsForTransferLocation.length > 0 && (
              <div className="space-y-1.5">
                <Label>{t("gabinet.locations.room")}</Label>
                <Select
                  value={transferRoomId}
                  onValueChange={setTransferRoomId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("gabinet.locations.selectRoom")} />
                  </SelectTrigger>
                  <SelectContent>
                    {roomsForTransferLocation.map((room) => (
                      <SelectItem key={room._id} value={room._id}>
                        {room.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>{t("gabinet.equipment.notes")}</Label>
              <Textarea
                value={transferNotes}
                onChange={(e) => setTransferNotes(e.target.value)}
                rows={2}
                placeholder={t("gabinet.equipment.notes")}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setTransferOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleTransfer}
                disabled={transferring || !transferLocationId}
              >
                {transferring
                  ? t("common.saving")
                  : t("gabinet.equipment.transfer")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EquipmentSettingsPage() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newSerial, setNewSerial] = useState("");
  const [newStatus, setNewStatus] = useState<EquipmentStatus>("available");
  const [newLocationId, setNewLocationId] = useState<string>("");
  const [creating, setCreating] = useState(false);

  const { data: equipment } = useQuery(
    convexQuery(api.gabinet.equipment.listEquipment, { organizationId })
  );

  const { data: locations } = useQuery(
    convexQuery(api.gabinet.locations.listLocations, { organizationId })
  );

  const createEquipment = useMutation(api.gabinet.equipment.createEquipment);

  const locationList: LocationItem[] = (locations ?? []).map((loc) => ({
    _id: loc._id,
    name: loc.name,
  }));

  const statusOptions: { value: EquipmentStatus; label: string }[] = [
    { value: "available", label: t("gabinet.equipment.statuses.available") },
    { value: "in_use", label: t("gabinet.equipment.statuses.in_use") },
    {
      value: "maintenance",
      label: t("gabinet.equipment.statuses.maintenance"),
    },
    { value: "retired", label: t("gabinet.equipment.statuses.retired") },
  ];

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createEquipment({
        organizationId,
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        serialNumber: newSerial.trim() || undefined,
        status: newStatus,
        currentLocationId: newLocationId
          ? (newLocationId as Id<"gabinetLocations">)
          : undefined,
      });
      toast.success(t("gabinet.equipment.addEquipment"));
      setCreateOpen(false);
      setNewName("");
      setNewDescription("");
      setNewSerial("");
      setNewStatus("available");
      setNewLocationId("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <div className="flex h-full w-full flex-col gap-6">
        <SectionHeader.Root className="pt-4">
          <SectionHeader.Group>
            <SectionHeader.Heading className="flex-1">
              {t("gabinet.equipment.title")}
            </SectionHeader.Heading>
            <SectionHeader.Actions>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" variant="stroke" />
                {t("gabinet.equipment.addEquipment")}
              </Button>
            </SectionHeader.Actions>
          </SectionHeader.Group>
          <Alert>
                  <AlertDescription>{t("gabinet.equipment.description", "Zarządzaj sprzętem i zasobami gabinetu.")}</AlertDescription>
                </Alert>
        </SectionHeader.Root>

        <div className="space-y-3">
          {(equipment ?? []).length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t("gabinet.equipment.noEquipment")}
            </div>
          ) : (
            (equipment ?? []).map((item) => (
              <EquipmentCard
                key={item._id}
                item={item as EquipmentItem}
                organizationId={organizationId}
                locations={locationList}
              />
            ))
          )}
        </div>
      </div>

      {/* Create equipment dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("gabinet.equipment.addEquipment")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("gabinet.equipment.name")}</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("gabinet.equipment.name")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("gabinet.equipment.serialNumber")}</Label>
              <Input
                value={newSerial}
                onChange={(e) => setNewSerial(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("gabinet.equipment.status")}</Label>
              <Select
                value={newStatus}
                onValueChange={(v) => setNewStatus(v as EquipmentStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {locationList.length > 0 && (
              <div className="space-y-1.5">
                <Label>{t("gabinet.equipment.currentLocation")}</Label>
                <Select
                  value={newLocationId}
                  onValueChange={setNewLocationId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {locationList.map((loc) => (
                      <SelectItem key={loc._id} value={loc._id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>{t("gabinet.equipment.description")}</Label>
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
              >
                {creating ? t("common.saving") : t("common.create")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
