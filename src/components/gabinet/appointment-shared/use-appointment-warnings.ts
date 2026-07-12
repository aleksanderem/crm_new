import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { useSupabaseGabinetLeavesList } from "@/hooks/use-supabase-gabinet-leaves";

export interface ShortagePreviewItem {
  productName: string;
  unit: string;
  currentStock: number;
  plannedAfterSave: number;
  deficit: number;
}

/**
 * Returns the approved leave (if any) that overlaps the chosen date for the
 * selected employee. The available-slots backend already excludes leave time,
 * but the UI surfaces this so the user knows why the slot list is short/empty
 * (issue #652). Shared between the calendar appointment-dialog and the
 * SidePanel appointment-form.
 */
export function useEmployeeLeaveOnDate(params: {
  organizationId: Id<"organizations"> | string | null | undefined;
  employeeId: string;
  dateStr: string;
}) {
  const { organizationId, employeeId, dateStr } = params;

  const { data: employeeLeaves } = useSupabaseGabinetLeavesList(
    organizationId ?? "",
    {
      userId: employeeId || undefined,
      status: "approved",
      enabled: !!organizationId && !!employeeId,
    },
  );

  return useMemo(() => {
    if (!dateStr || !employeeLeaves || employeeLeaves.length === 0) return null;
    return (
      employeeLeaves.find(
        (l) => l.startDate <= dateStr && l.endDate >= dateStr,
      ) ?? null
    );
  }, [employeeLeaves, dateStr]);
}

interface TreatmentForEquipment {
  requiredEquipmentIds?: ReadonlyArray<string> | null;
}

/**
 * Returns the equipment-IDs that the selected treatment requires but which the
 * chosen location does not have, and a `blocking` flag the parent can use to
 * disable the submit button. Shared between the calendar appointment-dialog
 * and the SidePanel appointment-form (issue #1504).
 */
export function useMissingEquipment(params: {
  organizationId: Id<"organizations"> | string | null | undefined;
  locationId: string;
  treatment: TreatmentForEquipment | undefined | null;
}) {
  const { organizationId, locationId, treatment } = params;

  const listEquipmentAction = useAction(api.gabinet.equipment.listEquipment);
  const { data: equipmentAtLocation } = useQuery({
    queryKey: ["gabinet.equipment.listEquipment", organizationId, locationId],
    queryFn: () =>
      listEquipmentAction({
        organizationId: organizationId as Id<"organizations">,
        locationId,
      }),
    enabled: !!organizationId && !!locationId,
  });

  const missingEquipmentIds = useMemo(() => {
    if (!locationId || !treatment?.requiredEquipmentIds?.length) return [];
    const atLocationIds = new Set(
      equipmentAtLocation?.map((e: { _id: string }) => e._id) ?? [],
    );
    return (treatment.requiredEquipmentIds as string[]).filter(
      (id) => !atLocationIds.has(id),
    );
  }, [locationId, treatment, equipmentAtLocation]);

  return {
    missingEquipmentIds,
    blocking: missingEquipmentIds.length > 0,
  };
}

/**
 * Checks whether saving an appointment for the given treatment would push any
 * product into planned-usage deficit over the next 7 days (issue #2933).
 * Returns shortage items and a boolean flag — informational only, does not
 * block submission.
 */
export function useAppointmentShortage(params: {
  organizationId: Id<"organizations"> | string | null | undefined;
  treatmentId: string;
  locationId?: string;
}) {
  const { organizationId, treatmentId, locationId } = params;
  const checkShortageAction = useAction(
    api.gabinet.inventory.checkAppointmentShortage,
  );
  const { data } = useQuery({
    queryKey: [
      "gabinet.inventory.checkAppointmentShortage",
      String(organizationId ?? ""),
      treatmentId,
      locationId ?? "",
    ],
    queryFn: () =>
      checkShortageAction({
        organizationId: organizationId as Id<"organizations">,
        treatmentId,
        locationId: locationId || undefined,
      }),
    enabled: !!organizationId && !!treatmentId,
    retry: false,
    staleTime: 30_000,
  });
  const items = (data ?? []) as ShortagePreviewItem[];
  return { shortageItems: items, hasShortage: items.length > 0 };
}
