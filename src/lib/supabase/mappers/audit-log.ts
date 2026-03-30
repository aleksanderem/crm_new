/**
 * Audit Log Mapper — Supabase ↔ Frontend
 */

import type { AuditLogRow } from "../database.types";
import { createEntityMapper } from "./generic";

export interface MappedAuditLogEntry {
  _id: string;
  organizationId: string;
  userId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: string;
  ipAddress?: string;
  createdAt: number;
  _source: "supabase";
}

const auditLogMapper = createEntityMapper<AuditLogRow, MappedAuditLogEntry>({});

export const mapAuditLogFromSupabase = auditLogMapper.mapFromSupabase;
export const mapAuditLogToSupabase = auditLogMapper.mapToSupabase;
