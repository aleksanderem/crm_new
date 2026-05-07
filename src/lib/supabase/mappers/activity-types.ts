/**
 * Activity Types Mapper — Supabase ↔ Frontend
 *
 * Note: `order` is a reserved word in PostgreSQL so it's quoted as `"order"`
 * in SQL, but the supabase-js client handles this transparently as a column name.
 */

import type { ActivityTypeDefinitionRow } from "../database.types";
import { createEntityMapper } from "./generic";

export interface MappedActivityType {
  _id: string;
  _creationTime: number;
  organizationId: string;
  key: string;
  name: string;
  icon: string;
  color?: string;
  isSystem: boolean;
  order: number;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

const activityTypeMapper = createEntityMapper<ActivityTypeDefinitionRow, MappedActivityType>({});

export const mapActivityTypeFromSupabase = (
  row: ActivityTypeDefinitionRow,
): MappedActivityType => {
  const mapped = activityTypeMapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
};
export const mapActivityTypeToSupabase = activityTypeMapper.mapToSupabase;
