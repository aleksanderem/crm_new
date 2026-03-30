/**
 * Convex → Supabase Email Layout Write Actions
 *
 * Internal actions that persist email layout data to PostgreSQL via Supabase
 * service-role client (bypasses RLS). Dual-write pattern.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "./client";

export const writeEmailLayoutToSupabase = internalAction({
  args: {
    layoutId: v.string(),
    organizationId: v.string(),
    headerBlocks: v.string(),
    footerBlocks: v.string(),
    backgroundColor: v.string(),
    contentBackgroundColor: v.string(),
    primaryColor: v.string(),
    logoUrl: v.optional(v.string()),
    companyName: v.optional(v.string()),
    footerText: v.optional(v.string()),
    updatedBy: v.string(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.layoutId,
      organization_id: args.organizationId,
      header_blocks: args.headerBlocks,
      footer_blocks: args.footerBlocks,
      background_color: args.backgroundColor,
      content_background_color: args.contentBackgroundColor,
      primary_color: args.primaryColor,
      logo_url: args.logoUrl ?? null,
      company_name: args.companyName ?? null,
      footer_text: args.footerText ?? null,
      updated_by: args.updatedBy,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("email_layouts")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for email_layout: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase write returned malformed response: missing id");
    }

    console.info(`EmailLayout written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});
