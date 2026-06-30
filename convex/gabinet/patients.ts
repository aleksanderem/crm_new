import { action, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { logActivity } from "../_helpers/activities";
import { logAudit } from "../auditLog";
import { logError } from "../_helpers/logged";
import type { GabinetPatientRow, SupabasePaginationResult } from "../_helpers/supabaseRows";
import { Id } from "../_generated/dataModel";

// Dual-write refs removed — Supabase is now primary for patient writes

export const list = action({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<SupabasePaginationResult<GabinetPatientRow>> => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const perm = await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_patients",
      action: "view",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);
    const userIdStr = String(authResult.userId);

    const pageSize = args.paginationOpts?.numItems ?? 50;
    const cursorStr = args.paginationOpts?.cursor ?? null;
    const offset = cursorStr && /^\d+$/.test(cursorStr) ? parseInt(cursorStr, 10) : 0;

    // For "own" scope, resolve the set of patient IDs the employee can see
    // via their appointments before applying the paged query.
    let ownPatientIds: string[] | null = null;
    if (perm.scope === "own") {
      const ownAppts = (await db
        .query("gabinetAppointments")
        .eq("organizationId", orgIdStr)
        .eq("employeeId", userIdStr)
        .collect()) as Array<{ patientId: unknown }>;
      ownPatientIds = [...new Set(ownAppts.map((a) => String(a.patientId)))];
      if (ownPatientIds.length === 0) {
        return { page: [], isDone: true, continueCursor: "" };
      }
    }

    let query = db
      .query("gabinetPatients")
      .eq("organizationId", orgIdStr)
      .order("createdAt", false);

    if (ownPatientIds !== null) {
      query = query.in("id", ownPatientIds);
    }

    if (args.search?.trim()) {
      for (const token of args.search.trim().split(/\s+/).filter(Boolean)) {
        const pattern = `%${token}%`;
        query = query.or(
          `first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`,
        );
      }
    }

    query = query.range(offset, offset + pageSize - 1);
    const page = (await query.collect()) as GabinetPatientRow[];
    const isDone = page.length < pageSize;
    return { page, isDone, continueCursor: isDone ? "" : String(offset + pageSize) };
  },
});

const PREDEFINED_REFERRAL_SOURCES = new Set([
  "facebook",
  "patientReferral",
  "passerby",
  "pressAd",
  "internetAd",
  "billboard",
  "flyerBanner",
  "groupBuying",
  "other",
]);

export const listCustomReferralSources = action({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args): Promise<string[]> => {
    const authResult = await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const perm = await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_patients",
      action: "view",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) return [];

    const db = createSupabaseDb();
    const client = db.raw();
    const orgIdStr = String(args.organizationId);

    let sourceQuery = client
      .from("gabinet_patients")
      .select("referral_source")
      .eq("organization_id", orgIdStr)
      .not("referral_source", "is", null);

    if (perm.scope === "own") {
      const userIdStr = String(authResult.userId);
      const ownAppts = (await db
        .query("gabinetAppointments")
        .eq("organizationId", orgIdStr)
        .eq("employeeId", userIdStr)
        .collect()) as Array<{ patientId: unknown }>;
      const ownPatientIds = [...new Set(ownAppts.map((a) => String(a.patientId)))];
      if (ownPatientIds.length === 0) return [];
      sourceQuery = sourceQuery.in("id", ownPatientIds);
    }

    const { data, error } = await sourceQuery;
    if (error) throw new Error(`listCustomReferralSources: ${error.message}`);

    const seen = new Set<string>();
    const custom: string[] = [];
    for (const row of data ?? []) {
      const raw = (row as { referral_source: unknown }).referral_source;
      if (typeof raw !== "string") continue;
      const trimmed = raw.trim();
      if (!trimmed) continue;
      if (PREDEFINED_REFERRAL_SOURCES.has(trimmed)) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      custom.push(trimmed);
    }
    custom.sort((a, b) => a.localeCompare(b));
    return custom;
  },
});

