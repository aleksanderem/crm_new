/**
 * Team Memberships Mapper — Supabase ↔ Frontend
 */

import type { TeamMembershipRow } from "../database.types";
import { createEntityMapper } from "./generic";

export interface MappedTeamMembership {
  _id: string;
  userId: string;
  organizationId: string;
  role: string;
  invitedBy?: string;
  joinedAt: number;
  _source: "supabase";
}

const teamMembershipMapper = createEntityMapper<TeamMembershipRow, MappedTeamMembership>({});

export const mapTeamMembershipFromSupabase = teamMembershipMapper.mapFromSupabase;
export const mapTeamMembershipToSupabase = teamMembershipMapper.mapToSupabase;
