/**
 * Recently Viewed Mapper — Supabase ↔ Frontend
 */

import type { RecentlyViewedRow } from "../database.types";
import { createEntityMapper } from "./generic";

export interface MappedRecentlyViewed {
  _id: string;
  organizationId: string;
  userId: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  viewedAt: number;
  _source: "supabase";
}

const recentlyViewedMapper = createEntityMapper<RecentlyViewedRow, MappedRecentlyViewed>({});

export const mapRecentlyViewedFromSupabase = recentlyViewedMapper.mapFromSupabase;
export const mapRecentlyViewedToSupabase = recentlyViewedMapper.mapToSupabase;