export const getById = action({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.string(),
  },
  handler: async (ctx, args): Promise<GabinetPatientRow> => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const perm = await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_patients",
      action: "view",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const patient = (await db.get("gabinetPatients", args.patientId)) as GabinetPatientRow | null;
    if (!patient || String(patient.organizationId) !== String(args.organizationId)) {
      throw new Error("Patient not found");
    }
    if (perm.scope === "own") {
      const hasAppt = await db
        .query("gabinetAppointments")
        .eq("organizationId", String(args.organizationId))
        .eq("employeeId", String(authResult.userId))
        .eq("patientId", args.patientId)
        .first();
      if (!hasAppt) throw new Error("Permission denied: you can only view your own records");
    }

    return patient;
  },
});

export const searchUnlinkedContacts = action({
  args: {
    organizationId: v.id("organizations"),
    search: v.string(),
  },
  handler: async (ctx, args): Promise<Array<{
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  }>> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const perm = await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "contacts",
      action: "view",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) return [];

    if (!args.search.trim()) return [];
    const term = args.search.trim().toLowerCase();

    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);

    const allContacts = (await db
      .query("contacts")
      .eq("organizationId", orgIdStr)
      .collect()) as Array<Record<string, any>>;
    const matched = allContacts.filter((c) => {
      const fn = String(c.firstName ?? "").toLowerCase();
      const ln = String(c.lastName ?? "").toLowerCase();
      const em = String(c.email ?? "").toLowerCase();
      const ph = String(c.phone ?? "").toLowerCase();
      return fn.includes(term) || ln.includes(term) || em.includes(term) || ph.includes(term);
    }).slice(0, 20);

    const linkedPatients = (await db
      .query("gabinetPatients")
      .eq("organizationId", orgIdStr)
      .collect()) as Array<Record<string, any>>;

    const linkedContactIds = new Set(
      linkedPatients
        .filter((p) => p.contactId)
        .map((p) => String(p.contactId))
    );

    return matched
      .filter((c) => !linkedContactIds.has(String(c.id ?? c._id)))
      .map((c) => ({
        _id: String(c.id ?? c._id),
        firstName: String(c.firstName ?? ""),
        lastName: String(c.lastName ?? ""),
        email: String(c.email ?? ""),
        phone: String(c.phone ?? ""),
      }));
  },
});

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    contactId: v.optional(v.union(v.string(), v.null())),
    firstName: v.string(),
    lastName: v.string(),
    pesel: v.optional(v.union(v.string(), v.null())),
    dateOfBirth: v.optional(v.union(v.string(), v.null())),
    gender: v.optional(v.union(v.literal("male"), v.literal("female"), v.literal("other"), v.null())),
    email: v.string(),
    phone: v.optional(v.union(v.string(), v.null())),
    address: v.optional(v.union(v.object({
      street: v.optional(v.string()),
      city: v.optional(v.string()),
      postalCode: v.optional(v.string()),
    }), v.null())),
    medicalNotes: v.optional(v.union(v.string(), v.null())),
    allergies: v.optional(v.union(v.string(), v.null())),
    bloodType: v.optional(v.union(v.string(), v.null())),
    emergencyContactName: v.optional(v.union(v.string(), v.null())),
    emergencyContactPhone: v.optional(v.union(v.string(), v.null())),
    referralSource: v.optional(v.union(v.string(), v.null())),
    referredByPatientId: v.optional(v.union(v.string(), v.null())),
    preferredLocationId: v.optional(v.union(v.string(), v.null())),
    tags: v.optional(v.array(v.string())),
    customFields: v.optional(v.any()),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    try {
    // --- Auth + permissions (via internal queries) ---
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_patients",
      action: "create",
    }).then((perm: { allowed: boolean; scope: string }) => {
      if (!perm.allowed) throw new Error("Permission denied");
    });

    const now = Date.now();
    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);

    // Duplicate guard: reject creation if an active patient in this org
    // already has the same email or phone. Two queries to keep the in-memory
    // test stub compatible (it has no OR filter support).
    const [emailDupes, phoneDupes] = await Promise.all([
      (db
        .query("gabinetPatients")
        .eq("organizationId", orgIdStr)
        .eq("isActive", true)
        .eq("email", args.email)
        .collect()) as Promise<Array<{ _id: unknown }>>,
      args.phone
        ? (db
            .query("gabinetPatients")
            .eq("organizationId", orgIdStr)
            .eq("isActive", true)
            .eq("phone", args.phone)
            .collect()) as Promise<Array<{ _id: unknown }>>
        : Promise.resolve([] as Array<{ _id: unknown }>),
    ]);

    const duplicateIds = [
      ...new Set([
        ...emailDupes.map((p) => String(p._id)),
        ...phoneDupes.map((p) => String(p._id)),
      ]),
    ];

    if (duplicateIds.length > 0) {
      throw new Error(
        `Duplicate patient detected. Existing patient IDs: ${duplicateIds.join(",")}`,
      );
    }

    // --- INSERT patient directly to Supabase ---
    const patientId = await db.insert("gabinetPatients", {
      organizationId: String(args.organizationId),
      contactId: args.contactId ?? null,
      firstName: args.firstName,
      lastName: args.lastName,
      pesel: args.pesel ?? null,
      dateOfBirth: args.dateOfBirth ?? null,
      gender: args.gender ?? null,
      email: args.email,
      phone: args.phone ?? null,
      address: args.address ?? null,
      medicalNotes: args.medicalNotes ?? null,
      allergies: args.allergies ?? null,
      bloodType: args.bloodType ?? null,
      emergencyContactName: args.emergencyContactName ?? null,
      emergencyContactPhone: args.emergencyContactPhone ?? null,
      referralSource: args.referralSource ?? null,
      referredByPatientId: args.referredByPatientId ?? null,
      preferredLocationId: args.preferredLocationId ?? null,
      isActive: true,
      tags: args.tags ?? null,
      customFields: args.customFields ?? null,
      tagIds: args.tagIds ?? null,
      categoryId: args.categoryId ?? null,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    // --- Delegate post-write side effects ---
    try {
      await ctx.runMutation(internal.gabinet.patients._createSideEffects, {
        patientId,
        organizationId: args.organizationId,
        contactId: args.contactId ?? undefined,
        firstName: args.firstName,
        lastName: args.lastName,
        email: args.email,
        phone: args.phone ?? undefined,
        referralSource: args.referralSource ?? undefined,
        createdBy: String(authResult.userId),
        createdAt: now,
      });
    } catch (e) {
      console.error("[patients.create] Side effects FAILED for patient", patientId, ":", e);
    }

    return patientId;
    } catch (err) {
      await logError(ctx, err, {
        scope: "gabinet.patients",
        fnName: "create",
        argsJson: JSON.stringify({
          organizationId: args.organizationId,
          contactId: args.contactId,
          firstName: args.firstName,
          lastName: args.lastName,
          email: args.email,
          phone: args.phone,
          pesel: args.pesel,
          dateOfBirth: args.dateOfBirth,
          gender: args.gender,
          hasAddress: !!args.address,
          tagsCount: args.tags?.length,
          tagIdsCount: args.tagIds?.length,
          categoryId: args.categoryId,
        }),
        organizationId: args.organizationId,
      });
      throw err;
    }
  },
});

