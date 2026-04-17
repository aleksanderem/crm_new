/**
 * Convex → Supabase Gabinet Portal Sessions Dual-Write Action
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "../client";

export const writePortalSessionToSupabase = internalAction({
  args: {
    portalSessionId: v.string(),
    patientId: v.string(),
    organizationId: v.string(),
    tokenHash: v.string(),
    otpHash: v.optional(v.string()),
    otpExpiresAt: v.optional(v.number()),
    isActive: v.boolean(),
    lastAccessedAt: v.number(),
    createdAt: v.number(),
    expiresAt: v.number(),
    otpSendCount: v.optional(v.number()),
    otpSendWindowStart: v.optional(v.number()),
    verifyFailCount: v.optional(v.number()),
    lockedUntil: v.optional(v.number()),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args) => {
    const client = createServiceRoleClient();

    const row = {
      id: args.portalSessionId,
      patient_id: args.patientId,
      organization_id: args.organizationId,
      token_hash: args.tokenHash,
      otp_hash: args.otpHash ?? null,
      otp_expires_at: args.otpExpiresAt ?? null,
      is_active: args.isActive,
      last_accessed_at: args.lastAccessedAt,
      created_at: args.createdAt,
      expires_at: args.expiresAt,
      otp_send_count: args.otpSendCount ?? null,
      otp_send_window_start: args.otpSendWindowStart ?? null,
      verify_fail_count: args.verifyFailCount ?? null,
      locked_until: args.lockedUntil ?? null,
    };

    const { data, error } = await client
      .from("gabinet_portal_sessions")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for gabinetPortalSession: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`GabinetPortalSession written to Supabase id=${data!.id}`);
    return { success: true, id: data!.id };
  },
});
