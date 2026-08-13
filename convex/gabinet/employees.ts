import { action, internalAction, internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "../_generated/api";
import { logActivity } from "../_helpers/activities";
import { logAudit } from "../auditLog";
import { logError } from "../_helpers/logged";
import { gabinetEmployeeRoleValidator, GabinetEmployeeRole } from "../schema";
import { isSystemGabinetRole } from "../_helpers/gabinetRolePermissions";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { createLogger } from "../_helpers/logger";
import type { GabinetEmployeeRow, SupabasePaginationResult } from "../_helpers/supabaseRows";
import { Id } from "../_generated/dataModel";
import { createAccount, modifyAccountCredentials } from "@convex-dev/auth/server";

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
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const perm = await ctx.runAction(internal._helpers.authAction.checkPermission, {
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
      if (args.activeOnly) q = q.eq("isActive", true);
      if (perm.scope === "own") q = q.eq("userId", userIdStr);
      return (await q.collect()) as GabinetEmployeeRow[];
    }

    if (args.activeOnly) {
      let q = db
        .query("gabinetEmployees")
        .eq("organizationId", orgIdStr)
        .eq("isActive", true);
      if (perm.scope === "own") q = q.eq("userId", userIdStr);
      return (await q.collect()) as GabinetEmployeeRow[];
    }

    let q = db
      .query("gabinetEmployees")
      .eq("organizationId", orgIdStr)
      .order("createdAt", false);
    if (perm.scope === "own") q = q.eq("userId", userIdStr);
    const page = (await q.collect()) as GabinetEmployeeRow[];
    return { page, isDone: true, continueCursor: "" };
  },
});