export const _createSideEffects = internalMutation({
  args: {
    patientId: v.string(),
    organizationId: v.id("organizations"),
    contactId: v.optional(v.string()),
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    referralSource: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    const createdByUserId = args.createdBy as Id<"users">;

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetPatient",
      entityId: args.patientId as Id<"gabinetPatients">,
      action: "created",
      description: `Created patient ${args.firstName} ${args.lastName}`,
      performedBy: createdByUserId,
    });

    await ctx.runMutation(internal.automation.emitEvent, {
      organizationId: args.organizationId,
      module: "gabinet",
      eventType: "gabinet.patient.created",
      entityType: "gabinetPatient",
      entityId: args.patientId,
      actorUserId: createdByUserId,
      correlationKey: `patient:${args.patientId}`,
      eventIdempotencyKey: `automation-event:${args.organizationId}:${args.patientId}:created`,
      payload: JSON.stringify({
        organizationId: String(args.organizationId),
        patientId: args.patientId,
        contactId: args.contactId,
        firstName: args.firstName,
        lastName: args.lastName,
        patientName: `${args.firstName}${args.lastName ? ` ${args.lastName}` : ""}`,
        patientEmail: args.email,
        patientPhone: args.phone,
        referralSource: args.referralSource,
        createdBy: args.createdBy,
      }),
      occurredAt: args.createdAt,
    });
  },
});

