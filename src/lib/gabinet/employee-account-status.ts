/**
 * Shared helper for computing gabinet employee account status.
 *
 * Used in the employee list, employee detail header, and the account tab so
 * the same logic drives every status badge and every action menu.
 *
 * Priority order (matches issue #4737 spec):
 *   1. isBlocked  → "blocked"
 *   2. isActive   → "active"
 *   3. pending invitation, not yet expired → "invitation_pending"
 *   4. pending invitation, expired         → "invitation_expired"
 *   5. everything else                     → "inactive"
 */

export type EmployeeAccountStatus =
  | "blocked"
  | "active"
  | "invitation_pending"
  | "invitation_expired"
  | "inactive";

export function computeEmployeeAccountStatus(params: {
  isActive: boolean;
  isBlocked?: boolean;
  invitation: { expiresAt: number } | null;
}): EmployeeAccountStatus {
  if (params.isBlocked) return "blocked";
  if (params.isActive) return "active";
  if (params.invitation) {
    return params.invitation.expiresAt <= Date.now()
      ? "invitation_expired"
      : "invitation_pending";
  }
  return "inactive";
}
