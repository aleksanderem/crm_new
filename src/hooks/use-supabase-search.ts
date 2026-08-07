/**
 * Supabase-based global search — replaces convex/search.ts globalSearch.
 *
 * Uses `search_vector @@ websearch_to_tsquery('simple', query)` to hit the
 * GIN indexes on every table. Queries 7 entity types in parallel (Promise.all).
 *
 * Returns the same SearchGroup[] shape as the Convex implementation so
 * the GlobalSearch component works without changes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// ── Row types ─────────────────────────────────────────────────────────────────

type ContactRow = Database["public"]["Tables"]["contacts"]["Row"];
type CompanyRow = Database["public"]["Tables"]["companies"]["Row"];
type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];
type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type GabinetPatientRow = Database["public"]["Tables"]["gabinet_patients"]["Row"];
type GabinetTreatmentRow = Database["public"]["Tables"]["gabinet_treatments"]["Row"];

// ── Types (match convex/search.ts output shape) ──────────────────────────────

interface SearchResultItem {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

export interface SearchGroup {
  type: string;
  results: SearchResultItem[];
}

// ── Global Search Function ────────────────────────────────────────────────────

export async function supabaseGlobalSearch(
  supabase: SupabaseClient<Database>,
  orgId: string,
  query: string,
): Promise<SearchGroup[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const tsOptions = { type: "websearch" as const, config: "simple" };

  const [
    contactsRes,
    companiesRes,
    leadsRes,
    documentsRes,
    productsRes,
    patientsRes,
    treatmentsRes,
  ] = await Promise.all([
    supabase
      .from("contacts")
      .select("*")
      .eq("organization_id", orgId)
      .textSearch("search_vector", trimmed, tsOptions)
      .limit(5),

    supabase
      .from("companies")
      .select("*")
      .eq("organization_id", orgId)
      .textSearch("search_vector", trimmed, tsOptions)
      .limit(5),

    supabase
      .from("leads")
      .select("*")
      .eq("organization_id", orgId)
      .textSearch("search_vector", trimmed, tsOptions)
      .limit(5),

    supabase
      .from("documents")
      .select("*")
      .eq("organization_id", orgId)
      .textSearch("search_vector", trimmed, tsOptions)
      .limit(5),

    supabase
      .from("products")
      .select("*")
      .eq("organization_id", orgId)
      .textSearch("search_vector", trimmed, tsOptions)
      .limit(5),

    supabase
      .from("gabinet_patients")
      .select("*")
      .eq("organization_id", orgId)
      .textSearch("search_vector", trimmed, tsOptions)
      .limit(5),

    supabase
      .from("gabinet_treatments")
      .select("*")
      .eq("organization_id", orgId)
      .textSearch("search_vector", trimmed, tsOptions)
      .limit(5),
  ]);

  const groups: SearchGroup[] = [];

  // Contacts
  const contacts = (contactsRes.data ?? []) as ContactRow[];
  if (contacts.length > 0) {
    groups.push({
      type: "contact",
      results: contacts.map((c) => ({
        id: c.id,
        title: [c.first_name, c.last_name].filter(Boolean).join(" "),
        subtitle: c.email ?? c.title ?? undefined,
        href: `/dashboard/contacts/${c.id}`,
      })),
    });
  }

  // Companies
  const companies = (companiesRes.data ?? []) as CompanyRow[];
  if (companies.length > 0) {
    groups.push({
      type: "company",
      results: companies.map((c) => ({
        id: c.id,
        title: c.name,
        subtitle: c.industry ?? c.domain ?? undefined,
        href: `/dashboard/companies/${c.id}`,
      })),
    });
  }

  // Leads
  const leads = (leadsRes.data ?? []) as LeadRow[];
  if (leads.length > 0) {
    groups.push({
      type: "lead",
      results: leads.map((l) => ({
        id: l.id,
        title: l.title,
        subtitle: l.value
          ? `${l.status} · ${l.value} PLN`
          : l.status,
        href: `/dashboard/leads/${l.id}`,
      })),
    });
  }

  // Documents
  const documents = (documentsRes.data ?? []) as DocumentRow[];
  if (documents.length > 0) {
    groups.push({
      type: "document",
      results: documents.map((d) => ({
        id: d.id,
        title: d.name,
        subtitle: d.status ?? undefined,
        href: `/dashboard/documents`,
      })),
    });
  }

  // Products
  const products = (productsRes.data ?? []) as ProductRow[];
  if (products.length > 0) {
    groups.push({
      type: "product",
      results: products.map((p) => ({
        id: p.id,
        title: p.name,
        subtitle: p.unit_price ? `${p.unit_price} PLN` : undefined,
        href: `/dashboard/products`,
      })),
    });
  }

  // Gabinet Patients
  const patients = (patientsRes.data ?? []) as GabinetPatientRow[];
  if (patients.length > 0) {
    groups.push({
      type: "patient",
      results: patients.map((p) => ({
        id: p.id,
        title: [p.first_name, p.last_name].filter(Boolean).join(" "),
        subtitle: p.email ?? undefined,
        href: `/dashboard/gabinet/patients/${p.id}`,
      })),
    });
  }

  // Gabinet Treatments
  const treatments = (treatmentsRes.data ?? []) as GabinetTreatmentRow[];
  if (treatments.length > 0) {
    groups.push({
      type: "treatment",
      results: treatments.map((t) => ({
        id: t.id,
        title: t.name,
        subtitle: t.price ? `${t.price} PLN` : undefined,
        href: `/dashboard/gabinet/treatments/${t.id}`,
      })),
    });
  }

  return groups;
}
