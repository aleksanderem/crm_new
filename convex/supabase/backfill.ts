import { v } from "convex/values";
import { internalAction, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { Database } from "~/src/lib/supabase/database.types";
import { createServiceRoleClient } from "./client";

const BATCH_SIZE = 50;

type SupabaseTable = keyof Database["public"]["Tables"];
type SupabaseInsert<T extends SupabaseTable> =
  Database["public"]["Tables"][T]["Insert"];

async function upsertBatch<T extends SupabaseTable>(
  table: T,
  rows: SupabaseInsert<T>[],
): Promise<{ synced: number; errors: string[] }> {
  if (rows.length === 0) return { synced: 0, errors: [] };
  const client = createServiceRoleClient();
  const errors: string[] = [];
  let synced = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await client
      .from(table)
      .upsert(batch, { onConflict: "id" });
    if (error) {
      errors.push(`Batch ${i}-${i + batch.length}: ${error.message}`);
    } else {
      synced += batch.length;
    }
  }

  return { synced, errors };
}

// ---------------------------------------------------------------------------
// Internal queries — single record (for self-healing FK deps)
// ---------------------------------------------------------------------------

export const _getOrganization = internalQuery({
  args: { organizationId: v.string() },
  handler: async (ctx, args) => {
    try {
      return await ctx.db.get(args.organizationId as Id<"organizations">);
    } catch {
      const all = await ctx.db.query("organizations").collect();
      return all.find((o) => o._id === args.organizationId) ?? null;
    }
  },
});

export const _getUser = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    try {
      return await ctx.db.get(args.userId as Id<"users">);
    } catch {
      const all = await ctx.db.query("users").collect();
      return all.find((u) => u._id === args.userId) ?? null;
    }
  },
});

export const _getPatient = internalQuery({
  args: { patientId: v.string() },
  handler: async (ctx, args) => {
    try {
      return await ctx.db.get(args.patientId as Id<"gabinetPatients">);
    } catch {
      const all = await ctx.db.query("gabinetPatients").collect();
      return all.find((p) => p._id === args.patientId) ?? null;
    }
  },
});

export const _getTreatment = internalQuery({
  args: { treatmentId: v.string() },
  handler: async (ctx, args) => {
    try {
      return await ctx.db.get(args.treatmentId as Id<"gabinetTreatments">);
    } catch {
      const all = await ctx.db.query("gabinetTreatments").collect();
      return all.find((t) => t._id === args.treatmentId) ?? null;
    }
  },
});

// ---------------------------------------------------------------------------
// Single-record backfill actions (called by self-healing in write actions)
// ---------------------------------------------------------------------------

export const backfillSinglePatient = internalAction({
  args: { patientId: v.string() },
  handler: async (ctx, args): Promise<{ synced: number; errors: string[] }> => {
    const p = await ctx.runQuery(internal.supabase.backfill._getPatient, {
      patientId: args.patientId,
    });
    if (!p) return { synced: 0, errors: ["Patient not found in Convex"] };

    const client = createServiceRoleClient();

    const orgIdStr = String(p.organizationId);
    const { data: existingOrg } = await client
      .from("organizations")
      .select("id")
      .eq("id", orgIdStr)
      .maybeSingle();
    if (!existingOrg) {
      const org = await ctx.runQuery(internal.supabase.backfill._getOrganization, {
        organizationId: orgIdStr,
      });
      if (org) {
        await client.from("organizations").upsert(
          {
            id: orgIdStr,
            name: org.name,
            slug: org.slug,
            owner_id: String(org.ownerId),
            logo: org.logo ?? null,
            website: org.website ?? null,
            created_at: org.createdAt ?? Date.now(),
            updated_at: org.updatedAt ?? Date.now(),
          },
          { onConflict: "id" },
        );
      }
    }

    const createdByExists = await client
      .from("users")
      .select("id")
      .eq("id", String(p.createdBy))
      .maybeSingle();
    if (!createdByExists.data) {
      const user = await ctx.runQuery(internal.supabase.backfill._getUser, {
        userId: String(p.createdBy),
      });
      if (user) {
        await client.from("users").upsert(
          {
            id: user._id,
            name: user.name ?? null,
            username: user.username ?? null,
            image_storage_id: user.imageId ?? null,
            image: user.image ?? null,
            email: user.email ?? null,
            email_verification_time: user.emailVerificationTime ?? null,
            phone: user.phone ?? null,
            phone_verification_time: user.phoneVerificationTime ?? null,
            is_anonymous: user.isAnonymous ?? false,
            customer_id: user.customerId ?? null,
            language: user.language ?? null,
            theme: user.theme ?? null,
            timezone: user.timezone ?? null,
            created_at: Math.floor(user._creationTime),
            updated_at: Math.floor(user._creationTime),
          },
          { onConflict: "id" },
        );
      }
    }

    const { error } = await client.from("gabinet_patients").upsert(
      {
        id: p._id,
        organization_id: p.organizationId,
        contact_id: p.contactId ?? null,
        first_name: p.firstName,
        last_name: p.lastName,
        pesel: p.pesel ?? null,
        date_of_birth: p.dateOfBirth ?? null,
        gender: p.gender ?? null,
        email: p.email,
        phone: p.phone ?? null,
        address: p.address ?? null,
        medical_notes: p.medicalNotes ?? null,
        allergies: p.allergies ?? null,
        blood_type: p.bloodType ?? null,
        emergency_contact_name: p.emergencyContactName ?? null,
        emergency_contact_phone: p.emergencyContactPhone ?? null,
        referral_source: p.referralSource ?? null,
        referred_by_patient_id: p.referredByPatientId
          ? String(p.referredByPatientId)
          : null,
        is_active: p.isActive ?? true,
        tags: p.tags ?? null,
        tag_ids: p.tagIds?.map(String) ?? null,
        category_id: p.categoryId ? String(p.categoryId) : null,
        custom_fields: p.customFields ?? null,
        created_by: String(p.createdBy),
        created_at: p.createdAt,
        updated_at: p.updatedAt,
      },
      { onConflict: "id" },
    );

    if (error) return { synced: 0, errors: [error.message] };
    return { synced: 1, errors: [] };
  },
});

