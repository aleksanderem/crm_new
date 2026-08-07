import type { GabinetLoyaltyTier } from "../../schema";

interface TierDef {
  tier: GabinetLoyaltyTier;
  threshold: number;
}

// Tier thresholds based on lifetime earned points:
// bronze: 0–199, silver: 200–499, gold: 500–999, platinum: 1000+
const HARDCODED_DEFAULTS: TierDef[] = [
  { tier: "platinum", threshold: 1000 },
  { tier: "gold", threshold: 500 },
  { tier: "silver", threshold: 200 },
  { tier: "bronze", threshold: 0 },
];

export function calculateLoyaltyTier(
  lifetimeEarned: number,
  customTiers?: TierDef[],
): GabinetLoyaltyTier {
  const sorted = customTiers
    ? [...customTiers].sort((a, b) => b.threshold - a.threshold)
    : HARDCODED_DEFAULTS;
  for (const { tier, threshold } of sorted) {
    if (lifetimeEarned >= threshold) return tier;
  }
  return "bronze";
}
