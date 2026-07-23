import { createSupabaseDb } from "../../_helpers/supabaseDb";

export interface JunctionTreatmentEntry {
  treatmentId: string;
  variantId: string | null;
  priceAtBooking: number | null;
}

/**
 * Batch-load junction rows from gabinet_appointment_treatments for a list of
 * appointmentIds. Returns a Map keyed by appointmentId; each value is an array
 * of treatments ordered by sort_order ascending. Appointments with no junction
 * rows are absent from the Map (callers should default to []).
 */
export async function getJunctionTreatmentIds(
  db: ReturnType<typeof createSupabaseDb>,
  appointmentIds: string[],
): Promise<Map<string, JunctionTreatmentEntry[]>> {
  if (appointmentIds.length === 0) return new Map();
  const { data } = await db
    .raw()
    .from("gabinet_appointment_treatments")
    .select("appointment_id, treatment_id, variant_id, price_at_booking, sort_order")
    .in("appointment_id", appointmentIds);
  const rows = ((data ?? []) as Array<Record<string, unknown>>)
    .filter((r) => r.treatment_id)
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
  const result = new Map<string, JunctionTreatmentEntry[]>();
  for (const row of rows) {
    const aptId = String(row.appointment_id);
    const list = result.get(aptId) ?? [];
    list.push({
      treatmentId: String(row.treatment_id),
      variantId: row.variant_id ? String(row.variant_id) : null,
      priceAtBooking: row.price_at_booking != null ? Number(row.price_at_booking) : null,
    });
    result.set(aptId, list);
  }
  return result;
}
