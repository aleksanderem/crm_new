/**
 * Convex → Supabase Employee Write Actions
 *
 * Internal actions that persist gabinet employee data to PostgreSQL via Supabase
 * service-role client (bypasses RLS). Dual-write pattern: Convex mutations
 * write to Convex first, then schedule these actions to replicate to Supabase.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient, upsertWithFkRetry } from "../client";

export const writeEmployeeToSupabase = internalAction({
  args: {
    employeeId: v.string(),
    organizationId: v.string(),
    userId: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    role: v.string(),
    specialization: v.optional(v.string()),
    qualifiedTreatmentIds: v.array(v.string()),
    licenseNumber: v.optional(v.string()),
    hireDate: v.optional(v.string()),
    isActive: v.boolean(),
    color: v.optional(v.string()),
    notes: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    pesel: v.optional(v.string()),
    address: v.optional(v.any()),
    employmentType: v.optional(v.string()),
    endDate: v.optional(v.string()),
    position: v.optional(v.string()),
    department: v.optional(v.string()),
    skills: v.optional(v.array(v.string())),
    yearsOfExperience: v.optional(v.number()),
    certifications: v.optional(v.any()),
    baseSalary: v.optional(v.number()),
    commissionPercent: v.optional(v.number()),
    bankAccount: v.optional(v.string()),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.employeeId,
      organization_id: args.organizationId,
      user_id: args.userId,
      first_name: args.firstName ?? null,
      last_name: args.lastName ?? null,
      role: args.role,
      specialization: args.specialization ?? null,
      qualified_treatment_ids: args.qualifiedTreatmentIds,
      license_number: args.licenseNumber ?? null,
      hire_date: args.hireDate ?? null,
      is_active: args.isActive,
      color: args.color ?? null,
      notes: args.notes ?? null,
      phone: args.phone ?? null,
      email: args.email ?? null,
      date_of_birth: args.dateOfBirth ?? null,
      pesel: args.pesel ?? null,
      address: args.address ?? null,
      employment_type: args.employmentType ?? null,
      end_date: args.endDate ?? null,
      position: args.position ?? null,
      department: args.department ?? null,
      skills: args.skills ?? null,
      years_of_experience: args.yearsOfExperience ?? null,
      certifications: args.certifications ?? null,
      base_salary: args.baseSalary ?? null,
      commission_percent: args.commissionPercent ?? null,
      bank_account: args.bankAccount ?? null,
      tag_ids: args.tagIds ?? null,
      category_id: args.categoryId ?? null,
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const data = await upsertWithFkRetry(client, "gabinet_employees", row);

    console.info(`Employee written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateEmployeeInSupabase = internalAction({
  args: {
    employeeId: v.string(),
    organizationId: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    role: v.optional(v.string()),
    specialization: v.optional(v.string()),
    qualifiedTreatmentIds: v.optional(v.array(v.string())),
    licenseNumber: v.optional(v.string()),
    hireDate: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    color: v.optional(v.string()),
    notes: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    pesel: v.optional(v.string()),
    address: v.optional(v.any()),
    employmentType: v.optional(v.string()),
    endDate: v.optional(v.string()),
    position: v.optional(v.string()),
    department: v.optional(v.string()),
    skills: v.optional(v.array(v.string())),
    yearsOfExperience: v.optional(v.number()),
    certifications: v.optional(v.any()),
    baseSalary: v.optional(v.number()),
    commissionPercent: v.optional(v.number()),
    bankAccount: v.optional(v.string()),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.firstName !== undefined) row.first_name = args.firstName;
    if (args.lastName !== undefined) row.last_name = args.lastName;
    if (args.role !== undefined) row.role = args.role;
    if (args.specialization !== undefined) row.specialization = args.specialization;
    if (args.qualifiedTreatmentIds !== undefined) row.qualified_treatment_ids = args.qualifiedTreatmentIds;
    if (args.licenseNumber !== undefined) row.license_number = args.licenseNumber;
    if (args.hireDate !== undefined) row.hire_date = args.hireDate;
    if (args.isActive !== undefined) row.is_active = args.isActive;
    if (args.color !== undefined) row.color = args.color;
    if (args.notes !== undefined) row.notes = args.notes;
    if (args.phone !== undefined) row.phone = args.phone;
    if (args.email !== undefined) row.email = args.email;
    if (args.dateOfBirth !== undefined) row.date_of_birth = args.dateOfBirth;
    if (args.pesel !== undefined) row.pesel = args.pesel;
    if (args.address !== undefined) row.address = args.address;
    if (args.employmentType !== undefined) row.employment_type = args.employmentType;
    if (args.endDate !== undefined) row.end_date = args.endDate;
    if (args.position !== undefined) row.position = args.position;
    if (args.department !== undefined) row.department = args.department;
    if (args.skills !== undefined) row.skills = args.skills;
    if (args.yearsOfExperience !== undefined) row.years_of_experience = args.yearsOfExperience;
    if (args.certifications !== undefined) row.certifications = args.certifications;
    if (args.baseSalary !== undefined) row.base_salary = args.baseSalary;
    if (args.commissionPercent !== undefined) row.commission_percent = args.commissionPercent;
    if (args.bankAccount !== undefined) row.bank_account = args.bankAccount;
    if (args.tagIds !== undefined) row.tag_ids = args.tagIds;
    if (args.categoryId !== undefined) row.category_id = args.categoryId;

    const { data, error } = await client
      .from("gabinet_employees")
      .update(row)
      .eq("id", args.employeeId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for employee ${args.employeeId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Employee updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deleteEmployeeFromSupabase = internalAction({
  args: {
    employeeId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    // Soft-delete: match Convex behavior (isActive = false)
    const { error } = await client
      .from("gabinet_employees")
      .update({ is_active: false, updated_at: Date.now() })
      .eq("id", args.employeeId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for employee ${args.employeeId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Employee soft-deleted in Supabase id=${args.employeeId} org=${args.organizationId}`);
    return { success: true, id: args.employeeId };
  },
});
