/**
 * Shared display/price helpers for gabinet appointments.
 *
 * Both the patient card and the appointment preview popover compute treatment
 * names and prices from the junction table — keeping the logic here prevents
 * the two call-sites from drifting apart.
 */

export interface JunctionTreatmentRef {
  treatmentId?: string | null;
  variantId?: string | null;
  priceAtBooking?: number | null;
}

export interface TreatmentCatalogItem {
  _id: string;
  name: string;
  price?: number | null;
}

/**
 * Returns a compact display string for an appointment's treatment(s).
 * Primary treatment name + optional variant, with "+N" suffix for multi-treatment visits.
 */
export function getAppointmentTreatmentDisplay(
  junctionTreatments: JunctionTreatmentRef[],
  treatmentCatalog: TreatmentCatalogItem[] | null | undefined,
  variantNameLookup?: (variantId: string) => string | undefined,
): string | undefined {
  const primary = junctionTreatments[0];
  if (!primary) return undefined;
  const name = primary.treatmentId
    ? treatmentCatalog?.find((tr) => tr._id === primary.treatmentId)?.name
    : undefined;
  if (!name) return undefined;
  const variantName =
    primary.variantId && variantNameLookup
      ? variantNameLookup(primary.variantId)
      : undefined;
  const base = variantName ? `${name} · ${variantName}` : name;
  return junctionTreatments.length > 1
    ? `${base} +${junctionTreatments.length - 1}`
    : base;
}

/**
 * Sums the price across all junction treatment rows.
 * Uses priceAtBooking when available, falls back to the catalog price.
 * If there are no junction rows, returns legacyFallbackPrice (pre-junction appointments).
 */
export function getAppointmentJunctionPrice(
  junctionTreatments: JunctionTreatmentRef[],
  treatmentCatalog: TreatmentCatalogItem[] | null | undefined,
  legacyFallbackPrice?: number | null,
): number {
  if (junctionTreatments.length === 0) {
    return legacyFallbackPrice ?? 0;
  }
  return junctionTreatments.reduce((sum, jt) => {
    const catalogPrice = jt.treatmentId
      ? (treatmentCatalog?.find((tr) => tr._id === jt.treatmentId)?.price ?? 0)
      : 0;
    return sum + (jt.priceAtBooking ?? catalogPrice);
  }, 0);
}
