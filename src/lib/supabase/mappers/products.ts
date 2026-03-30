/**
 * Products Mapper — Supabase ↔ Frontend
 */

import type { ProductRow } from "../database.types";
import { createEntityMapper } from "./generic";

export interface MappedProduct {
  _id: string;
  organizationId: string;
  name: string;
  sku: string;
  unitPrice: number;
  taxRate: number;
  isActive: boolean;
  description?: string;
  tagIds?: string[];
  categoryId?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

const productMapper = createEntityMapper<ProductRow, MappedProduct>({
  exclude: ["search_vector"],
});

export const mapProductFromSupabase = productMapper.mapFromSupabase;
export const mapProductToSupabase = productMapper.mapToSupabase;