export const listAll = action({
  args: {
    organizationId: v.id("organizations"),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<GabinetEmployeeRow[]> => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const perm = await ctx.runAction(internal._helpers.authAction.checkPermission, {
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
    if (perm.scope === "own") {
      q = q.eq("userId", userIdStr);
    }
    return (await q.collect()) as GabinetEmployeeRow[];
  },
});

export const getById = action({
  args: {
    organizationId: v.id("organizations"),
    employeeId: v.string(),
  },
  handler: async (ctx, args): Promise<GabinetEmployeeRow> => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const perm = await ctx.runAction(internal._helpers.authAction.checkPermission, {
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
    if (perm.scope === "own" && String(emp.userId) !== String(authResult.userId)) {
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
    await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const perm = await ctx.runAction(internal._helpers.authAction.checkPermission, {
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
    userId: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    role: gabinetEmployeeRoleValidator,
    specialization: v.optional(v.union(v.string(), v.null())),
    qualifiedTreatmentIds: v.optional(v.array(v.string())),
    licenseNumber: v.optional(v.union(v.string(), v.null())),
    hireDate: v.optional(v.union(v.string(), v.null())),
    isActive: v.optional(v.boolean()),
    color: v.optional(v.union(v.string(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
    showInCalendar: v.optional(v.boolean()),
    performsServices: v.optional(v.boolean()),
    workScope: v.optional(v.union(v.literal("clinic"), v.literal("office"), v.literal("both"))),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.union(v.string(), v.null())),
    customFields: v.optional(v.array(v.any())),
    locationId: v.optional(v.string()),
    locationRole: v.optional(gabinetEmployeeRoleValidator),
  },
  handler: async (ctx, args) => {
    try {

    // --- Auth + permissions (via internal queries) ---
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    await ctx.runAction(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_employees",
      action: "create",
    }).then((perm: { allowed: boolean; scope: string }) => {
      if (!perm.allowed) throw new Error("Permission denied");
    });

    const now = Date.now();
    const db = createSupabaseDb();

    // --- Check if employee already exists (only when a user is linked) ---
    if (args.userId) {
      const existing = await db.query("gabinetEmployees")
        .eq("organizationId", String(args.organizationId))
        .eq("userId", args.userId)
        .collect();
      if (existing.length > 0) {
        throw new Error("Employee profile already exists for this user");
      }
    }

    // --- INSERT employee directly to Supabase ---
    const employeeId = await db.insert("gabinetEmployees", {
      organizationId: String(args.organizationId),
      userId: args.userId ?? null,
      firstName: args.firstName ?? null,
      lastName: args.lastName ?? null,
      role: args.role,
      specialization: args.specialization ?? null,
      qualifiedTreatmentIds: args.qualifiedTreatmentIds ?? [],
      licenseNumber: args.licenseNumber ?? null,
      hireDate: args.hireDate ?? null,
      isActive: args.isActive ?? true,
      color: args.color ?? null,
      notes: args.notes ?? null,
      showInCalendar: args.showInCalendar ?? true,
      performsServices: args.performsServices ?? true,
      workScope: args.workScope ?? null,
      tagIds: args.tagIds ?? null,
      categoryId: args.categoryId ?? null,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    if (args.locationId) {
      try {
        await db.insert("gabinetEmployeeLocations", {
          organizationId: String(args.organizationId),
          employeeId: String(employeeId),
          locationId: args.locationId,
          isPrimary: true,
          role: args.locationRole,
          createdAt: now,
        });
      } catch (e) {
        console.error("[employees.create] location insert failed:", e);
      }
    }

    // --- Delegate post-write side effects ---
    try {
      await ctx.runMutation(internal.gabinet.employees._createSideEffects, {
        employeeId,
        organizationId: args.organizationId,
        createdBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
      });
    } catch (e) {
      console.error("[employees.create] Side effects FAILED for employee", employeeId, ":", e);
    }

    // --- Mirror role into Convex `gabinetMemberships` so checkPermission
    //     can resolve the user's gabinet-role (it can't reach Supabase). ---
    if (args.userId) {
      await ctx.runMutation(internal.gabinet.employees._upsertMembership, {
        organizationId: args.organizationId,
        userId: args.userId,
        gabinetRole: args.role,
        isActive: true,
      });
    }

    if (args.customFields && args.customFields.length > 0) {
      for (const f of args.customFields) {
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
          console.error("[employees.create] customField insert failed:", e);
        }
      }
    }

    return employeeId;
    } catch (err) {
      await logError(ctx, err, {
        scope: "gabinet.employees",
        fnName: "create",
        argsJson: JSON.stringify({
          organizationId: args.organizationId,
          userId: args.userId,
          firstName: args.firstName,
          lastName: args.lastName,
          role: args.role,
          specialization: args.specialization,
          qualifiedTreatmentIdsCount: args.qualifiedTreatmentIds?.length,
          licenseNumber: args.licenseNumber,
          hireDate: args.hireDate,
          showInCalendar: args.showInCalendar,
          tagIdsCount: args.tagIds?.length,
          categoryId: args.categoryId,
        }),
        organizationId: args.organizationId,
      });
      throw err;
    }
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
    const log = createLogger("gabinet.employees", { correlationId: db.correlationId });

    // Idempotency: bail if an employee row already exists for this user/org.
    const existing = await db
      .query("gabinetEmployees")
      .eq("organizationId", String(args.organizationId))
      .eq("userId", args.userId)
      .collect();
    if (existing.length > 0) {
      const existingEmployeeId = String(existing[0]._id);
      log.info("skip — employee already exists", { userId: args.userId });

      // Still honour any locationId on the re-invite so the new assignment is not silently dropped.
      const d2 = (args.data ?? {}) as Record<string, unknown>;
      const locationId2 = typeof d2.locationId === "string" && d2.locationId.length > 0 ? d2.locationId : null;
      const locationRole2Raw = typeof d2.locationRole === "string" ? d2.locationRole : null;
      const locationRole2 = locationRole2Raw && isSystemGabinetRole(locationRole2Raw) ? locationRole2Raw : undefined;
      if (locationId2) {
        try {
          const existingLocation = await db
            .query("gabinetEmployeeLocations")
            .eq("organizationId", String(args.organizationId))
            .eq("employeeId", existingEmployeeId)
            .eq("locationId", locationId2)
            .collect();
          if (existingLocation.length === 0) {
            await db.insert("gabinetEmployeeLocations", {
              organizationId: String(args.organizationId),
              employeeId: existingEmployeeId,
              locationId: locationId2,
              isPrimary: false,
              role: locationRole2,
              createdAt: Date.now(),
            });
          }
        } catch (e) {
          console.error(
            `[gabinet.employees._createFromInvitation] location insert on re-invite failed:`,
            e,
          );
        }
      }

      return { skipped: true, employeeId: existingEmployeeId };
    }

    const d = (args.data ?? {}) as Record<string, unknown>;

    const asString = (v: unknown) =>
      typeof v === "string" && v.length > 0 ? v : null;
    const asStringArray = (v: unknown) =>
      Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : null;

    const role = asString(d.role) ?? "doctor";
    const safeRole = isSystemGabinetRole(role) ? role : "doctor";

    const now = Date.now();
    const employeeId = await db.insert("gabinetEmployees", {
      organizationId: String(args.organizationId),
      userId: args.userId,
      firstName: asString(d.firstName),
      lastName: asString(d.lastName),
      role: safeRole,
      specialization: asString(d.specialization),
      qualifiedTreatmentIds: asStringArray(d.qualifiedTreatmentIds) ?? [],
      licenseNumber: asString(d.licenseNumber),
      hireDate: null,
      isActive: true,
      color: asString(d.color),
      notes: null,
      showInCalendar: typeof d.showInCalendar === "boolean" ? d.showInCalendar : true,
      tagIds: asStringArray(d.tagIds),
      categoryId: asString(d.categoryId),
      createdBy: args.invitedBy,
      createdAt: now,
      updatedAt: now,
    });

    // Location assignment — moduleData.locationId seeds the primary location.
    const locationId = asString(d.locationId);
    const locationRoleRaw = asString(d.locationRole);
    const locationRole = locationRoleRaw && isSystemGabinetRole(locationRoleRaw) ? locationRoleRaw : undefined;
    if (locationId) {
      try {
        await db.insert("gabinetEmployeeLocations", {
          organizationId: String(args.organizationId),
          employeeId: String(employeeId),
          locationId,
          isPrimary: true,
          role: locationRole,
          createdAt: now,
        });
      } catch (e) {
        console.error(
          `[gabinet.employees._createFromInvitation] location insert failed:`,
          e,
        );
      }
    }

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
    await ctx.runMutation(internal.gabinet.employees._upsertMembership, {
      organizationId: args.organizationId,
      userId: args.userId,
      gabinetRole: safeRole,
      isActive: true,
    });

    return { skipped: false, employeeId: String(employeeId) };
  },
});

/**
 * One-shot backfill: scan every gabinet_employees row in Supabase and ensure a
 * matching `gabinetMemberships` row exists in Convex so the permission overlay
 * works for users that were created before the mirror landed. Safe to re-run.
 */
export const _backfillMemberships = internalAction({
  args: {},
  returns: v.object({
    scanned: v.number(),
    upserted: v.number(),
    skipped: v.number(),
    errors: v.number(),
  }),
  handler: async (ctx): Promise<{ scanned: number; upserted: number; skipped: number; errors: number }> => {
    const db = createSupabaseDb();
    const employees = (await db.query("gabinetEmployees").collect()) as Array<{
      _id: string;
      organizationId: string;
      userId: string;
      role: string;
      isActive: boolean;
    }>;
    let upserted = 0, skipped = 0, errors = 0;
    for (const e of employees) {
      if (!e.userId || !e.organizationId || !e.role) {
        skipped += 1;
        continue;
      }
      try {
        await ctx.runMutation(internal.gabinet.employees._upsertMembership, {
          organizationId: e.organizationId as Id<"organizations">,
          userId: e.userId,
          gabinetRole: e.role as GabinetEmployeeRole,
          isActive: Boolean(e.isActive),
        });
        upserted += 1;
      } catch (err) {
        console.error("[_backfillMemberships]", e._id, err);
        errors += 1;
      }
    }
    return { scanned: employees.length, upserted, skipped, errors };
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
    gabinetRole: gabinetEmployeeRoleValidator,
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
    actorLabel: v.optional(v.string()),
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
      actorLabel: args.actorLabel,
    });

    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: createdByUserId,
      action: "employee_created",
      entityType: "gabinetEmployee",
      entityId: args.employeeId,
      details: `Created employee profile`,
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
    specialization: v.optional(v.union(v.string(), v.null())),
    qualifiedTreatmentIds: v.optional(v.array(v.string())),
    licenseNumber: v.optional(v.union(v.string(), v.null())),
    hireDate: v.optional(v.union(v.string(), v.null())),
    isActive: v.optional(v.boolean()),
    color: v.optional(v.union(v.string(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
    // Detailed employee data
    phone: v.optional(v.union(v.string(), v.null())),
    email: v.optional(v.union(v.string(), v.null())),
    dateOfBirth: v.optional(v.union(v.string(), v.null())),
    pesel: v.optional(v.union(v.string(), v.null())),
    address: v.optional(
      v.union(
        v.object({
          street: v.optional(v.string()),
          city: v.optional(v.string()),
          postalCode: v.optional(v.string()),
        }),
        v.null(),
      ),
    ),
    employmentType: v.optional(
      v.union(
        v.literal("umowa_o_prace"),
        v.literal("umowa_zlecenie"),
        v.literal("b2b"),
        v.literal("staz"),
        v.null(),
      ),
    ),
    endDate: v.optional(v.union(v.string(), v.null())),
    position: v.optional(v.union(v.string(), v.null())),
    department: v.optional(v.union(v.string(), v.null())),
    skills: v.optional(v.union(v.array(v.string()), v.null())),
    yearsOfExperience: v.optional(v.union(v.number(), v.null())),
    certifications: v.optional(
      v.union(
        v.array(
          v.object({
            name: v.string(),
            dateObtained: v.optional(v.string()),
            expiryDate: v.optional(v.string()),
          }),
        ),
        v.null(),
      ),
    ),
    assignedItems: v.optional(
      v.union(
        v.array(
          v.object({
            name: v.string(),
            quantity: v.optional(v.number()),
            issuedDate: v.optional(v.string()),
            returnedDate: v.optional(v.string()),
            notes: v.optional(v.string()),
          }),
        ),
        v.null(),
      ),
    ),
    baseSalary: v.optional(v.union(v.number(), v.null())),
    commissionPercent: v.optional(v.union(v.number(), v.null())),
    bankAccount: v.optional(v.union(v.string(), v.null())),
    showInCalendar: v.optional(v.boolean()),
    performsServices: v.optional(v.boolean()),
    workScope: v.optional(v.union(v.literal("clinic"), v.literal("office"), v.literal("both"), v.null())),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.union(v.string(), v.null())),
    bio: v.optional(v.union(v.string(), v.null())),
    avatarUrl: v.optional(v.union(v.string(), v.null())),
    locationId: v.optional(v.union(v.string(), v.null())),
    locationRole: v.optional(v.union(gabinetEmployeeRoleValidator, v.null())),
  },
  handler: async (ctx, args) => {
    try {
    // --- Auth + permissions (via internal queries) ---
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const perm = await ctx.runAction(
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
    if (perm.scope === "own" && String(emp.userId) !== String(authResult.userId)) {
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
    // locationId and locationRole live in gabinetEmployeeLocations, not gabinetEmployees — exclude from patch
    const { organizationId, employeeId, locationId, locationRole, ...updates } = args;
    await db.patch("gabinetEmployees", employeeId, { ...updates, updatedAt: Date.now() });

    // --- Upsert primary location ---
    if (locationId !== undefined) {
      const existingLocs = await db.query("gabinetEmployeeLocations")
        .eq("organizationId", String(organizationId))
        .eq("employeeId", employeeId)
        .eq("isPrimary", true)
        .collect();
      for (const loc of existingLocs) {
        await db.delete("gabinetEmployeeLocations", String(loc._id));
      }
      if (locationId) {
        const effectiveLocationRole = locationRole != null ? locationRole : undefined;
        try {
          await db.insert("gabinetEmployeeLocations", {
            organizationId: String(organizationId),
            employeeId,
            locationId,
            isPrimary: true,
            role: effectiveLocationRole,
            createdAt: Date.now(),
          });
        } catch (e) {
          console.error("[employees.update] location insert failed:", e);
        }
      }
    } else if (locationRole !== undefined) {
      // locationId not provided — patch the role on the existing primary location in-place
      const existingLocs = await db.query("gabinetEmployeeLocations")
        .eq("organizationId", String(organizationId))
        .eq("employeeId", employeeId)
        .eq("isPrimary", true)
        .collect();
      for (const loc of existingLocs) {
        const effectiveLocationRole = locationRole ?? null;
        try {
          await db.patch("gabinetEmployeeLocations", String(loc._id), {
            role: effectiveLocationRole,
          });
        } catch (e) {
          console.error("[employees.update] location role patch failed:", e);
        }
      }
    }

    // --- Delegate post-write side effects ---
    try {
      await ctx.runMutation(internal.gabinet.employees._updateSideEffects, {
        employeeId,
        organizationId,
        updatedBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
      });
    } catch (e) {
      console.error("[employees.update] Side effects FAILED for employee", employeeId, ":", e);
    }

    // Mirror role change (or isActive change) into Convex `gabinetMemberships`
    // so permission checks reflect the new role on the next call.
    if ((args.role !== undefined || args.isActive !== undefined) && emp.userId) {
      const effectiveRole = args.role ?? (emp.role as GabinetEmployeeRole);
      const effectiveActive = args.isActive ?? Boolean(emp.isActive);
      await ctx.runMutation(internal.gabinet.employees._upsertMembership, {
        organizationId: args.organizationId,
        userId: String(emp.userId),
        gabinetRole: effectiveRole,
        isActive: effectiveActive,
      });
    }

    return employeeId;
    } catch (err) {
      await logError(ctx, err, {
        scope: "gabinet.employees",
        fnName: "update",
        argsJson: JSON.stringify({
          organizationId: args.organizationId,
          employeeId: args.employeeId,
          updatedFields: Object.keys(args).filter(
            (k) => k !== "organizationId" && k !== "employeeId",
          ),
          role: args.role,
          qualifiedTreatmentIdsCount: args.qualifiedTreatmentIds?.length,
          tagIdsCount: args.tagIds?.length,
          certificationsCount: args.certifications?.length,
          assignedItemsCount: args.assignedItems?.length,
          skillsCount: args.skills?.length,
        }),
        organizationId: args.organizationId,
      });
      throw err;
    }
  },
});

export const _updateSideEffects = internalMutation({
  args: {
    employeeId: v.string(),
    organizationId: v.id("organizations"),
    updatedBy: v.string(),
    actorLabel: v.optional(v.string()),
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
      actorLabel: args.actorLabel,
    });

    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: updatedByUserId,
      action: "employee_updated",
      entityType: "gabinetEmployee",
      entityId: args.employeeId,
      details: `Updated employee profile`,
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
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const perm = await ctx.runAction(
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
    if (perm.scope === "own" && String(emp.userId) !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only delete your own records");
    }

    // --- Soft-delete: PATCH isActive=false in Supabase ---
    await db.patch("gabinetEmployees", args.employeeId, {
      isActive: false,
      updatedAt: Date.now(),
    });

    // --- Delegate post-write side effects ---
    try {
      await ctx.runMutation(internal.gabinet.employees._removeSideEffects, {
        employeeId: args.employeeId,
        organizationId: args.organizationId,
        deletedBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
      });
    } catch (e) {
      console.error("[employees.remove] Side effects FAILED for employee", args.employeeId, ":", e);
    }

    // Mark membership inactive so the gabinet-role overlay no longer applies.
    if (emp.userId) {
      await ctx.runMutation(internal.gabinet.employees._upsertMembership, {
        organizationId: args.organizationId,
        userId: String(emp.userId),
        gabinetRole: emp.role as GabinetEmployeeRole,
        isActive: false,
      });
    }
  },
});

export const _removeSideEffects = internalMutation({
  args: {
    employeeId: v.string(),
    organizationId: v.id("organizations"),
    deletedBy: v.string(),
    actorLabel: v.optional(v.string()),
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
      actorLabel: args.actorLabel,
    });

    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: deletedByUserId,
      action: "employee_deleted",
      entityType: "gabinetEmployee",
      entityId: args.employeeId,
      details: `Deactivated employee profile`,
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
    await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const perm = await ctx.runAction(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_employees",
      action: "view",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    return (await db
      .query("gabinetEmployees")
      .eq("organizationId", String(args.organizationId))
      .eq("isActive", true)
      .contains("qualifiedTreatmentIds", [args.treatmentId])
      .collect()) as GabinetEmployeeRow[];
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
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    await ctx.runAction(internal._helpers.authAction.checkPermission, {
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

    // --- Delegate post-write side effects ---
    try {
      await ctx.runMutation(internal.gabinet.employees._setQualifiedSideEffects, {
        employeeId: args.employeeId,
        organizationId: args.organizationId,
        treatmentCount: args.treatmentIds.length,
        updatedBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
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
    actorLabel: v.optional(v.string()),
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
      actorLabel: args.actorLabel,
    });
  },
});

/**
 * Internal query: read a user row from the Convex auth store. Used by
 * `_finalisePasswordUser` which needs user data immediately after account
 * creation, before the Supabase mirror has run.
 */
export const _getConvexUser = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId as Id<"users">);
  },
});

/**
 * Internal mutation: write a derived username back into the Convex auth record.
 * Called by `_finalisePasswordUser` after uniqueness is confirmed against
 * Supabase. The Convex patch keeps the auth record consistent; the username is
 * carried to Supabase in the subsequent `writeUserToSupabase` call.
 */
export const _patchConvexUsername = internalMutation({
  args: { userId: v.string(), username: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId as Id<"users">, { username: args.username });
  },
});

/**
 * Internal action: finalise team membership for a user created via manual
 * password flow. Prevents duplicate membership, derives a username, mirrors
 * the user to Supabase, then inserts the team_memberships row directly into
 * Supabase (primary store post-migration).
 *
 * Converted from internalMutation so it can reach Supabase for the authoritative
 * duplicate-membership check and username-uniqueness scan. The user is read from
 * Convex (via _getConvexUser) because createAccount has just written it there and
 * the Supabase mirror has not yet run.
 */
export const _finalisePasswordUser = internalAction({
  args: {
    userId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    organizationId: v.id("organizations"),
    teamRole: v.union(v.literal("admin"), v.literal("member"), v.literal("viewer")),
    invitedBy: v.string(),
    // Set to true when the user row already exists in Supabase (existing-user
    // linking path). Skips writeUserToSupabase to avoid a redundant write that
    // could overwrite created_at with Convex _creationTime.
    userAlreadyInSupabase: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();

    // Duplicate-membership guard — Supabase is authoritative post-migration.
    const existing = await db
      .query("teamMemberships")
      .eq("organizationId", String(args.organizationId))
      .eq("userId", args.userId)
      .first();
    if (existing) {
      throw new Error("Ten użytkownik jest już członkiem tej organizacji.");
    }

    const now = Date.now();

    // New-account path only: the user was just created by Convex auth (createAccount)
    // and is not yet mirrored to Supabase. Derive a username, patch the Convex
    // record, then mirror to Supabase. Skipped for existing-user paths
    // (userAlreadyInSupabase=true) where userId is a Supabase UUID that cannot
    // be resolved via ctx.db.get(), and the Supabase record already exists.
    if (!args.userAlreadyInSupabase) {
      const user = await ctx.runQuery(internal.gabinet.employees._getConvexUser, {
        userId: args.userId,
      });
      if (!user)
        throw new Error(
          `Convex user record missing for userId=${args.userId} (email=${args.email}). ` +
            "The account may have been provisioned outside the Convex auth flow " +
            "(e.g. direct Supabase insert). Use the employee-linking path for existing org members.",
        );

      let effectiveUsername = user.username ?? undefined;
      if (!user.username) {
        const local = args.email.split("@")[0] ?? "";
        const base = local.toLowerCase().replace(/[^a-z0-9]/g, "");
        let candidate = (base || "user").slice(0, 16);
        let suffix = 0;
        // Username uniqueness check against Supabase (authoritative post-migration).
        while ((await db.query("users").eq("username", candidate).first()) !== null) {
          suffix += 1;
          candidate = `${(base || "user").slice(0, 14)}${suffix}`;
          if (suffix > 50) break;
        }
        // Patch the Convex auth record so auth flows see the derived username.
        await ctx.runMutation(internal.gabinet.employees._patchConvexUsername, {
          userId: args.userId,
          username: candidate,
        });
        effectiveUsername = candidate;
      }

      await ctx.runAction(internal.supabase.users.writeUserToSupabase, {
        userId: args.userId,
        email: args.email,
        name: args.name,
        username: effectiveUsername,
        createdAt: Math.floor(user._creationTime),
        updatedAt: now,
      });
    }

    // Insert team membership directly into Supabase (primary store post-migration).
    await db.insert("teamMemberships", {
      organizationId: String(args.organizationId),
      userId: args.userId,
      role: args.teamRole,
      invitedBy: args.invitedBy,
      joinedAt: now,
    });

    return { userId: args.userId };
  },
});

/**
 * Admin action: create a gabinet employee account using a manually set
 * password. Creates the Convex auth account (hashed via Scrypt), team
 * membership, and gabinet_employees row in one go. No invitation email
 * is sent. The account is immediately active and the user can log in.
 *
 * Password strength is validated on the frontend; the backend only
 * enforces a minimum length of 8 characters as a safety net.
 */
export const createWithPassword = action({
  args: {
    organizationId: v.id("organizations"),
    email: v.string(),
    password: v.string(),
    teamRole: v.union(v.literal("admin"), v.literal("member"), v.literal("viewer")),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    role: gabinetEmployeeRoleValidator,
    specialization: v.optional(v.string()),
    licenseNumber: v.optional(v.string()),
    hireDate: v.optional(v.union(v.string(), v.null())),
    color: v.optional(v.string()),
    showInCalendar: v.optional(v.boolean()),
    qualifiedTreatmentIds: v.optional(v.array(v.string())),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
    customFields: v.optional(v.array(v.any())),
    locationId: v.optional(v.string()),
    locationRole: v.optional(gabinetEmployeeRoleValidator),
  },
  handler: async (ctx, args) => {
    if (args.password.length < 8) {
      throw new Error("Hasło musi mieć co najmniej 8 znaków.");
    }

    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    if (authResult.role !== "owner" && authResult.role !== "admin") {
      throw new Error("Wymagane uprawnienia administratora.");
    }
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
      organizationId: args.organizationId,
    });

    const { canAddMore, currentSeats, seatLimit } = await ctx.runAction(
      internal._helpers.seatLimits.checkSeatLimitAction,
      { organizationId: args.organizationId },
    );
    if (!canAddMore) {
      throw new Error(
        `Seat limit reached (${currentSeats}/${seatLimit}). Upgrade your plan to add more team members.`,
      );
    }

    const name =
      [args.firstName, args.lastName].filter(Boolean).join(" ") || undefined;

    const db = createSupabaseDb();
    const now = Date.now();

    // Check if a user with this email already exists before creating a new account.
    // If found, link to the existing user instead of creating a duplicate.
    const existingUserByEmail = await db.query("users").eq("email", args.email).first();

    let userId: string;
    if (existingUserByEmail) {
      const { userId: resolvedId } = await ctx.runAction(
        internal.gabinet.employees._finalisePasswordUser,
        {
          userId: String(existingUserByEmail._id),
          email: args.email,
          name: (existingUserByEmail.name as string | undefined) ?? name,
          organizationId: args.organizationId,
          teamRole: args.teamRole,
          invitedBy: String(authResult.userId),
          userAlreadyInSupabase: true,
        },
      );
      userId = resolvedId;
    } else {
      const { user } = await createAccount(ctx, {
        provider: "password",
        account: { id: args.email, secret: args.password },
        profile: { email: args.email, name },
        shouldLinkViaEmail: false,
        shouldLinkViaPhone: false,
      });

      const { userId: resolvedId } = await ctx.runAction(
        internal.gabinet.employees._finalisePasswordUser,
        {
          userId: String(user._id),
          email: args.email,
          name: user.name ?? name,
          organizationId: args.organizationId,
          teamRole: args.teamRole,
          invitedBy: String(authResult.userId),
        },
      );
      userId = resolvedId;
    }

    const existingProfile = await db
      .query("gabinetEmployees")
      .eq("organizationId", String(args.organizationId))
      .eq("userId", userId)
      .collect();
    if (existingProfile.length > 0) {
      throw new Error("Employee profile already exists for this user");
    }

    const employeeId = await db.insert("gabinetEmployees", {
      organizationId: String(args.organizationId),
      userId,
      firstName: args.firstName ?? null,
      lastName: args.lastName ?? null,
      role: args.role,
      specialization: args.specialization ?? null,
      qualifiedTreatmentIds: args.qualifiedTreatmentIds ?? [],
      licenseNumber: args.licenseNumber ?? null,
      hireDate: args.hireDate ?? null,
      isActive: true,
      color: args.color ?? null,
      notes: null,
      showInCalendar: args.showInCalendar ?? true,
      tagIds: args.tagIds ?? null,
      categoryId: args.categoryId ?? null,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    if (args.locationId) {
      try {
        await db.insert("gabinetEmployeeLocations", {
          organizationId: String(args.organizationId),
          employeeId: String(employeeId),
          locationId: args.locationId,
          isPrimary: true,
          role: args.locationRole,
          createdAt: now,
        });
      } catch (e) {
        console.error("[employees.createWithPassword] location insert failed:", e);
      }
    }

    if (args.customFields && args.customFields.length > 0) {
      for (const f of args.customFields) {
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
          console.error("[employees.createWithPassword] customField insert failed:", e);
        }
      }
    }

    try {
      await ctx.runMutation(internal.gabinet.employees._createSideEffects, {
        employeeId: String(employeeId),
        organizationId: args.organizationId,
        createdBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
      });
    } catch (e) {
      console.error("[employees.createWithPassword] side effects failed:", e);
    }

    await ctx.runMutation(internal.gabinet.employees._upsertMembership, {
      organizationId: args.organizationId,
      userId,
      gabinetRole: args.role,
      isActive: true,
    });

    return String(employeeId);
  },
});

export const changeEmployeePassword = action({
  args: {
    organizationId: v.id("organizations"),
    employeeId: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    if (authResult.role !== "owner" && authResult.role !== "admin") {
      throw new Error("Wymagane uprawnienia administratora.");
    }
    if (args.newPassword.length < 8) {
      throw new Error("Hasło musi mieć co najmniej 8 znaków.");
    }
    const db = createSupabaseDb();
    const employee = await db.get("gabinetEmployees", args.employeeId);
    if (!employee) throw new Error("Pracownik nie istnieje.");
    if (!employee.userId) throw new Error("Pracownik nie ma powiązanego konta użytkownika.");
    const userRow = await db.get("users", String(employee.userId));
    const email = userRow?.email ?? null;
    if (!email) throw new Error("Nie znaleziono adresu e-mail użytkownika.");
    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: email, secret: args.newPassword },
    });

    try {
      await ctx.runMutation(internal.gabinet.employees._changePasswordSideEffects, {
        employeeId: args.employeeId,
        organizationId: args.organizationId,
        changedBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
      });
    } catch (e) {
      console.error("[employees.changeEmployeePassword] side effects failed:", e);
    }
  },
});

export const _changePasswordSideEffects = internalMutation({
  args: {
    employeeId: v.string(),
    organizationId: v.id("organizations"),
    changedBy: v.string(),
    actorLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const changedByUserId = args.changedBy as Id<"users">;

    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: changedByUserId,
      action: "employee_password_changed",
      entityType: "gabinetEmployee",
      entityId: args.employeeId,
      details: `Changed employee account password`,
    });
  },
});