export const update = action({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.string(),
    contactId: v.optional(v.union(v.string(), v.null())),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    pesel: v.optional(v.union(v.string(), v.null())),
    dateOfBirth: v.optional(v.union(v.string(), v.null())),
    gender: v.optional(v.union(v.literal("male"), v.literal("female"), v.literal("other"), v.null())),
    email: v.optional(v.string()),
    phone: v.optional(v.union(v.string(), v.null())),
    address: v.optional(v.union(v.object({
      street: v.optional(v.string()),
      city: v.optional(v.string()),
      postalCode: v.optional(v.string()),
    }), v.null())),
    medicalNotes: v.optional(v.union(v.string(), v.null())),
    allergies: v.optional(v.union(v.string(), v.null())),
    bloodType: v.optional(v.union(v.string(), v.null())),
    emergencyContactName: v.optional(v.union(v.string(), v.null())),
    emergencyContactPhone: v.optional(v.union(v.string(), v.null())),
    referralSource: v.optional(v.union(v.string(), v.null())),
    referredByPatientId: v.optional(v.union(v.string(), v.null())),
    preferredLocationId: v.optional(v.union(v.string(), v.null())),
    tags: v.optional(v.array(v.string())),
    customFields: v.optional(v.any()),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    try {
    // --- Auth + permissions (via internal queries) ---
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "gabinet_patients",
        action: "edit",
      },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    // --- Read patient from Supabase ---
    const patient = await db.get("gabinetPatients", args.patientId);
    if (!patient || String(patient.organizationId) !== String(args.organizationId)) {
      throw new Error("Patient not found");
    }
    if (perm.scope === "own") {
      const hasAppt = await db
        .query("gabinetAppointments")
        .eq("organizationId", String(args.organizationId))
        .eq("employeeId", String(authResult.userId))
        .eq("patientId", args.patientId)
        .first();
      if (!hasAppt) throw new Error("Permission denied: you can only edit your own records");
    }

    // --- Build updates and PATCH to Supabase ---
    const { organizationId, patientId, ...updates } = args;
    await db.patch("gabinetPatients", patientId, { ...updates, updatedAt: Date.now() });

    // --- Delegate post-write side effects ---
    try {
      await ctx.runMutation(internal.gabinet.patients._updateSideEffects, {
        patientId,
        organizationId,
        firstName: (patient.firstName as string) ?? "",
        lastName: (patient.lastName as string) ?? "",
        updatedBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[patients.update] Side effects FAILED for patient", patientId, ":", e);
    }

    return patientId;
    } catch (err) {
      await logError(ctx, err, {
        scope: "gabinet.patients",
        fnName: "update",
        argsJson: JSON.stringify({
          organizationId: args.organizationId,
          patientId: args.patientId,
          updatedFields: Object.keys(args).filter(
            (k) => k !== "organizationId" && k !== "patientId",
          ),
          tagsCount: args.tags?.length,
          tagIdsCount: args.tagIds?.length,
        }),
        organizationId: args.organizationId,
      });
      throw err;
    }
  },
});

export const _updateSideEffects = internalMutation({
  args: {
    patientId: v.string(),
    organizationId: v.id("organizations"),
    firstName: v.string(),
    lastName: v.string(),
    updatedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const updatedByUserId = args.updatedBy as Id<"users">;

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetPatient",
      entityId: args.patientId as Id<"gabinetPatients">,
      action: "updated",
      description: `Updated patient ${args.firstName} ${args.lastName}`,
      performedBy: updatedByUserId,
    });
  },
});