export const backfillSingleTreatment = internalAction({
  args: { treatmentId: v.string() },
  handler: async (ctx, args): Promise<{ synced: number; errors: string[] }> => {
    const t = await ctx.runQuery(internal.supabase.backfill._getTreatment, {
      treatmentId: args.treatmentId,
    });
    if (!t) return { synced: 0, errors: ["Treatment not found in Convex"] };

    const client = createServiceRoleClient();

    const orgIdStr = String(t.organizationId);
    const { data: existingOrg } = await client
      .from("organizations")
      .select("id")
      .eq("id", orgIdStr)
      .maybeSingle();
    if (!existingOrg) {
      const org = await ctx.runQuery(internal.supabase.backfill._getOrganization, {
        organizationId: orgIdStr,
      });
      if (org) {
        await client.from("organizations").upsert(
          {
            id: orgIdStr,
            name: org.name,
            slug: org.slug,
            owner_id: String(org.ownerId),
            logo: org.logo ?? null,
            website: org.website ?? null,
            created_at: org.createdAt ?? Date.now(),
            updated_at: org.updatedAt ?? Date.now(),
          },
          { onConflict: "id" },
        );
      }
    }

    const createdByExists = await client
      .from("users")
      .select("id")
      .eq("id", String(t.createdBy))
      .maybeSingle();
    if (!createdByExists.data) {
      const user = await ctx.runQuery(internal.supabase.backfill._getUser, {
        userId: String(t.createdBy),
      });
      if (user) {
        await client.from("users").upsert(
          {
            id: user._id,
            name: user.name ?? null,
            username: user.username ?? null,
            image_storage_id: user.imageId ?? null,
            image: user.image ?? null,
            email: user.email ?? null,
            email_verification_time: user.emailVerificationTime ?? null,
            phone: user.phone ?? null,
            phone_verification_time: user.phoneVerificationTime ?? null,
            is_anonymous: user.isAnonymous ?? false,
            customer_id: user.customerId ?? null,
            language: user.language ?? null,
            theme: user.theme ?? null,
            timezone: user.timezone ?? null,
            created_at: Math.floor(user._creationTime),
            updated_at: Math.floor(user._creationTime),
          },
          { onConflict: "id" },
        );
      }
    }

    const { error } = await client.from("gabinet_treatments").upsert(
      {
        id: t._id,
        organization_id: t.organizationId,
        name: t.name,
        description: t.description ?? null,
        category: t.category ?? null,
        duration: t.duration,
        price: t.price,
        currency: t.currency ?? null,
        tax_rate: t.taxExempt ? null : t.taxRate === -1 ? null : t.taxRate ?? null,
        tax_exempt: t.taxExempt ?? (t.taxRate === -1 ? true : null),
        required_equipment: t.requiredEquipment ?? null,
        required_equipment_ids: t.requiredEquipmentIds?.map(String) ?? null,
        contraindications: t.contraindications ?? null,
        preparation_instructions: t.preparationInstructions ?? null,
        aftercare_instructions: t.aftercareInstructions ?? null,
        is_active: t.isActive ?? true,
        requires_approval: t.requiresApproval ?? null,
        color: t.color ?? null,
        sort_order: t.sortOrder ?? null,
        treatment_count: t.treatmentCount ?? null,
        parameters: t.parameters ?? null,
        required_document_template_ids: null,
        required_form_templates: t.requiredFormTemplates ?? null,
        short_description: t.shortDescription ?? null,
        image: t.image ?? null,
        tag_ids: t.tagIds?.map(String) ?? null,
        category_id: t.categoryId ? String(t.categoryId) : null,
        created_by: String(t.createdBy),
        created_at: t.createdAt,
        updated_at: t.updatedAt,
      },
      { onConflict: "id" },
    );

    if (error) return { synced: 0, errors: [error.message] };
    return { synced: 1, errors: [] };
  },
});

