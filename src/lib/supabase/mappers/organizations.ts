/**
 * Organizations Mapper — Supabase ↔ Frontend
 */

import type { OrganizationRow } from "../database.types";
import { createEntityMapper } from "./generic";

export interface MappedOrganization {
  _id: string;
  name: string;
  slug: string;
  ownerId: string;
  logo?: string;
  website?: string;
  createdAt: number;
  updatedAt: number;
  onboardingCompleted?: boolean;
  _source: "supabase";
}

const organizationMapper = createEntityMapper<OrganizationRow, MappedOrganization>({});

export const mapOrganizationFromSupabase = organizationMapper.mapFromSupabase;
export const mapOrganizationToSupabase = organizationMapper.mapToSupabase;