export const remove = action({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.string(),
  },
  handler: async (ctx, args) => {
    // --- Auth + permissions (via internal queries) ---
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "gabinet_patients",
        action: "delete",
      },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    // --- Read patient from Supabase ---
    const patient = await db.get("gabinetPatients", args.patientId);
    if (!patient || String(patient.organizationId) !== String(args.organizationId)) {
      throw new Error("Patient not found");
    }
    if (perm.scope === "own") {
      const hasAppt = await db
        .query("gabinetAppointments")
        .eq("organizationId", String(args.organizationId))
        .eq("employeeId", String(authResult.userId))
        .eq("patientId", args.patientId)
        .first();
      if (!hasAppt) throw new Error("Permission denied: you can only delete your own records");
    }

    // --- Soft-delete: PATCH isActive=false in Supabase ---
    await db.patch("gabinetPatients", args.patientId, {
      isActive: false,
      updatedAt: Date.now(),
    });

    // --- Delegate post-write side effects ---
    try {
      await ctx.runMutation(internal.gabinet.patients._removeSideEffects, {
        patientId: args.patientId,
        organizationId: args.organizationId,
        firstName: (patient.firstName as string) ?? "",
        lastName: (patient.lastName as string) ?? "",
        deletedBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[patients.remove] Side effects FAILED for patient", args.patientId, ":", e);
    }

    return args.patientId;
  },
});

export const _removeSideEffects = internalMutation({
  args: {
    patientId: v.string(),
    organizationId: v.id("organizations"),
    firstName: v.string(),
    lastName: v.string(),
    deletedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const deletedByUserId = args.deletedBy as Id<"users">;

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetPatient",
      entityId: args.patientId as Id<"gabinetPatients">,
      action: "deleted",
      description: `Deleted patient ${args.firstName} ${args.lastName}`,
      performedBy: deletedByUserId,
    });
  },
});

