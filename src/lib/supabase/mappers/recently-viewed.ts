/**
 * Recently Viewed Mapper — Supabase ↔ Frontend
 */

import type { RecentlyViewedRow } from "../database.types";
import { createEntityMapper } from "./generic";

export interface MappedRecentlyViewed {
  _id: string;
  _creationTime: number;
  organizationId: string;
  userId: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  viewedAt: number;
  _source: "supabase";
}

const recentlyViewedMapper = createEntityMapper<RecentlyViewedRow, MappedRecentlyViewed>({});

export const mapRecentlyViewedFromSupabase = (
  row: RecentlyViewedRow,
): MappedRecentlyViewed => {
  const mapped = recentlyViewedMapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.viewedAt };
};
export const mapRecentlyViewedToSupabase = recentlyViewedMapper.mapToSupabase;
