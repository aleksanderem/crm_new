/**
 * Leads Mapper — Supabase ↔ Frontend
 *
 * Maps leads table rows to camelCase frontend objects using the generic
 * createEntityMapper factory. Shape mirrors `Doc<'leads'>` from Convex.
 */

import type { Database } from "../database.types";
import { createEntityMapper } from "./generic";

type LeadRow = Database["public"]["Tables"]["leads"]["Row"];

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape that mirrors `Doc<'leads'>` from Convex (camelCase). */
export interface MappedLead {
  _id: string;
  _creationTime: number;
  organizationId: string;
  title: string;
  value?: number;
  currency?: string;
  status: string;
  priority?: string;
  expectedCloseDate?: number;
  source?: string;
  companyId?: string;
  assignedTo?: string;
  pipelineStageId?: string;
  stageOrder?: number;
  notes?: string;
  tags?: string[];
  tagIds?: string[];
  categoryId?: string;
  wonAt?: number;
  lostAt?: number;
  lostReason?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

// ─── Mapper Instance ──────────────────────────────────────────────────────────

const leadMapper = createEntityMapper<LeadRow, MappedLead>({
  exclude: ["search_vector"],
});

// ─── Exported Functions ───────────────────────────────────────────────────────

export function mapLeadFromSupabase(row: LeadRow): MappedLead {
  const mapped = leadMapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
}

export function mapLeadToSupabase(
  lead: Record<string, unknown>,
): Record<string, unknown> {
  return leadMapper.mapToSupabase(lead);
}