export const merge = action({
  args: {
    organizationId: v.id("organizations"),
    targetPatientId: v.string(),
    sourcePatientId: v.string(),
    // Per-field overrides to apply to the target patient before deactivating
    // the source. Only fields where the user picked the source-side value need
    // to be sent; missing keys mean "keep the target's current value".
    fieldOverrides: v.optional(
      v.object({
        firstName: v.optional(v.string()),
        lastName: v.optional(v.string()),
        email: v.optional(v.string()),
        phone: v.optional(v.union(v.string(), v.null())),
        pesel: v.optional(v.union(v.string(), v.null())),
        dateOfBirth: v.optional(v.union(v.string(), v.null())),
        gender: v.optional(
          v.union(
            v.literal("male"),
            v.literal("female"),
            v.literal("other"),
            v.null(),
          ),
        ),
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
        allergies: v.optional(v.union(v.string(), v.null())),
        bloodType: v.optional(v.union(v.string(), v.null())),
        emergencyContactName: v.optional(v.union(v.string(), v.null())),
        emergencyContactPhone: v.optional(v.union(v.string(), v.null())),
        medicalNotes: v.optional(v.union(v.string(), v.null())),
        referralSource: v.optional(v.union(v.string(), v.null())),
      }),
    ),
  },
  handler: async (ctx, args): Promise<{
    movedAppointments: number;
    movedDocuments: number;
    movedPackageUsage: number;
    movedLoyaltyTransactions: number;
    movedPayments: number;
    movedNotes: number;
    movedActivities: number;
    movedRelationships: number;
    movedPortalSessions: number;
    movedSmsEvents: number;
    movedReferrals: number;
    movedBookedBy: number;
    consolidatedLoyaltyBalance: number;
  }> => {
    if (args.targetPatientId === args.sourcePatientId) {
      throw new Error("Cannot merge a patient with itself");
    }

    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "gabinet_patients",
        action: "delete",
      },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);

    const [target, source] = await Promise.all([
      db.get("gabinetPatients", args.targetPatientId),
      db.get("gabinetPatients", args.sourcePatientId),
    ]);
    if (!target || String(target.organizationId) !== orgIdStr) {
      throw new Error("Target patient not found");
    }
    if (!source || String(source.organizationId) !== orgIdStr) {
      throw new Error("Source patient not found");
    }
    if (perm.scope === "own") {
      const userIdStr = String(authResult.userId);
      const [hasTargetAppt, hasSourceAppt] = await Promise.all([
        db.query("gabinetAppointments").eq("organizationId", orgIdStr).eq("employeeId", userIdStr).eq("patientId", args.targetPatientId).first(),
        db.query("gabinetAppointments").eq("organizationId", orgIdStr).eq("employeeId", userIdStr).eq("patientId", args.sourcePatientId).first(),
      ]);
      if (!hasTargetAppt || !hasSourceAppt) {
        throw new Error("Permission denied: you can only merge your own records");
      }
    }

    const client = db.raw();

    async function reassignByColumn(
      table: string,
      column: string,
    ): Promise<number> {
      const { data, error } = await client
        .from(table)
        .update({ [column]: args.targetPatientId })
        .eq("organization_id", orgIdStr)
        .eq(column, args.sourcePatientId)
        .select("id");
      if (error) {
        throw new Error(`merge: failed updating ${table}.${column}: ${error.message}`);
      }
      return data?.length ?? 0;
    }

    // Bulk reassign foreign keys pointing at the source patient over to the target.
    const movedAppointments = await reassignByColumn("gabinet_appointments", "patient_id");
    const movedBookedBy = await reassignByColumn("gabinet_appointments", "booked_by_patient_id");
    const movedDocuments = await reassignByColumn("gabinet_documents", "patient_id");
    const movedPackageUsage = await reassignByColumn("gabinet_package_usage", "patient_id");
    const movedLoyaltyTransactions = await reassignByColumn(
      "gabinet_loyalty_transactions",
      "patient_id",
    );
    const movedPayments = await reassignByColumn("payments", "patient_id");
    const movedPortalSessions = await reassignByColumn(
      "gabinet_portal_sessions",
      "patient_id",
    );
    const movedSmsEvents = await reassignByColumn(
      "appointment_sms_events",
      "patient_id",
    );
    const movedReferrals = await reassignByColumn(
      "gabinet_patients",
      "referred_by_patient_id",
    );

    // Polymorphic reassignment: activities/notes/object_relationships scope by
    // entity_type so we filter on both the type discriminator and the patient id.
    async function reassignPolymorphic(
      table: string,
      typeColumn: string,
      idColumn: string,
      entityType: string,
    ): Promise<number> {
      const { data, error } = await client
        .from(table)
        .update({ [idColumn]: args.targetPatientId })
        .eq("organization_id", orgIdStr)
        .eq(typeColumn, entityType)
        .eq(idColumn, args.sourcePatientId)
        .select("id");
      if (error) {
        throw new Error(
          `merge: failed updating ${table}.${idColumn} (type=${entityType}): ${error.message}`,
        );
      }
      return data?.length ?? 0;
    }

    const movedNotes = await reassignPolymorphic(
      "notes",
      "entity_type",
      "entity_id",
      "gabinetPatient",
    );
    const movedActivities = await reassignPolymorphic(
      "activities",
      "entity_type",
      "entity_id",
      "gabinetPatient",
    );
    const movedRelationshipsSource = await reassignPolymorphic(
      "object_relationships",
      "source_type",
      "source_id",
      "gabinetPatient",
    );
    const movedRelationshipsTarget = await reassignPolymorphic(
      "object_relationships",
      "target_type",
      "target_id",
      "gabinetPatient",
    );
    const movedRelationships = movedRelationshipsSource + movedRelationshipsTarget;

    // Loyalty points have a unique (organization_id, patient_id) constraint, so
    // we can't reassign a source row onto an existing target row. Read both,
    // sum the balances onto the target (or just rename the source row if the
    // target has none), then delete the source row.
    const [targetLoyalty, sourceLoyalty] = await Promise.all([
      db
        .query("gabinetLoyaltyPoints")
        .eq("organizationId", orgIdStr)
        .eq("patientId", args.targetPatientId)
        .first(),
      db
        .query("gabinetLoyaltyPoints")
        .eq("organizationId", orgIdStr)
        .eq("patientId", args.sourcePatientId)
        .first(),
    ]);

    let consolidatedLoyaltyBalance = 0;
    if (sourceLoyalty) {
      const sBalance = Number(sourceLoyalty.balance ?? 0);
      const sEarned = Number(sourceLoyalty.lifetimeEarned ?? 0);
      const sSpent = Number(sourceLoyalty.lifetimeSpent ?? 0);
      if (targetLoyalty) {
        const newBalance = Number(targetLoyalty.balance ?? 0) + sBalance;
        await db.patch("gabinetLoyaltyPoints", String(targetLoyalty._id), {
          balance: newBalance,
          lifetimeEarned: Number(targetLoyalty.lifetimeEarned ?? 0) + sEarned,
          lifetimeSpent: Number(targetLoyalty.lifetimeSpent ?? 0) + sSpent,
          updatedAt: Date.now(),
        });
        await db.delete("gabinetLoyaltyPoints", String(sourceLoyalty._id));
        consolidatedLoyaltyBalance = newBalance;
      } else {
        await db.patch("gabinetLoyaltyPoints", String(sourceLoyalty._id), {
          patientId: args.targetPatientId,
          updatedAt: Date.now(),
        });
        consolidatedLoyaltyBalance = sBalance;
      }
    } else if (targetLoyalty) {
      consolidatedLoyaltyBalance = Number(targetLoyalty.balance ?? 0);
    }

    // Apply the user's per-field choices to the target before deactivating
    // the source — the target is the row that survives the merge.
    if (args.fieldOverrides && Object.keys(args.fieldOverrides).length > 0) {
      await db.patch("gabinetPatients", args.targetPatientId, {
        ...args.fieldOverrides,
        updatedAt: Date.now(),
      });
    }

    // Soft-delete the source patient and annotate why it was deactivated.
    const now = Date.now();
    const sourceNotesPrefix = `[Merged into patient ${args.targetPatientId} at ${new Date(now).toISOString()}]`;
    const existingNotes = (source.medicalNotes as string | null | undefined) ?? "";
    await db.patch("gabinetPatients", args.sourcePatientId, {
      isActive: false,
      medicalNotes: existingNotes ? `${sourceNotesPrefix}\n${existingNotes}` : sourceNotesPrefix,
      updatedAt: now,
    });

    try {
      await ctx.runMutation(internal.gabinet.patients._mergeSideEffects, {
        organizationId: args.organizationId,
        targetPatientId: args.targetPatientId,
        sourcePatientId: args.sourcePatientId,
        targetName: `${target.firstName ?? ""} ${target.lastName ?? ""}`.trim(),
        sourceName: `${source.firstName ?? ""} ${source.lastName ?? ""}`.trim(),
        performedBy: String(authResult.userId),
      });
    } catch (e) {
      console.error(
        "[patients.merge] Side effects FAILED for target/source",
        args.targetPatientId,
        args.sourcePatientId,
        ":",
        e,
      );
    }

    return {
      movedAppointments,
      movedDocuments,
      movedPackageUsage,
      movedLoyaltyTransactions,
      movedPayments,
      movedNotes,
      movedActivities,
      movedRelationships,
      movedPortalSessions,
      movedSmsEvents,
      movedReferrals,
      movedBookedBy,
      consolidatedLoyaltyBalance,
    };
  },
});

