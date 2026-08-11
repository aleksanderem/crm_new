/**
 * Shared avatar utilities — single source of truth for avatar fallbacks.
 */

/** Default gradient used when no avatar image is available. */
export const AVATAR_FALLBACK_GRADIENT = "from-lime-400 from-10% via-cyan-300 to-blue-500";

/** Extract initials from a display name (up to 2 characters). */
export function getAvatarInitials(name?: string | null): string {
  if (!name) return "?";
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

/**
 * Generate a deterministic Tailwind gradient class from a name.
 * Returns a gradient string like "from-blue-400 to-pink-500".
 * Falls back to AVATAR_FALLBACK_GRADIENT if no name provided.
 */
export function getAvatarGradient(name?: string | null): string {
  if (!name) return AVATAR_FALLBACK_GRADIENT;
  const trimmed = name.trim();
  if (!trimmed) return AVATAR_FALLBACK_GRADIENT;

  // Simple hash from name
  let hash = 0;
  for (let i = 0; i < trimmed.length; i++) {
    hash = ((hash << 5) - hash + trimmed.charCodeAt(i)) | 0;
  }
  hash = Math.abs(hash);

  const fromColors = ["from-red-400", "from-orange-400", "from-amber-400", "from-lime-400", "from-emerald-400", "from-cyan-400", "from-blue-400", "from-violet-400", "from-purple-400", "from-pink-400"];
  const toColors = ["to-orange-500", "to-amber-500", "to-yellow-500", "to-green-500", "to-teal-500", "to-sky-500", "to-indigo-500", "to-purple-500", "to-fuchsia-500", "to-rose-500"];

  const from = fromColors[hash % fromColors.length];
  const to = toColors[(hash >> 4) % toColors.length];

  return `${from} ${to}`;
}