// ---------------------------------------------------------------------------
// Internal queries (no auth, read all records by org)
// ---------------------------------------------------------------------------

export const _listUsers = internalQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("users").collect();
  },
});

export const _listPatients = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("gabinetPatients")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
  },
});

export const _listAppointments = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("gabinetAppointments")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
  },
});

export const _listTreatments = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("gabinetTreatments")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
  },
});

export const _listEmployees = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("gabinetEmployees")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
  },
});

export const _listInvitations = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("invitations")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
  },
});

// ---------------------------------------------------------------------------
// Backfill actions
// ---------------------------------------------------------------------------

export const backfillPatients = internalAction({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<{ synced: number; errors: string[] }> => {
    const patients = await ctx.runQuery(
      internal.supabase.backfill._listPatients,
      { organizationId: args.organizationId },
    );

    const rows = patients.map((p) => ({
      id: p._id,
      organization_id: p.organizationId,
      contact_id: p.contactId ?? null,
      first_name: p.firstName,
      last_name: p.lastName,
      pesel: p.pesel ?? null,
      date_of_birth: p.dateOfBirth ?? null,
      gender: p.gender ?? null,
      email: p.email,
      phone: p.phone ?? null,
      address: p.address ?? null,
      medical_notes: p.medicalNotes ?? null,
      allergies: p.allergies ?? null,
      blood_type: p.bloodType ?? null,
      emergency_contact_name: p.emergencyContactName ?? null,
      emergency_contact_phone: p.emergencyContactPhone ?? null,
      referral_source: p.referralSource ?? null,
      referred_by_patient_id: p.referredByPatientId
        ? String(p.referredByPatientId)
        : null,
      is_active: p.isActive ?? true,
      tags: p.tags ?? null,
      tag_ids: p.tagIds?.map(String) ?? null,
      category_id: p.categoryId ? String(p.categoryId) : null,
      custom_fields: p.customFields ?? null,
      created_by: String(p.createdBy),
      created_at: p.createdAt,
      updated_at: p.updatedAt,
    }));

    const result = await upsertBatch("gabinet_patients", rows);
    console.info(`Backfill patients: ${result.synced}/${rows.length} synced`);
    if (result.errors.length > 0) console.error("Errors:", result.errors);
    return result;
  },
});

