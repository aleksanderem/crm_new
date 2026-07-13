export function getExpiryStatus(dateStr: string | null): "expired" | "expiring_soon" | "ok" | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3) return null;
  // Parse as local midnight so the expiry day itself is never flagged as expired
  const expiry = new Date(parts[0], parts[1] - 1, parts[2]);
  if (expiry < today) return "expired";
  const soon = new Date(today);
  soon.setDate(today.getDate() + 30);
  if (expiry <= soon) return "expiring_soon";
  return "ok";
}