export const _mergeSideEffects = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    targetPatientId: v.string(),
    sourcePatientId: v.string(),
    targetName: v.string(),
    sourceName: v.string(),
    performedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const performedByUserId = args.performedBy as Id<"users">;

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetPatient",
      entityId: args.targetPatientId as Id<"gabinetPatients">,
      action: "updated",
      description: `Scalono klienta "${args.sourceName}" do "${args.targetName}"`,
      metadata: {
        merge: { sourcePatientId: args.sourcePatientId },
      },
      performedBy: performedByUserId,
    });

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetPatient",
      entityId: args.sourcePatientId as Id<"gabinetPatients">,
      action: "deleted",
      description: `Klient scalony do "${args.targetName}"`,
      metadata: {
        merge: { targetPatientId: args.targetPatientId },
      },
      performedBy: performedByUserId,
    });
  },
});

export const gdprErase = action({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });

    if (authResult.role !== "owner" && authResult.role !== "admin") {
      throw new Error("Permission denied: GDPR erasure requires owner or admin role");
    }

    const db = createSupabaseDb();
    const patient = (await db.get("gabinetPatients", args.patientId)) as GabinetPatientRow | null;
    if (!patient || String(patient.organizationId) !== String(args.organizationId)) {
      throw new Error("Patient not found");
    }

    const originalName = `${patient.firstName ?? ""} ${patient.lastName ?? ""}`.trim();
    const anonSuffix = args.patientId.slice(-6).toUpperCase();

    // Anonymize all PII fields; keep the row for referential integrity
    // (appointments, payments, documents still reference this patient ID)
    await db.patch("gabinetPatients", args.patientId, {
      firstName: "ANONIMOWY",
      lastName: `#${anonSuffix}`,
      email: `deleted-${anonSuffix}@gdpr.invalid`,
      phone: null,
      pesel: null,
      dateOfBirth: null,
      address: null,
      medicalNotes: null,
      allergies: null,
      bloodType: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      referralSource: null,
      referredByPatientId: null,
      contactId: null,
      tags: null,
      tagIds: null,
      categoryId: null,
      customFields: null,
      isActive: false,
      updatedAt: Date.now(),
    });

    // Hard-delete portal sessions (patient login credentials)
    const client = db.raw();
    await client
      .from("gabinet_portal_sessions")
      .delete()
      .eq("organization_id", String(args.organizationId))
      .eq("patient_id", args.patientId);

    try {
      await ctx.runMutation(internal.gabinet.patients._gdprEraseSideEffects, {
        patientId: args.patientId,
        organizationId: args.organizationId,
        originalName,
        erasedBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[patients.gdprErase] Side effects FAILED for patient", args.patientId, ":", e);
    }

    return args.patientId;
  },
});

