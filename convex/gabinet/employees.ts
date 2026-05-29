import { action, internalAction, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "../_generated/api";
import { logActivity } from "../_helpers/activities";
import { gabinetEmployeeRoleValidator } from "../schema";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import type { GabinetEmployeeRow, SupabasePaginationResult } from "../_helpers/supabaseRows";
import { Id } from "../_generated/dataModel";

// Dual-write refs removed — Supabase is now primary for employee writes

export const list = action({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
    role: v.optional(gabinetEmployeeRoleValidator),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<
    | GabinetEmployeeRow[]
    | SupabasePaginationResult<GabinetEmployeeRow>
  > => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_employees",
      action: "view",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);
    const userIdStr = String(authResult.userId);

    if (args.role) {
      let q = db
        .query("gabinetEmployees")
        .eq("organizationId", orgIdStr)
        .eq("role", args.role);
      let all = (await q.collect()) as GabinetEmployeeRow[];
      let filtered = args.activeOnly ? all.filter((e) => e.isActive) : all;
      if (perm.scope === "own") {
        filtered = filtered.filter((e) => String(e.createdBy) === userIdStr);
      }
      return filtered;
    }

    if (args.activeOnly) {
      let results = (await db
        .query("gabinetEmployees")
        .eq("organizationId", orgIdStr)
        .eq("isActive", true)
        .collect()) as GabinetEmployeeRow[];
      if (perm.scope === "own") {
        results = results.filter((e) => String(e.createdBy) === userIdStr);
      }
      return results;
    }

    let page = (await db
      .query("gabinetEmployees")
      .eq("organizationId", orgIdStr)
      .order("createdAt", false)
      .collect()) as GabinetEmployeeRow[];
    if (perm.scope === "own") {
      page = page.filter((e) => String(e.createdBy) === userIdStr);
    }
    return { page, isDone: true, continueCursor: "" };
  },
});

export const listAll = action({
  args: {
    organizationId: v.id("organizations"),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<GabinetEmployeeRow[]> => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_employees",
      action: "view",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);
    const userIdStr = String(authResult.userId);

    let q = db.query("gabinetEmployees").eq("organizationId", orgIdStr);
    if (args.activeOnly) {
      q = q.eq("isActive", true);
    }
    let results = (await q.collect()) as GabinetEmployeeRow[];
    if (perm.scope === "own") {
      results = results.filter((e) => String(e.createdBy) === userIdStr);
    }
    return results;
  },
});

export const getById = action({
  args: {
    organizationId: v.id("organizations"),
    employeeId: v.string(),
  },
  handler: async (ctx, args): Promise<GabinetEmployeeRow> => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_employees",
      action: "view",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const emp = (await db.get("gabinetEmployees", args.employeeId)) as GabinetEmployeeRow | null;
    if (!emp || String(emp.organizationId) !== String(args.organizationId)) {
      throw new Error("Employee not found");
    }
    if (perm.scope === "own" && String(emp.createdBy) !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only view your own records");
    }
    return emp;
  },
});