export const backfillAppointments = internalAction({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<{ synced: number; errors: string[] }> => {
    const appointments = await ctx.runQuery(
      internal.supabase.backfill._listAppointments,
      { organizationId: args.organizationId },
    );

    const rows = appointments.map((a) => ({
      id: a._id,
      organization_id: a.organizationId,
      patient_id: String(a.patientId),
      employee_id: String(a.employeeId),
      date: a.date,
      start_time: a.startTime,
      end_time: a.endTime,
      status: a.status,
      notes: a.notes ?? null,
      internal_notes: a.internalNotes ?? null,
      body_chart_data: a.bodyChartData ?? null,
      treatment_parameter_values: a.treatmentParameterValues ?? null,
      interview_notes: a.interviewNotes ?? null,
      clinical_remarks: a.clinicalRemarks ?? null,
      photos: a.photos ?? null,
      color: a.color ?? null,
      is_recurring: a.isRecurring ?? false,
      recurring_rule: a.recurringRule ?? null,
      recurring_group_id: a.recurringGroupId ?? null,
      recurring_index: a.recurringIndex ?? null,
      prepayment_required: a.prepaymentRequired ?? null,
      prepayment_amount: a.prepaymentAmount ?? null,
      prepayment_status: a.prepaymentStatus ?? null,
      prepayment_paid_at: a.prepaymentPaidAt ?? null,
      package_usage_id: a.packageUsageId ? String(a.packageUsageId) : null,
      scheduled_activity_id: null,
      reminder_sent_at: a.reminderSentAt ?? null,
      send_reminder: a.sendReminder ?? null,
      cancelled_at: a.cancelledAt ?? null,
      cancelled_by: a.cancelledBy ? String(a.cancelledBy) : null,
      cancellation_reason: a.cancellationReason ?? null,
      booked_from_portal: a.bookedFromPortal ?? null,
      booked_by_patient_id: a.bookedByPatientId
        ? String(a.bookedByPatientId)
        : null,
      location_id: a.locationId ? String(a.locationId) : null,
      room_id: a.roomId ? String(a.roomId) : null,
      tag_ids: a.tagIds?.map(String) ?? null,
      category_id: a.categoryId ? String(a.categoryId) : null,
      requires_completion: a.requiresCompletion ?? null,
      created_by: String(a.createdBy),
      created_at: a.createdAt,
      updated_at: a.updatedAt,
    }));

    const result = await upsertBatch("gabinet_appointments", rows);
    console.info(
      `Backfill appointments: ${result.synced}/${rows.length} synced`,
    );
    if (result.errors.length > 0) console.error("Errors:", result.errors);
    return result;
  },
});

export const backfillTreatments = internalAction({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<{ synced: number; errors: string[] }> => {
    const treatments = await ctx.runQuery(
      internal.supabase.backfill._listTreatments,
      { organizationId: args.organizationId },
    );

    const rows = treatments.map((t) => ({
      id: t._id,
      organization_id: t.organizationId,
      name: t.name,
      description: t.description ?? null,
      category: t.category ?? null,
      duration: t.duration,
      price: t.price,
      currency: t.currency ?? null,
      tax_rate: t.taxExempt ? null : t.taxRate === -1 ? null : t.taxRate ?? null,
      tax_exempt: t.taxExempt ?? (t.taxRate === -1 ? true : null),
      required_equipment: t.requiredEquipment ?? null,
      required_equipment_ids: t.requiredEquipmentIds?.map(String) ?? null,
      contraindications: t.contraindications ?? null,
      preparation_instructions: t.preparationInstructions ?? null,
      aftercare_instructions: t.aftercareInstructions ?? null,
      is_active: t.isActive ?? true,
      requires_approval: t.requiresApproval ?? null,
      color: t.color ?? null,
      sort_order: t.sortOrder ?? null,
      treatment_count: t.treatmentCount ?? null,
      parameters: t.parameters ?? null,
      required_document_template_ids: null,
      required_form_templates: t.requiredFormTemplates ?? null,
      short_description: t.shortDescription ?? null,
      image: t.image ?? null,
      tag_ids: t.tagIds?.map(String) ?? null,
      category_id: t.categoryId ? String(t.categoryId) : null,
      created_by: String(t.createdBy),
      created_at: t.createdAt,
      updated_at: t.updatedAt,
    }));

    const result = await upsertBatch("gabinet_treatments", rows);
    console.info(
      `Backfill treatments: ${result.synced}/${rows.length} synced`,
    );
    if (result.errors.length > 0) console.error("Errors:", result.errors);
    return result;
  },
});

export const backfillInvitations = internalAction({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<{ synced: number; errors: string[] }> => {
    const invitations = await ctx.runQuery(
      internal.supabase.backfill._listInvitations,
      { organizationId: args.organizationId },
    );

    const rows = invitations.map((inv) => ({
      id: String(inv._id),
      organization_id: String(inv.organizationId),
      email: inv.email,
      role: inv.role,
      token: inv.token,
      status: inv.status,
      invited_by: String(inv.invitedBy),
      expires_at: inv.expiresAt,
      accepted_at: inv.acceptedAt ?? null,
      created_at: inv.createdAt,
      updated_at: inv.updatedAt,
      module: inv.module ?? null,
      module_data: inv.moduleData ?? null,
    }));

    const result = await upsertBatch("invitations", rows);
    console.info(`Backfill invitations: ${result.synced}/${rows.length} synced`);
    if (result.errors.length > 0) console.error("Errors:", result.errors);
    return result;
  },
});

