/**
 * Products Mapper — Supabase ↔ Frontend
 */

import type { ProductRow } from "../database.types";
import { createEntityMapper } from "./generic";

export interface MappedProduct {
  _id: string;
  _creationTime: number;
  organizationId: string;
  name: string;
  sku: string;
  unitPrice: number;
  taxRate?: number;
  taxExempt?: boolean;
  isActive: boolean;
  description?: string;
  tagIds?: string[];
  categoryId?: string;
  trackStock?: boolean;
  stockUnit?: string;
  productSection?: string;
  minStock?: number;
  manufacturer?: string;
  catalogNumber?: string;
  stockNote?: string;
  purchasePrice?: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

const productMapper = createEntityMapper<ProductRow, MappedProduct>({
  exclude: ["search_vector"],
});

export const mapProductFromSupabase = (row: ProductRow): MappedProduct => {
  const mapped = productMapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
};
export const mapProductToSupabase = productMapper.mapToSupabase;
