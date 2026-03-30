/**
 * Activities Mapper — Supabase ↔ Frontend
 *
 * Activities are write-only (created by logActivity helper) but we still
 * need a read mapper for timeline display.
 */

import type { ActivityRow } from "../database.types";
import { createEntityMapper } from "./generic";

export interface MappedActivity {
  _id: string;
  organizationId: string;
  entityType: string;
  entityId: string;
  action: string;
  description: string;
  metadata?: unknown;
  performedBy: string;
  createdAt: number;
  _source: "supabase";
}

const activityMapper = createEntityMapper<ActivityRow, MappedActivity>();

export const mapActivityFromSupabase = activityMapper.mapFromSupabase;
export const mapActivityToSupabase = activityMapper.mapToSupabase;