export const backfillEmployees = internalAction({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<{ synced: number; errors: string[] }> => {
    const employees = await ctx.runQuery(
      internal.supabase.backfill._listEmployees,
      { organizationId: args.organizationId },
    );

    const rows = employees.map((e) => ({
      id: e._id,
      organization_id: e.organizationId,
      user_id: String(e.userId),
      first_name: e.firstName ?? null,
      last_name: e.lastName ?? null,
      role: e.role,
      specialization: e.specialization ?? null,
      qualified_treatment_ids: e.qualifiedTreatmentIds?.map(String) ?? [],
      license_number: e.licenseNumber ?? null,
      hire_date: e.hireDate ?? null,
      is_active: e.isActive ?? true,
      color: e.color ?? null,
      notes: e.notes ?? null,
      phone: e.phone ?? null,
      email: e.email ?? null,
      date_of_birth: e.dateOfBirth ?? null,
      pesel: e.pesel ?? null,
      address: e.address ?? null,
      employment_type: e.employmentType ?? null,
      end_date: e.endDate ?? null,
      position: e.position ?? null,
      department: e.department ?? null,
      skills: e.skills ?? null,
      years_of_experience: e.yearsOfExperience ?? null,
      certifications: e.certifications ?? null,
      base_salary: e.baseSalary ?? null,
      commission_percent: e.commissionPercent ?? null,
      bank_account: e.bankAccount ?? null,
      tag_ids: e.tagIds?.map(String) ?? null,
      category_id: e.categoryId ? String(e.categoryId) : null,
      created_by: String(e.createdBy),
      created_at: e.createdAt,
      updated_at: e.updatedAt,
    }));

    const result = await upsertBatch("gabinet_employees", rows);
    console.info(
      `Backfill employees: ${result.synced}/${rows.length} synced`,
    );
    if (result.errors.length > 0) console.error("Errors:", result.errors);
    return result;
  },
});

