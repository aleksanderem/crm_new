import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import {
  useSupabaseGabinetLocationsList,
  useSupabaseMyGabinetEmployeeLocations,
} from "@/hooks/use-supabase-gabinet-locations";
import type { MappedGabinetLocation } from "@/lib/supabase/mappers/gabinet/locations";

const getLocationStorageKey = (userId: string, orgId: string) =>
  `quera-gabinet-active-location-${userId}-${orgId}`;

export interface GabinetLocationContextType {
  activeLocationId: string | null;
  setActiveLocationId: (id: string | null) => void;
  locations: MappedGabinetLocation[];
  isLoading: boolean;
}

const GabinetLocationContext = createContext<GabinetLocationContextType | null>(null);

export function GabinetLocationProvider({ children }: { children: ReactNode }) {
  const { organizationId } = useOrganization();

  // @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
  const user = useQuery(api.app.getCurrentUser, {});
  const userId = user?._id as string | null | undefined;

  // Location assignments for this user from gabinet_employee_locations (includes isPrimary)
  const { data: myAssignments, isLoading: assignmentsLoading } =
    useSupabaseMyGabinetEmployeeLocations(organizationId as string, userId);

  // Full active location details for the org
  const { data: allLocations, isLoading: locationsLoading } =
    useSupabaseGabinetLocationsList(organizationId as string, { activeOnly: true });

  // Filter to this user's assigned locations.
  // If the user has no employee assignment (e.g. owner without an employee record),
  // fall back to showing all org locations.
  const assignedSet = new Set((myAssignments ?? []).map((a) => a.locationId));
  const locations: MappedGabinetLocation[] =
    assignedSet.size > 0
      ? (allLocations ?? []).filter((loc) => assignedSet.has(loc._id))
      : (allLocations ?? []);

  const [activeLocationId, setActiveLocationIdState] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialized || !userId || !organizationId || locations.length === 0) return;

    const storageKey = getLocationStorageKey(userId, organizationId as string);
    const saved = localStorage.getItem(storageKey);
    const locationIdSet = new Set(locations.map((l) => l._id));

    if (saved && locationIdSet.has(saved)) {
      // Restore previously selected location if it is still accessible
      setActiveLocationIdState(saved);
    } else {
      // Prefer the assignment marked isPrimary; fall back to first available location
      const primary = (myAssignments ?? []).find(
        (a) => a.isPrimary && locationIdSet.has(a.locationId),
      );
      setActiveLocationIdState(primary ? primary.locationId : locations[0]._id);
    }
    setInitialized(true);
  }, [initialized, userId, organizationId, locations, myAssignments]);

  const setActiveLocationId = useCallback(
    (id: string | null) => {
      setActiveLocationIdState(id);
      if (userId && organizationId) {
        const storageKey = getLocationStorageKey(userId, organizationId as string);
        if (id !== null) {
          localStorage.setItem(storageKey, id);
        } else {
          localStorage.removeItem(storageKey);
        }
      }
    },
    [userId, organizationId],
  );

  const isLoading = !user || assignmentsLoading || locationsLoading;

  return (
    <GabinetLocationContext.Provider
      value={{ activeLocationId, setActiveLocationId, locations, isLoading }}
    >
      {children}
    </GabinetLocationContext.Provider>
  );
}

export function useActiveLocation(): GabinetLocationContextType {
  const ctx = useContext(GabinetLocationContext);
  if (!ctx) throw new Error("useActiveLocation must be used within GabinetLocationProvider");
  return ctx;
}
