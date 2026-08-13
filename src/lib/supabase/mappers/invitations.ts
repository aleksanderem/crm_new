/**
 * Invitations Mapper — Supabase ↔ Frontend
 */

import type { InvitationRow } from "../database.types";
import { createEntityMapper } from "./generic";

export interface MappedInvitation {
  _id: string;
  _creationTime: number;
  organizationId: string;
  email: string;
  role: string;
  token: string;
  status: string;
  invitedBy: string;
  expiresAt: number;
  acceptedAt?: number;
  createdAt: number;
  updatedAt: number;
  module?: string;
  moduleData?: Record<string, unknown>;
  _source: "supabase";
}

const invitationMapper = createEntityMapper<InvitationRow, MappedInvitation>({});

export const mapInvitationFromSupabase = (
  row: InvitationRow,
): MappedInvitation => {
  const mapped = invitationMapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
};
export const mapInvitationToSupabase = invitationMapper.mapToSupabase;