export const getByUserId = action({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
  },
  handler: async (ctx, args): Promise<GabinetEmployeeRow | null> => {
    await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_employees",
      action: "view",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const results = (await db
      .query("gabinetEmployees")
      .eq("organizationId", String(args.organizationId))
      .eq("userId", String(args.userId))
      .collect()) as GabinetEmployeeRow[];

    return results[0] ?? null;
  },
});

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    role: gabinetEmployeeRoleValidator,
    specialization: v.optional(v.string()),
    qualifiedTreatmentIds: v.optional(v.array(v.string())),
    licenseNumber: v.optional(v.string()),
    hireDate: v.optional(v.string()),
    color: v.optional(v.string()),
    notes: v.optional(v.string()),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // --- Auth + permissions (via internal queries) ---
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    // Require admin role (mirrors requireOrgAdmin)
    if (authResult.role !== "owner" && authResult.role !== "admin") {
      throw new Error("Admin access required");
    }
    await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_employees",
      action: "create",
    }).then((perm: { allowed: boolean; scope: string }) => {
      if (!perm.allowed) throw new Error("Permission denied");
    });

    const now = Date.now();
    const db = createSupabaseDb();

    // --- Check if employee already exists (via Supabase) ---
    const existing = await db.query("gabinetEmployees")
      .eq("organizationId", String(args.organizationId))
      .eq("userId", args.userId)
      .collect();
    if (existing.length > 0) {
      throw new Error("Employee profile already exists for this user");
    }

    // --- INSERT employee directly to Supabase ---
    const employeeId = await db.insert("gabinetEmployees", {
      organizationId: String(args.organizationId),
      userId: args.userId,
      firstName: args.firstName ?? null,
      lastName: args.lastName ?? null,
      role: args.role,
      specialization: args.specialization ?? null,
      qualifiedTreatmentIds: args.qualifiedTreatmentIds ?? [],
      licenseNumber: args.licenseNumber ?? null,
      hireDate: args.hireDate ?? null,
      isActive: true,
      color: args.color ?? null,
      notes: args.notes ?? null,
      tagIds: args.tagIds ?? null,
      categoryId: args.categoryId ?? null,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    // --- Delegate Convex-only side effects ---
    try {
      await ctx.runMutation(internal.gabinet.employees._createSideEffects, {
        employeeId,
        organizationId: args.organizationId,
        createdBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[employees.create] Side effects FAILED for employee", employeeId, ":", e);
    }

    // --- Mirror role into Convex `gabinetMemberships` so checkPermission
    //     can resolve the user's gabinet-role (it can't reach Supabase). ---
    try {
      await ctx.runMutation(internal.gabinet.employees._upsertMembership, {
        organizationId: args.organizationId,
        userId: args.userId,
        gabinetRole: args.role,
        isActive: true,
      });
    } catch (e) {
      console.error("[employees.create] Membership mirror FAILED:", e);
    }

    return employeeId;
  },
});

/**
 * System-internal: create a gabinet_employees row from an invitation's
 * `moduleData` payload. Called by `invitations._acceptInternal` after the
 * invitee's user row is mirrored. Bypasses the role-based permission check
 * the public `create` action enforces — the inviting admin already vetted
 * this assignment when they created the invitation.
 *
 * `data` is the free-form payload the invite UI persisted; treated as
 * untrusted JSON and field-by-field validated here before insert.
 */
export const _createFromInvitation = internalAction({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
    invitedBy: v.string(),
    data: v.any(),
  },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();

    // Idempotency: bail if an employee row already exists for this user/org.
    const existing = await db
      .query("gabinetEmployees")
      .eq("organizationId", String(args.organizationId))
      .eq("userId", args.userId)
      .collect();
    if (existing.length > 0) {
      console.log(
        `[gabinet.employees._createFromInvitation] skip — employee already exists for user=${args.userId}`,
      );
      return { skipped: true, employeeId: String(existing[0]._id) };
    }

    const d = (args.data ?? {}) as Record<string, unknown>;

    const asString = (v: unknown) =>
      typeof v === "string" && v.length > 0 ? v : null;
    const asStringArray = (v: unknown) =>
      Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : null;

    const role = asString(d.role) ?? "doctor";
    const allowedRoles = ["doctor", "nurse", "therapist", "receptionist", "admin", "other"];
    const safeRole = allowedRoles.includes(role) ? role : "doctor";

    const now = Date.now();
    const employeeId = await db.insert("gabinetEmployees", {
      organizationId: String(args.organizationId),
      userId: args.userId,
      firstName: asString(d.firstName),
      lastName: asString(d.lastName),
      role: safeRole,
      specialization: asString(d.specialization),
      qualifiedTreatmentIds: asStringArray(d.qualifiedTreatmentIds) ?? [],
      licenseNumber: null,
      hireDate: null,
      isActive: true,
      color: asString(d.color),
      notes: null,
      tagIds: asStringArray(d.tagIds),
      categoryId: asString(d.categoryId),
      createdBy: args.invitedBy,
      createdAt: now,
      updatedAt: now,
    });

    // Custom fields (free-form per-org definitions) — moduleData.customFields
    // is expected to be an array of { fieldDefinitionId, value }. Matches the
    // shape `customFields.setValues` produces and what the renderer emits.
    const cfs = Array.isArray(d.customFields) ? d.customFields : null;
    if (cfs) {
      for (const f of cfs) {
        if (!f || typeof f !== "object") continue;
        const defId = (f as Record<string, unknown>).fieldDefinitionId;
        const val = (f as Record<string, unknown>).value;
        if (typeof defId !== "string" || defId.length === 0) continue;
        try {
          await db.insert("customFieldValues", {
            organizationId: String(args.organizationId),
            fieldDefinitionId: defId,
            entityType: "gabinetEmployee",
            entityId: String(employeeId),
            value: val ?? null,
            createdAt: now,
            updatedAt: now,
          });
        } catch (e) {
          console.error(
            `[gabinet.employees._createFromInvitation] custom field ${defId} insert failed:`,
            e,
          );
        }
      }
    }

    // Activity log + audit, fire-and-forget.
    try {
      await ctx.runMutation(internal.gabinet.employees._createSideEffects, {
        employeeId: String(employeeId),
        organizationId: args.organizationId,
        createdBy: args.invitedBy,
      });
    } catch (e) {
      console.error("[gabinet.employees._createFromInvitation] side effects failed:", e);
    }

    // Mirror role for permission checks. See `_upsertMembership` for why.
    try {
      await ctx.runMutation(internal.gabinet.employees._upsertMembership, {
        organizationId: args.organizationId,
        userId: args.userId,
        gabinetRole: safeRole,
        isActive: true,
      });
    } catch (e) {
      console.error("[gabinet.employees._createFromInvitation] membership mirror failed:", e);
    }

    return { skipped: false, employeeId: String(employeeId) };
  },
});

