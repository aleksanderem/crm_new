/**
 * Activities Mapper — Supabase ↔ Frontend
 *
 * Activities are write-only (created by logActivity helper) but we still
 * need a read mapper for timeline display.
 */

import type { ActivityRow } from "../database.types";
import { createEntityMapper } from "./generic";

type ActivityRowWithUser = ActivityRow & {
  users?: {
    id?: string;
    name?: string | null;
    email?: string | null;
  } | null;
};

export interface MappedActivity {
  _id: string;
  _creationTime: number;
  organizationId: string;
  entityType: string;
  entityId: string;
  action: string;
  description: string;
  metadata?: unknown;
  performedBy: string;
  performedByName?: string;
  createdAt: number;
  _source: "supabase";
}

const activityMapper = createEntityMapper<ActivityRowWithUser, MappedActivity>({
  exclude: ["users"],
});

export function mapActivityFromSupabase(row: ActivityRowWithUser): MappedActivity {
  const mapped = activityMapper.mapFromSupabase(row);
  return {
    ...mapped,
    _creationTime: mapped.createdAt,
    performedByName: row.users?.name ?? row.users?.email ?? undefined,
  };
}

export const mapActivityToSupabase = activityMapper.mapToSupabase;
