/**
 * React Query hooks for fetching gabinet equipment and equipment transfers
 * from Supabase (PostgreSQL).
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  mapGabinetEquipmentFromSupabase,
  type MappedGabinetEquipment,
} from "@/lib/supabase/mappers/gabinet/equipment";
import {
  mapGabinetEquipmentTransferFromSupabase,
  type MappedGabinetEquipmentTransfer,
} from "@/lib/supabase/mappers/gabinet/equipment-transfers";

// ---------------------------------------------------------------------------
// Equipment List
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetEquipmentListOptions {
  enabled?: boolean;
  limit?: number;
  status?: string;
  locationId?: string;
  sortOrder?: "asc" | "desc";
}

export function useSupabaseGabinetEquipmentList(
  organizationId: string,
  options: UseSupabaseGabinetEquipmentListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const {
    enabled = true,
    limit = 100,
    status,
    locationId,
    sortOrder = "asc",
  } = options;

  return useQuery<MappedGabinetEquipment[], Error>({
    queryKey: [
      ...supabaseKeys.gabinetEquipment.list(organizationId),
      status ?? "all",
      locationId ?? "all",
    ],
    queryFn: async (): Promise<MappedGabinetEquipment[]> => {
      if (!client) throw new Error("Supabase client not ready");

      let query = client
        .from("gabinet_equipment")
        .select("*")
        .eq("organization_id", organizationId);

      if (status) {
        query = query.eq("status", status);
      }

      if (locationId) {
        query = query.eq("current_location_id", locationId);
      }

      const { data, error } = await query
        .order("name", { ascending: sortOrder === "asc" })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapGabinetEquipmentFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<MappedGabinetEquipment[], Error>);
}

// ---------------------------------------------------------------------------
// Single Equipment
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetEquipmentDetailOptions {
  enabled?: boolean;
}

export function useSupabaseGabinetEquipment(
  organizationId: string,
  equipmentId: string | undefined,
  options: UseSupabaseGabinetEquipmentDetailOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedGabinetEquipment | null, Error>({
    queryKey: supabaseKeys.gabinetEquipment.detail(
      organizationId,
      equipmentId ?? "",
    ),
    queryFn: async (): Promise<MappedGabinetEquipment | null> => {
      if (!client || !equipmentId) return null;

      const { data, error } = await client
        .from("gabinet_equipment")
        .select("*")
        .eq("id", equipmentId)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (error) throw error;
      return data ? mapGabinetEquipmentFromSupabase(data) : null;
    },
    enabled: enabled && isReady && !!organizationId && !!equipmentId,
  } satisfies UseQueryOptions<MappedGabinetEquipment | null, Error>);
}

// ---------------------------------------------------------------------------
// Equipment Transfers (by equipment)
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetEquipmentTransfersListOptions {
  enabled?: boolean;
  limit?: number;
}

export function useSupabaseGabinetEquipmentTransfersList(
  organizationId: string,
  equipmentId: string | undefined,
  options: UseSupabaseGabinetEquipmentTransfersListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, limit = 100 } = options;

  return useQuery<MappedGabinetEquipmentTransfer[], Error>({
    queryKey: [
      ...supabaseKeys.gabinetEquipmentTransfers.list(organizationId),
      equipmentId ?? "",
    ],
    queryFn: async (): Promise<MappedGabinetEquipmentTransfer[]> => {
      if (!client || !equipmentId) return [];

      const { data, error } = await client
        .from("gabinet_equipment_transfers")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("equipment_id", equipmentId)
        .order("transferred_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapGabinetEquipmentTransferFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId && !!equipmentId,
  } satisfies UseQueryOptions<MappedGabinetEquipmentTransfer[], Error>);
}