/**
 * Upsert the slim Convex mirror of (orgId, userId, gabinetRole, isActive).
 * Used by checkPermission to decide gabinet-role overlay without reaching
 * Supabase. Idempotent.
 */
export const _upsertMembership = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
    gabinetRole: v.string(),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = args.userId as Id<"users">;
    const now = Date.now();
    const existing = await ctx.db
      .query("gabinetMemberships")
      .withIndex("by_orgAndUser", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", userId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        gabinetRole: args.gabinetRole,
        isActive: args.isActive,
        updatedAt: now,
      });
      return { id: String(existing._id), updated: true };
    }
    const id = await ctx.db.insert("gabinetMemberships", {
      organizationId: args.organizationId,
      userId,
      gabinetRole: args.gabinetRole,
      isActive: args.isActive,
      updatedAt: now,
    });
    return { id: String(id), updated: false };
  },
});

export const _createSideEffects = internalMutation({
  args: {
    employeeId: v.string(),
    organizationId: v.id("organizations"),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    const createdByUserId = args.createdBy as Id<"users">;

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetEmployee",
      entityId: args.employeeId as Id<"gabinetEmployees">,
      action: "created",
      description: `Created employee profile`,
      performedBy: createdByUserId,
    });
  },
});

export const update = action({
  args: {
    organizationId: v.id("organizations"),
    employeeId: v.string(),
    userId: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    role: v.optional(gabinetEmployeeRoleValidator),
    specialization: v.optional(v.string()),
    qualifiedTreatmentIds: v.optional(v.array(v.string())),
    licenseNumber: v.optional(v.string()),
    hireDate: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    color: v.optional(v.string()),
    notes: v.optional(v.string()),
    // Detailed employee data
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    pesel: v.optional(v.string()),
    address: v.optional(
      v.object({
        street: v.optional(v.string()),
        city: v.optional(v.string()),
        postalCode: v.optional(v.string()),
      }),
    ),
    employmentType: v.optional(
      v.union(
        v.literal("umowa_o_prace"),
        v.literal("umowa_zlecenie"),
        v.literal("b2b"),
        v.literal("staz"),
      ),
    ),
    endDate: v.optional(v.string()),
    position: v.optional(v.string()),
    department: v.optional(v.string()),
    skills: v.optional(v.array(v.string())),
    yearsOfExperience: v.optional(v.number()),
    certifications: v.optional(
      v.array(
        v.object({
          name: v.string(),
          dateObtained: v.optional(v.string()),
          expiryDate: v.optional(v.string()),
        }),
      ),
    ),
    baseSalary: v.optional(v.number()),
    commissionPercent: v.optional(v.number()),
    bankAccount: v.optional(v.string()),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // --- Auth + permissions (via internal queries) ---
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    // Require admin role (mirrors requireOrgAdmin)
    if (authResult.role !== "owner" && authResult.role !== "admin") {
      throw new Error("Admin access required");
    }
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "gabinet_employees",
        action: "edit",
      },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    // --- Read employee from Supabase ---
    const emp = await db.get("gabinetEmployees", args.employeeId);
    if (!emp || String(emp.organizationId) !== String(args.organizationId)) {
      throw new Error("Employee not found");
    }
    if (perm.scope === "own" && String(emp.createdBy) !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only edit your own records");
    }

    // --- If re-linking to a different user, ensure target user is not already an employee ---
    if (args.userId && String(args.userId) !== String(emp.userId)) {
      const conflict = await db
        .query("gabinetEmployees")
        .eq("organizationId", String(args.organizationId))
        .eq("userId", String(args.userId))
        .collect();
      const otherEmployee = conflict.find(
        (e) => String(e._id) !== String(args.employeeId),
      );
      if (otherEmployee) {
        throw new Error("Employee profile already exists for this user");
      }
    }

    // --- Build updates and PATCH to Supabase ---
    const { organizationId, employeeId, ...updates } = args;
    await db.patch("gabinetEmployees", employeeId, { ...updates, updatedAt: Date.now() });

    // --- Delegate Convex-only side effects ---
    try {
      await ctx.runMutation(internal.gabinet.employees._updateSideEffects, {
        employeeId,
        organizationId,
        updatedBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[employees.update] Side effects FAILED for employee", employeeId, ":", e);
    }

    // Mirror role change (or isActive change) into Convex `gabinetMemberships`
    // so permission checks reflect the new role on the next call.
    if (args.role !== undefined || args.isActive !== undefined) {
      try {
        const effectiveRole = args.role ?? (emp.role as string);
        const effectiveActive = args.isActive ?? Boolean(emp.isActive);
        await ctx.runMutation(internal.gabinet.employees._upsertMembership, {
          organizationId: args.organizationId,
          userId: String(emp.userId),
          gabinetRole: effectiveRole,
          isActive: effectiveActive,
        });
      } catch (e) {
        console.error("[employees.update] Membership mirror FAILED:", e);
      }
    }

    return employeeId;
  },
});

export const _updateSideEffects = internalMutation({
  args: {
    employeeId: v.string(),
    organizationId: v.id("organizations"),
    updatedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const updatedByUserId = args.updatedBy as Id<"users">;

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetEmployee",
      entityId: args.employeeId as Id<"gabinetEmployees">,
      action: "updated",
      description: `Updated employee profile`,
      performedBy: updatedByUserId,
    });
  },
});

