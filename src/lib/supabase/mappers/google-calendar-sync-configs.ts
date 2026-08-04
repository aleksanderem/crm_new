/**
 * Google Calendar Sync Configs Mapper — Supabase ↔ Frontend
 */

import type { GoogleCalendarSyncConfigRow } from "../database.types";
import { createEntityMapper } from "./generic";

export interface MappedGoogleCalendarSyncConfig {
  _id: string;
  organizationId: string;
  userId: string;
  connectionId: string;
  googleCalendarId: string;
  googleCalendarName: string;
  isOrgDefault: boolean;
  targetModule: "crm" | "gabinet";
  targetActivityType?: string;
  visibility: "full" | "busy_only" | "hidden";
  syncEnabled: boolean;
  lastSyncToken?: string;
  lastSyncAt?: number;
  syncStatus?: "idle" | "syncing" | "error";
  syncError?: string;
  _source: "supabase";
}

const googleCalendarSyncConfigMapper =
  createEntityMapper<GoogleCalendarSyncConfigRow, MappedGoogleCalendarSyncConfig>();

export const mapGoogleCalendarSyncConfigFromSupabase = (
  row: GoogleCalendarSyncConfigRow,
): MappedGoogleCalendarSyncConfig =>
  googleCalendarSyncConfigMapper.mapFromSupabase(row);