export const _gdprEraseSideEffects = internalMutation({
  args: {
    patientId: v.string(),
    organizationId: v.id("organizations"),
    originalName: v.string(),
    erasedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const erasedByUserId = args.erasedBy as Id<"users">;

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetPatient",
      entityId: args.patientId as Id<"gabinetPatients">,
      action: "deleted",
      description: `RODO: usunięto dane klienta "${args.originalName}"`,
      performedBy: erasedByUserId,
    });

    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: erasedByUserId,
      action: "gdpr_patient_erased",
      entityType: "gabinetPatient",
      entityId: args.patientId,
      details: `GDPR erasure performed on patient "${args.originalName}" (ID: ${args.patientId})`,
    });
  },
});

export const getByContact = action({
  args: {
    organizationId: v.id("organizations"),
    contactId: v.string(),
  },
  handler: async (ctx, args): Promise<GabinetPatientRow[]> => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const perm = await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_patients",
      action: "view",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    let results = (await db
      .query("gabinetPatients")
      .eq("organizationId", String(args.organizationId))
      .eq("contactId", String(args.contactId))
      .collect()) as GabinetPatientRow[];

    if (perm.scope === "own") {
      const ownAppts = (await db
        .query("gabinetAppointments")
        .eq("organizationId", String(args.organizationId))
        .eq("employeeId", String(authResult.userId))
        .collect()) as Array<{ patientId: unknown }>;
      const ownPatientIds = new Set(ownAppts.map((a) => String(a.patientId)));
      results = results.filter((r) => ownPatientIds.has(String(r._id)));
    }
    return results;
  },
});
