/**
 * Convex → Supabase Patient Write Actions
 *
 * Internal actions that persist gabinet patient data to PostgreSQL via Supabase
 * service-role client (bypasses RLS). Dual-write pattern: Convex mutations
 * write to Convex first, then schedule these actions to replicate to Supabase.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient, upsertWithFkRetry } from "../client";

export const writePatientToSupabase = internalAction({
  args: {
    patientId: v.string(),
    organizationId: v.string(),
    contactId: v.optional(v.string()),
    firstName: v.string(),
    lastName: v.string(),
    pesel: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    gender: v.optional(v.string()),
    email: v.string(),
    phone: v.optional(v.string()),
    address: v.optional(v.any()),
    medicalNotes: v.optional(v.string()),
    allergies: v.optional(v.string()),
    bloodType: v.optional(v.string()),
    emergencyContactName: v.optional(v.string()),
    emergencyContactPhone: v.optional(v.string()),
    referralSource: v.optional(v.string()),
    referredByPatientId: v.optional(v.string()),
    isActive: v.boolean(),
    tags: v.optional(v.array(v.string())),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
    customFields: v.optional(v.any()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.patientId,
      organization_id: args.organizationId,
      contact_id: args.contactId ?? null,
      first_name: args.firstName,
      last_name: args.lastName,
      pesel: args.pesel ?? null,
      date_of_birth: args.dateOfBirth ?? null,
      gender: args.gender ?? null,
      email: args.email,
      phone: args.phone ?? null,
      address: args.address ?? null,
      medical_notes: args.medicalNotes ?? null,
      allergies: args.allergies ?? null,
      blood_type: args.bloodType ?? null,
      emergency_contact_name: args.emergencyContactName ?? null,
      emergency_contact_phone: args.emergencyContactPhone ?? null,
      referral_source: args.referralSource ?? null,
      referred_by_patient_id: args.referredByPatientId ?? null,
      is_active: args.isActive,
      tags: args.tags ?? null,
      tag_ids: args.tagIds ?? null,
      category_id: args.categoryId ?? null,
      custom_fields: args.customFields ?? null,
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const data = await upsertWithFkRetry(client, "gabinet_patients", row);

    console.info(`Patient written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updatePatientInSupabase = internalAction({
  args: {
    patientId: v.string(),
    organizationId: v.string(),
    contactId: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    pesel: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    gender: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.any()),
    medicalNotes: v.optional(v.string()),
    allergies: v.optional(v.string()),
    bloodType: v.optional(v.string()),
    emergencyContactName: v.optional(v.string()),
    emergencyContactPhone: v.optional(v.string()),
    referralSource: v.optional(v.string()),
    referredByPatientId: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
    customFields: v.optional(v.any()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.contactId !== undefined) row.contact_id = args.contactId;
    if (args.firstName !== undefined) row.first_name = args.firstName;
    if (args.lastName !== undefined) row.last_name = args.lastName;
    if (args.pesel !== undefined) row.pesel = args.pesel;
    if (args.dateOfBirth !== undefined) row.date_of_birth = args.dateOfBirth;
    if (args.gender !== undefined) row.gender = args.gender;
    if (args.email !== undefined) row.email = args.email;
    if (args.phone !== undefined) row.phone = args.phone;
    if (args.address !== undefined) row.address = args.address;
    if (args.medicalNotes !== undefined) row.medical_notes = args.medicalNotes;
    if (args.allergies !== undefined) row.allergies = args.allergies;
    if (args.bloodType !== undefined) row.blood_type = args.bloodType;
    if (args.emergencyContactName !== undefined) row.emergency_contact_name = args.emergencyContactName;
    if (args.emergencyContactPhone !== undefined) row.emergency_contact_phone = args.emergencyContactPhone;
    if (args.referralSource !== undefined) row.referral_source = args.referralSource;
    if (args.referredByPatientId !== undefined) row.referred_by_patient_id = args.referredByPatientId;
    if (args.tags !== undefined) row.tags = args.tags;
    if (args.tagIds !== undefined) row.tag_ids = args.tagIds;
    if (args.categoryId !== undefined) row.category_id = args.categoryId;
    if (args.customFields !== undefined) row.custom_fields = args.customFields;

    const { data, error } = await client
      .from("gabinet_patients")
      .update(row)
      .eq("id", args.patientId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for patient ${args.patientId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Patient updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deletePatientFromSupabase = internalAction({
  args: {
    patientId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    // Soft-delete: match Convex behavior (isActive = false)
    const { error } = await client
      .from("gabinet_patients")
      .update({ is_active: false, updated_at: Date.now() })
      .eq("id", args.patientId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for patient ${args.patientId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Patient soft-deleted in Supabase id=${args.patientId} org=${args.organizationId}`);
    return { success: true, id: args.patientId };
  },
});