export const remove = action({
  args: {
    organizationId: v.id("organizations"),
    employeeId: v.string(),
  },
  handler: async (ctx, args) => {
    // --- Auth + permissions (via internal queries) ---
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    // Require admin role (mirrors requireOrgAdmin)
    if (authResult.role !== "owner" && authResult.role !== "admin") {
      throw new Error("Admin access required");
    }
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "gabinet_employees",
        action: "delete",
      },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    // --- Read employee from Supabase ---
    const emp = await db.get("gabinetEmployees", args.employeeId);
    if (!emp || String(emp.organizationId) !== String(args.organizationId)) {
      throw new Error("Employee not found");
    }
    if (perm.scope === "own" && String(emp.createdBy) !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only delete your own records");
    }

    // --- Soft-delete: PATCH isActive=false in Supabase ---
    await db.patch("gabinetEmployees", args.employeeId, {
      isActive: false,
      updatedAt: Date.now(),
    });

    // --- Delegate Convex-only side effects ---
    try {
      await ctx.runMutation(internal.gabinet.employees._removeSideEffects, {
        employeeId: args.employeeId,
        organizationId: args.organizationId,
        deletedBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[employees.remove] Side effects FAILED for employee", args.employeeId, ":", e);
    }

    // Mark membership inactive so the gabinet-role overlay no longer applies.
    try {
      await ctx.runMutation(internal.gabinet.employees._upsertMembership, {
        organizationId: args.organizationId,
        userId: String(emp.userId),
        gabinetRole: emp.role as string,
        isActive: false,
      });
    } catch (e) {
      console.error("[employees.remove] Membership mirror FAILED:", e);
    }
  },
});

export const _removeSideEffects = internalMutation({
  args: {
    employeeId: v.string(),
    organizationId: v.id("organizations"),
    deletedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const deletedByUserId = args.deletedBy as Id<"users">;

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetEmployee",
      entityId: args.employeeId as Id<"gabinetEmployees">,
      action: "deleted",
      description: `Deactivated employee profile`,
      performedBy: deletedByUserId,
    });
  },
});

