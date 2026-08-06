import { Doc } from "~/convex/_generated/dataModel";
import { PlanKey } from "~/convex/schema";

// isPlatformAdmin is excluded — read it via api.app.getIsPlatformAdmin action
// (Supabase-authoritative post-migration; not spread by getCurrentUser query).
export type User = Omit<Doc<"users">, "isPlatformAdmin"> & {
  avatarUrl?: string;
  subscription?: Doc<"subscriptions"> & {
    planKey: PlanKey;
  };
};
