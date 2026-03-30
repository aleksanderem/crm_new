/**
 * Invitations Mapper — Supabase ↔ Frontend
 */

import type { InvitationRow } from "../database.types";
import { createEntityMapper } from "./generic";

export interface MappedInvitation {
  _id: string;
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
  _source: "supabase";
}

const invitationMapper = createEntityMapper<InvitationRow, MappedInvitation>({});

export const mapInvitationFromSupabase = invitationMapper.mapFromSupabase;
export const mapInvitationToSupabase = invitationMapper.mapToSupabase;
