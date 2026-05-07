/**
 * Companies Mapper — Supabase ↔ Frontend
 */

import type { CompanyRow } from "../database.types";
import { createEntityMapper } from "./generic";

export interface MappedCompany {
  _id: string;
  _creationTime: number;
  organizationId: string;
  name: string;
  domain?: string;
  industry?: string;
  size?: string;
  website?: string;
  phone?: string;
  address?: unknown;
  notes?: string;
  tags?: string[];
  tagIds?: string[];
  categoryId?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

const companyMapper = createEntityMapper<CompanyRow, MappedCompany>({
  exclude: ["search_vector"],
});

export const mapCompanyFromSupabase = (row: CompanyRow): MappedCompany => {
  const mapped = companyMapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
};
export const mapCompanyToSupabase = companyMapper.mapToSupabase;