// ---------------------------------------------------------------------------
// Run all backfills in dependency order
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Backfill avg_cost_after for pre-migration warehouse_receive movements (#2984)
//
// Movements created before migration 00056 have avg_cost_after = NULL.
// This action replays all warehouse_receive movements in chronological order
// per (product_id, location_id) group, computing the running weighted-average
// net purchase price and writing it back to each NULL row.
//
// Already-populated rows (from movements created after the migration) are used
// as accurate checkpoints so the replay can be run incrementally.  The action
// is idempotent: re-running it on rows that already have avg_cost_after set is
// a no-op for those rows.
// ---------------------------------------------------------------------------

type MovementForBackfill = {
  id: string;
  product_id: string;
  location_id: string | null;
  delta: number;
  balance_after: number;
  unit_price: number;
  avg_cost_after: number | null;
  created_at: number;
};

export const backfillStockMovementAvgCost = internalAction({
  args: { organizationId: v.id("organizations") },
  handler: async (
    _ctx,
    args,
  ): Promise<{ updated: number; skipped: number; errors: string[] }> => {
    const client = createServiceRoleClient();
    const errors: string[] = [];
    let updated = 0;
    let skipped = 0;

    // Paginate through all eligible warehouse_receive movements for this org.
    const PAGE = 1000;
    let allMovements: MovementForBackfill[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await client
        .from("product_stock_movements")
        .select(
          "id, product_id, location_id, delta, balance_after, unit_price, avg_cost_after, created_at",
        )
        .eq("organization_id", String(args.organizationId))
        .eq("reason", "warehouse_receive")
        .not("unit_price", "is", null)
        .gt("delta", 0)
        .not("balance_after", "is", null)
        .order("created_at", { ascending: true })
        .range(from, from + PAGE - 1);

      if (error) {
        return { updated: 0, skipped: 0, errors: [error.message] };
      }
      if (!data || data.length === 0) break;
      allMovements = allMovements.concat(data as MovementForBackfill[]);
      if (data.length < PAGE) break;
      from += PAGE;
    }

    if (allMovements.length === 0) {
      return { updated: 0, skipped: 0, errors: [] };
    }

    // Group by (product_id, location_id). Already sorted by created_at ASC.
    const groups = new Map<string, MovementForBackfill[]>();
    for (const m of allMovements) {
      const key = `${m.product_id}::${m.location_id ?? ""}`;
      const arr = groups.get(key);
      if (arr) {
        arr.push(m);
      } else {
        groups.set(key, [m]);
      }
    }

    for (const group of groups.values()) {
      let prevAvg: number | null = null;

      for (const movement of group) {
        if (movement.avg_cost_after !== null) {
          // Already populated — treat as a reliable checkpoint.
          prevAvg = movement.avg_cost_after;
          continue;
        }

        const prevBalance = movement.balance_after - movement.delta;
        let newAvg: number;
        if (prevBalance <= 0 || prevAvg === null) {
          newAvg = movement.unit_price;
        } else {
          newAvg =
            (prevBalance * prevAvg + movement.delta * movement.unit_price) /
            (prevBalance + movement.delta);
        }

        const { error: updateError } = await client
          .from("product_stock_movements")
          .update({ avg_cost_after: newAvg })
          .eq("id", movement.id);

        if (updateError) {
          errors.push(`movement ${movement.id}: ${updateError.message}`);
          skipped++;
        } else {
          updated++;
          prevAvg = newAvg;
        }
      }
    }

    return { updated, skipped, errors };
  },
});

export const backfillAll = internalAction({
  args: { organizationId: v.id("organizations") },
  handler: async (
    ctx,
    args,
  ): Promise<{
    users: number;
    patients: number;
    treatments: number;
    employees: number;
    appointments: number;
    invitations: number;
    totalErrors: number;
  }> => {
    const orgId = args.organizationId;

    console.info("=== BACKFILL START ===");

    // Users FIRST — all other tables have FK on created_by/employee_id → users(id)
    const allUsers = await ctx.runQuery(internal.supabase.backfill._listUsers, {});
    const userRows = allUsers.map((u) => ({
      id: u._id,
      name: u.name ?? null,
      username: u.username ?? null,
      image_storage_id: u.imageId ?? null,
      image: u.image ?? null,
      email: u.email ?? null,
      email_verification_time: u.emailVerificationTime ?? null,
      phone: u.phone ?? null,
      phone_verification_time: u.phoneVerificationTime ?? null,
      is_anonymous: u.isAnonymous ?? false,
      customer_id: u.customerId ?? null,
      language: u.language ?? null,
      theme: u.theme ?? null,
      timezone: u.timezone ?? null,
      created_at: Math.floor(u._creationTime),
      updated_at: Math.floor(u._creationTime),
    }));
    const usersResult = await upsertBatch("users", userRows);
    console.info(`Users: ${usersResult.synced}/${userRows.length} synced`);
    if (usersResult.errors.length > 0)
      console.error("User errors:", usersResult.errors);

    const patients = await ctx.runAction(
      internal.supabase.backfill.backfillPatients,
      { organizationId: orgId },
    );
    console.info(`Patients: ${patients.synced} synced, ${patients.errors.length} errors`);

    const treatments = await ctx.runAction(
      internal.supabase.backfill.backfillTreatments,
      { organizationId: orgId },
    );
    console.info(`Treatments: ${treatments.synced} synced, ${treatments.errors.length} errors`);
    if (treatments.errors.length > 0)
      console.error("Treatment errors:", treatments.errors);

    const employees = await ctx.runAction(
      internal.supabase.backfill.backfillEmployees,
      { organizationId: orgId },
    );
    console.info(`Employees: ${employees.synced} synced, ${employees.errors.length} errors`);
    if (employees.errors.length > 0)
      console.error("Employee errors:", employees.errors);

    const appointments = await ctx.runAction(
      internal.supabase.backfill.backfillAppointments,
      { organizationId: orgId },
    );
    console.info(`Appointments: ${appointments.synced} synced, ${appointments.errors.length} errors`);
    if (appointments.errors.length > 0)
      console.error("Appointment errors:", appointments.errors);

    // Invitations after users (invited_by FK dep) and after orgs are present.
    const invitations = await ctx.runAction(
      internal.supabase.backfill.backfillInvitations,
      { organizationId: orgId },
    );
    console.info(`Invitations: ${invitations.synced} synced, ${invitations.errors.length} errors`);
    if (invitations.errors.length > 0)
      console.error("Invitation errors:", invitations.errors);

    console.info("=== BACKFILL COMPLETE ===");

    return {
      users: usersResult.synced,
      patients: patients.synced,
      treatments: treatments.synced,
      employees: employees.synced,
      appointments: appointments.synced,
      invitations: invitations.synced,
      totalErrors: usersResult.errors.length + patients.errors.length +
        treatments.errors.length + employees.errors.length +
        appointments.errors.length + invitations.errors.length,
    };
  },
});
