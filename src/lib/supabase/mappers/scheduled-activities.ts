/**
 * Scheduled Activities Mapper — Supabase ↔ Frontend
 */

import type { ScheduledActivityRow } from "../database.types";
import { createEntityMapper } from "./generic";

export interface MappedScheduledActivity {
  _id: string;
  _creationTime: number;
  organizationId: string;
  title: string;
  activityType: string;
  dueDate: number;
  endDate?: number;
  isCompleted: boolean;
  completedAt?: number;
  ownerId: string;
  description?: string;
  linkedEntityType?: string;
  linkedEntityId?: string;
  location?: string;
  meetingUrl?: string;
  googleEventId?: string;
  googleCalendarId?: string;
  lastGoogleSyncAt?: number;
  requiresCompletion?: boolean;
  sourceType?: string;
  syncConfigId?: string;
  visibilityOverride?: string;
  moduleRef?: unknown;
  resourceId?: string;
  tagIds?: string[];
  categoryId?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

const scheduledActivityMapper = createEntityMapper<ScheduledActivityRow, MappedScheduledActivity>({});

export const mapScheduledActivityFromSupabase = (
  row: ScheduledActivityRow,
): MappedScheduledActivity => {
  const mapped = scheduledActivityMapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
};
export const mapScheduledActivityToSupabase = scheduledActivityMapper.mapToSupabase;
