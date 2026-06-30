import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useSupabaseGabinetLocationsList } from "@/hooks/use-supabase-gabinet-locations";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { SectionHeader } from "@untitled/app/section-headers/section-headers";
import { UntitledAlert } from "@/components/ui/untitled-alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Id } from "@cvx/_generated/dataModel";
import { Plus, Trash2, ChevronDown, ChevronRight, MapPin, Phone } from "@/lib/ez-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";
import { PermissionGate } from "@/hooks/use-permission";
import { GabinetNoAccess } from "@/components/gabinet/no-access";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/settings/locations"
)({
  component: () => <PermissionGate feature="gabinet_settings" action="view" fallback={<GabinetNoAccess />}><LocationsSettingsPage /></PermissionGate>,
});

type LocationWithRooms = {
  _id: Id<"gabinetLocations">;
  name: string;
  address?: {
    street?: string;
    city?: string;
    postalCode?: string;
    country?: string;
  };
  phone?: string;
  email?: string;
  color?: string;
  isActive: boolean;
  rooms: Array<{
    _id: Id<"gabinetRooms">;
    name: string;
    floor?: string;
    isActive: boolean;
  }>;
};

function LocationCard({
  locationId,
  organizationId,
  onDeleted,
}: {
  locationId: Id<"gabinetLocations">;
  organizationId: Id<"organizations">;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [addRoomOpen, setAddRoomOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomFloor, setNewRoomFloor] = useState("");
  const [editName, setEditName] = useState<string | null>(null);
  const [editPhone, setEditPhone] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState<string | null>(null);
  const [editColor, setEditColor] = useState<string | null>(null);
  const [editStreet, setEditStreet] = useState<string | null>(null);
  const [editCity, setEditCity] = useState<string | null>(null);
  const [editPostal, setEditPostal] = useState<string | null>(null);
  const [editCountry, setEditCountry] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addingRoom, setAddingRoom] = useState(false);

  const getLocationAction = useAction(api.gabinet.locations.getLocation);
  const { data: location } = useQuery({
    queryKey: ["gabinet.locations.getLocation", organizationId, locationId],
    queryFn: () =>
      getLocationAction({ organizationId, locationId: locationId as string }),
    enabled: expanded && !!organizationId && !!locationId,
  }) as { data: LocationWithRooms | null | undefined };

  const updateLocation = useAction(api.gabinet.locations.updateLocation);
  const deleteLocation = useAction(api.gabinet.locations.deleteLocation);
  const createRoom = useAction(api.gabinet.locations.createRoom);
  const updateRoom = useAction(api.gabinet.locations.updateRoom);
  const deleteRoom = useAction(api.gabinet.locations.deleteRoom);

  // Summary card always uses the list data (passed via parent), so we need the basic info
  // Use the fetched data when expanded, otherwise use the location prop from parent list
  const displayData = location;

  const handleExpand = () => {
    setExpanded((prev) => {
      if (!prev && displayData) {
        // Initialize edit fields from current data
        setEditName(displayData.name);
        setEditPhone(displayData.phone ?? "");
        setEditEmail(displayData.email ?? "");
        setEditColor(displayData.color ?? "");
        setEditStreet(displayData.address?.street ?? "");
        setEditCity(displayData.address?.city ?? "");
        setEditPostal(displayData.address?.postalCode ?? "");
        setEditCountry(displayData.address?.country ?? "");
      }
      return !prev;
    });
  };

  const initEditFields = (data: LocationWithRooms) => {
    setEditName(data.name);
    setEditPhone(data.phone ?? "");
    setEditEmail(data.email ?? "");
    setEditColor(data.color ?? "");
    setEditStreet(data.address?.street ?? "");
    setEditCity(data.address?.city ?? "");
    setEditPostal(data.address?.postalCode ?? "");
    setEditCountry(data.address?.country ?? "");
  };

  // When location data first loads, initialize edit fields
  if (location && editName === null && expanded) {
    initEditFields(location);
  }

  const handleSave = async () => {
    if (!editName?.trim()) return;
    setSaving(true);
    try {
      await updateLocation({
        organizationId,
        locationId,
        name: editName.trim(),
        phone: editPhone?.trim() || null,
        email: editEmail?.trim() || null,
        color: editColor?.trim() || null,
        address: {
          street: editStreet?.trim() || null,
          city: editCity?.trim() || null,
          postalCode: editPostal?.trim() || null,
          country: editCountry?.trim() || null,
        },
      });
      toast.success(t("common.saved"));
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetLocations.list(organizationId) });
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.locations.errors.saveFailed",
          defaultValue: "Nie udało się zapisać lokalizacji.",
        }),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteLocation({ organizationId, locationId });
      toast.success(t("common.deleted"));
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetLocations.list(organizationId) });
      onDeleted();
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.locations.errors.deleteFailed",
          defaultValue: "Nie udało się usunąć lokalizacji.",
        }),
      );
    }
  };

  const handleAddRoom = async () => {
    if (!newRoomName.trim()) return;
    setAddingRoom(true);
    try {
      await createRoom({
        organizationId,
        locationId,
        name: newRoomName.trim(),
        floor: newRoomFloor.trim() || null,
      });
      toast.success(t("common.saved"));
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetRooms.list(organizationId) });
      setNewRoomFloor("");
      setAddRoomOpen(false);
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.locations.errors.roomCreateFailed",
          defaultValue: "Nie udało się dodać gabinetu.",
        }),
      );
    } finally {
      setAddingRoom(false);
    }
  };

  const handleDeleteRoom = async (roomId: Id<"gabinetRooms">) => {
    try {
      await deleteRoom({ organizationId, roomId });
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.locations.errors.roomDeleteFailed",
          defaultValue: "Nie udało się usunąć gabinetu.",
        }),
      );
    }
  };

  const handleToggleRoom = async (roomId: Id<"gabinetRooms">, isActive: boolean) => {
    try {
      await updateRoom({ organizationId, roomId, isActive: !isActive });
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.locations.errors.roomUpdateFailed",
          defaultValue: "Nie udało się zaktualizować gabinetu.",
        }),
      );
    }
  };

  return (
    <div className="rounded-lg border bg-card">
      {/* Card header — always visible */}
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
        onClick={handleExpand}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" variant="stroke" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" variant="stroke" />
        )}
        {location?.color && (
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: location.color }}
          />
        )}
        <span className="flex-1 text-sm font-medium">
          {location?.name ?? "..."}
        </span>
        {location?.address?.city && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" variant="stroke" />
            {location.address.city}
          </span>
        )}
        {location?.phone && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Phone className="h-3 w-3" variant="stroke" />
            {location.phone}
          </span>
        )}
        {location && (
          <span className="text-xs text-muted-foreground">
            {(location.rooms?.length ?? 0)} {t("gabinet.locations.rooms")}
          </span>
        )}
        {location?.isActive ? (
          <Badge variant="default" className="text-[10px]">
            {t("common.active")}
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]">
            {t("common.inactive")}
          </Badge>
        )}
      </button>

      {/* Expanded edit panel */}
      {expanded && location && (
        <>
          <Separator />
          <div className="p-4 space-y-4">
            {/* Edit form */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor={`loc-name-${locationId}`}>{t("gabinet.locations.name")}</Label>
                <Input
                  id={`loc-name-${locationId}`}
                  value={editName ?? ""}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`loc-phone-${locationId}`}>{t("gabinet.locations.phone")}</Label>
                <Input
                  id={`loc-phone-${locationId}`}
                  value={editPhone ?? ""}
                  onChange={(e) => setEditPhone(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`loc-email-${locationId}`}>{t("gabinet.locations.email")}</Label>
                <Input
                  id={`loc-email-${locationId}`}
                  type="email"
                  value={editEmail ?? ""}
                  onChange={(e) => setEditEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`loc-color-${locationId}`}>{t("settings.pipelines.color")}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={`loc-color-${locationId}`}
                    type="color"
                    value={editColor || "#6366f1"}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="h-9 w-14 cursor-pointer p-1"
                  />
                  <Input
                    value={editColor ?? ""}
                    onChange={(e) => setEditColor(e.target.value)}
                    placeholder="#6366f1"
                    className="flex-1"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("gabinet.locations.address")}</Label>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  placeholder={t("gabinet.locations.street")}
                  value={editStreet ?? ""}
                  onChange={(e) => setEditStreet(e.target.value)}
                />
                <Input
                  placeholder={t("gabinet.locations.city")}
                  value={editCity ?? ""}
                  onChange={(e) => setEditCity(e.target.value)}
                />
                <Input
                  placeholder={t("gabinet.locations.postalCode")}
                  value={editPostal ?? ""}
                  onChange={(e) => setEditPostal(e.target.value)}
                />
                <Input
                  placeholder={t("gabinet.locations.country")}
                  value={editCountry ?? ""}
                  onChange={(e) => setEditCountry(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" variant="stroke" />
                {t("common.delete")}
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !editName?.trim()}>
                {saving ? t("common.saving") : t("common.save")}
              </Button>
            </div>

            <Separator />

            {/* Rooms section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">{t("gabinet.locations.rooms")}</h4>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAddRoomOpen(true)}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" variant="stroke" />
                  {t("gabinet.locations.addRoom")}
                </Button>
              </div>

              {location.rooms.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">{t("gabinet.locations.noRooms")}</p>
              ) : (
                <div className="rounded-md border divide-y">
                  {location.rooms.map((room) => (
                    <div key={room._id} className="flex items-center gap-3 px-3 py-2">
                      <span className="flex-1 text-sm">{room.name}</span>
                      {room.floor && (
                        <span className="text-xs text-muted-foreground">
                          {t("gabinet.locations.floor")}: {room.floor}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleToggleRoom(room._id, room.isActive)}
                        className="text-xs"
                      >
                        {room.isActive ? (
                          <Badge variant="default" className="text-[10px] cursor-pointer">
                            {t("common.active")}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] cursor-pointer">
                            {t("common.inactive")}
                          </Badge>
                        )}
                      </button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteRoom(room._id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" variant="stroke" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Delete location confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("gabinet.locations.deleteConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add room dialog */}
      <Dialog open={addRoomOpen} onOpenChange={setAddRoomOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("gabinet.locations.addRoom")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("gabinet.locations.roomName")}</Label>
              <Input
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder={t("gabinet.locations.roomName")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("gabinet.locations.floor")}</Label>
              <Input
                value={newRoomFloor}
                onChange={(e) => setNewRoomFloor(e.target.value)}
                placeholder="1"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAddRoomOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleAddRoom}
                disabled={addingRoom || !newRoomName.trim()}
              >
                {addingRoom ? t("common.saving") : t("common.add")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LocationsSettingsPage() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newCity, setNewCity] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const { data: locations } = useSupabaseGabinetLocationsList(organizationId);

  const createLocation = useAction(api.gabinet.locations.createLocation);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createLocation({
        organizationId,
        name: newName.trim(),
        phone: newPhone.trim() || null,
        email: newEmail.trim() || null,
        address: newCity.trim() ? { city: newCity.trim() } : null,
      });
      toast.success(t("gabinet.locations.addLocation"));
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetLocations.list(organizationId) });
      setCreateOpen(false);
      setNewName("");
      setNewPhone("");
      setNewEmail("");
      setNewCity("");
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.locations.errors.createFailed",
          defaultValue: "Nie udało się dodać lokalizacji.",
        }),
      );
    } finally {
      setCreating(false);
    }
  };

  const visibleLocations = (locations ?? []).filter(
    (loc) => !deletedIds.has(loc._id)
  );

  return (
    <>
      <div className="flex h-full w-full flex-col gap-6">
        <SectionHeader.Root className="pt-4">
          <SectionHeader.Group>
            <SectionHeader.Heading className="flex-1">
              {t("gabinet.locations.title")}
            </SectionHeader.Heading>
            <SectionHeader.Actions>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" variant="stroke" />
                {t("gabinet.locations.addLocation")}
              </Button>
            </SectionHeader.Actions>
          </SectionHeader.Group>
          <UntitledAlert>{t("gabinet.locations.description", "Zarządzaj lokalizacjami gabinetu.")}</UntitledAlert>
        </SectionHeader.Root>

        <div className="space-y-3">
          {visibleLocations.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t("gabinet.locations.noLocations")}
            </div>
          ) : (
            visibleLocations.map((loc) => (
              <LocationCard
                key={loc._id}
                locationId={loc._id as Id<"gabinetLocations">}
                organizationId={organizationId}
                onDeleted={() =>
                  setDeletedIds((prev) => new Set([...prev, loc._id]))
                }
              />
            ))
          )}
        </div>
      </div>

      {/* Create location dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("gabinet.locations.addLocation")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("gabinet.locations.name")}</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("gabinet.locations.name")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("gabinet.locations.phone")}</Label>
              <Input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("gabinet.locations.email")}</Label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("gabinet.locations.city")}</Label>
              <Input
                value={newCity}
                onChange={(e) => setNewCity(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
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
