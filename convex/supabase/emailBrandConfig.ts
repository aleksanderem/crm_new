/**
 * Convex → Supabase Email Brand Config Write Actions
 *
 * Internal actions that persist email brand config data to PostgreSQL via Supabase
 * service-role client (bypasses RLS). Dual-write pattern.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "./client";

export const writeEmailBrandConfigToSupabase = internalAction({
  args: {
    configId: v.string(),
    organizationId: v.string(),
    logoStorageId: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    companyName: v.optional(v.string()),
    primaryColor: v.string(),
    backgroundColor: v.string(),
    contentBackgroundColor: v.string(),
    textColor: v.string(),
    secondaryTextColor: v.string(),
    accentColor: v.string(),
    footerText: v.optional(v.string()),
    socialLinks: v.optional(v.any()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedBy: v.string(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.configId,
      organization_id: args.organizationId,
      logo_storage_id: args.logoStorageId ?? null,
      logo_url: args.logoUrl ?? null,
      company_name: args.companyName ?? null,
      primary_color: args.primaryColor,
      background_color: args.backgroundColor,
      content_background_color: args.contentBackgroundColor,
      text_color: args.textColor,
      secondary_text_color: args.secondaryTextColor,
      accent_color: args.accentColor,
      footer_text: args.footerText ?? null,
      social_links: args.socialLinks ?? null,
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_by: args.updatedBy,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("email_brand_config")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for email_brand_config: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase write returned malformed response: missing id");
    }

    console.info(`EmailBrandConfig written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});