// Creates a Gabinet employee profile for a user who already has an account.
// If the user is not yet a member of the organisation, membership is created
// automatically (no invitation email required). If membership already exists,
// the existing record is reused — duplicates are never created.
// Throws "No user account found" when the email is unknown, so callers can
// fall back to createInvitation for genuinely new users.
export const createForExistingMember = action({
  args: {
    organizationId: v.id("organizations"),
    email: v.string(),
    teamRole: v.optional(v.union(v.literal("admin"), v.literal("member"), v.literal("viewer"))),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    role: gabinetEmployeeRoleValidator,
    specialization: v.optional(v.string()),
    licenseNumber: v.optional(v.string()),
    color: v.optional(v.string()),
    showInCalendar: v.optional(v.boolean()),
    qualifiedTreatmentIds: v.optional(v.array(v.string())),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
    customFields: v.optional(v.array(v.any())),
    locationId: v.optional(v.string()),
    locationRole: v.optional(gabinetEmployeeRoleValidator),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runAction(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_employees",
      action: "create",
    }).then((perm: { allowed: boolean; scope: string }) => {
      if (!perm.allowed) throw new Error("Permission denied");
    });

    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);

    const user = await db.query("users").eq("email", args.email).first();
    if (!user) {
      throw new Error("No user account found for this email address.");
    }

    const membership = await db
      .query("teamMemberships")
      .eq("organizationId", orgIdStr)
      .eq("userId", String(user._id))
      .first();

    if (!membership) {
      // User has an account but is not yet an org member — create membership now.
      const { canAddMore, currentSeats, seatLimit } = await ctx.runAction(
        internal._helpers.seatLimits.checkSeatLimitAction,
        { organizationId: args.organizationId },
      );
      if (!canAddMore) {
        throw new Error(
          `Seat limit reached (${currentSeats}/${seatLimit}). Upgrade your plan to add more team members.`,
        );
      }
      await db.insert("teamMemberships", {
        organizationId: orgIdStr,
        userId: String(user._id),
        role: args.teamRole ?? "member",
        invitedBy: String(authResult.userId),
        joinedAt: Date.now(),
      });
    }

    await ctx.runAction(internal.gabinet.employees._createFromInvitation, {
      organizationId: args.organizationId,
      userId: String(user._id),
      invitedBy: String(authResult.userId),
      data: {
        firstName: args.firstName,
        lastName: args.lastName,
        role: args.role,
        specialization: args.specialization,
        licenseNumber: args.licenseNumber,
        color: args.color,
        showInCalendar: args.showInCalendar,
        qualifiedTreatmentIds: args.qualifiedTreatmentIds,
        tagIds: args.tagIds,
        categoryId: args.categoryId,
        customFields: args.customFields,
        locationId: args.locationId,
        locationRole: args.locationRole,
      },
    });
  },
});
