/**
 * Team Memberships Mapper — Supabase ↔ Frontend
 */

import type { TeamMembershipRow } from "../database.types";
import { createEntityMapper } from "./generic";

export interface MappedTeamMembership {
  _id: string;
  _creationTime: number;
  userId: string;
  organizationId: string;
  role: string;
  invitedBy?: string;
  joinedAt: number;
  _source: "supabase";
}

const teamMembershipMapper = createEntityMapper<TeamMembershipRow, MappedTeamMembership>({});

export const mapTeamMembershipFromSupabase = (
  row: TeamMembershipRow,
): MappedTeamMembership => {
  const mapped = teamMembershipMapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.joinedAt };
};
export const mapTeamMembershipToSupabase = teamMembershipMapper.mapToSupabase;
