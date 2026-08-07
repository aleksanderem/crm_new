import type { GabinetLoyaltyTier } from "../../schema";

// Tier thresholds based on lifetime earned points:
// bronze: 0–199, silver: 200–499, gold: 500–999, platinum: 1000+
export function calculateLoyaltyTier(lifetimeEarned: number): GabinetLoyaltyTier {
  if (lifetimeEarned >= 1000) return "platinum";
  if (lifetimeEarned >= 500) return "gold";
  if (lifetimeEarned >= 200) return "silver";
  return "bronze";
}