/** Get employees qualified for a specific treatment */
export const getQualifiedForTreatment = action({
  args: {
    organizationId: v.id("organizations"),
    treatmentId: v.string(),
  },
  handler: async (ctx, args): Promise<GabinetEmployeeRow[]> => {
    await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_employees",
      action: "view",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const employees = (await db
      .query("gabinetEmployees")
      .eq("organizationId", String(args.organizationId))
      .eq("isActive", true)
      .collect()) as GabinetEmployeeRow[];

    return employees.filter((e) =>
      (e.qualifiedTreatmentIds ?? []).includes(args.treatmentId as Id<"gabinetTreatments">)
    );
  },
});

/** Update treatment qualifications for an employee */
export const setQualifiedTreatments = action({
  args: {
    organizationId: v.id("organizations"),
    employeeId: v.string(),
    treatmentIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // --- Auth + permissions (via internal queries) ---
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    // Require admin role (mirrors requireOrgAdmin)
    if (authResult.role !== "owner" && authResult.role !== "admin") {
      throw new Error("Admin access required");
    }
    await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_employees",
      action: "edit",
    }).then((perm: { allowed: boolean; scope: string }) => {
      if (!perm.allowed) throw new Error("Permission denied");
    });

    const db = createSupabaseDb();

    // --- Read employee from Supabase ---
    const emp = await db.get("gabinetEmployees", args.employeeId);
    if (!emp || String(emp.organizationId) !== String(args.organizationId)) {
      throw new Error("Employee not found");
    }

    // --- PATCH to Supabase ---
    await db.patch("gabinetEmployees", args.employeeId, {
      qualifiedTreatmentIds: args.treatmentIds,
      updatedAt: Date.now(),
    });

    // --- Delegate Convex-only side effects ---
    try {
      await ctx.runMutation(internal.gabinet.employees._setQualifiedSideEffects, {
        employeeId: args.employeeId,
        organizationId: args.organizationId,
        treatmentCount: args.treatmentIds.length,
        updatedBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[employees.setQualifiedTreatments] Side effects FAILED:", e);
    }
  },
});

export const _setQualifiedSideEffects = internalMutation({
  args: {
    employeeId: v.string(),
    organizationId: v.id("organizations"),
    treatmentCount: v.number(),
    updatedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const updatedByUserId = args.updatedBy as Id<"users">;

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetEmployee",
      entityId: args.employeeId as Id<"gabinetEmployees">,
      action: "updated",
      description: `Updated treatment qualifications (${args.treatmentCount} treatments)`,
      performedBy: updatedByUserId,
    });
  },
});
