import { action, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { logActivity } from "../_helpers/activities";
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
    const perm = await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_patients",
      action: "view",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);
    const userIdStr = String(authResult.userId);

    if (args.search) {
      const term = args.search.trim().toLowerCase();
      let results = (await db
        .query("gabinetPatients")
        .eq("organizationId", orgIdStr)
        .collect()) as GabinetPatientRow[];
      results = results.filter((r) => {
        const fn = String(r.firstName ?? "").toLowerCase();
        const ln = String(r.lastName ?? "").toLowerCase();
        const em = String(r.email ?? "").toLowerCase();
        const ph = String(r.phone ?? "").toLowerCase();
        return fn.includes(term) || ln.includes(term) || em.includes(term) || ph.includes(term);
      }).slice(0, 50);
      if (perm.scope === "own") {
        results = results.filter((r) => String(r.createdBy) === userIdStr);
      }
      return { page: results, isDone: true, continueCursor: "" };
    }

    let page = (await db
      .query("gabinetPatients")
      .eq("organizationId", orgIdStr)
      .order("createdAt", false)
      .collect()) as GabinetPatientRow[];
    if (perm.scope === "own") {
      page = page.filter((r) => String(r.createdBy) === userIdStr);
    }
    return { page, isDone: true, continueCursor: "" };
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
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_patients",
      action: "view",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) return [];

    const db = createSupabaseDb();
    const patients = (await db
      .query("gabinetPatients")
      .eq("organizationId", String(args.organizationId))
      .collect()) as GabinetPatientRow[];

    const seen = new Set<string>();
    const custom: string[] = [];
    for (const p of patients) {
      const raw = p.referralSource;
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
    if (perm.scope === "own" && String(patient.createdBy) !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only view your own records");
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
    tags: v.optional(v.array(v.string())),
    customFields: v.optional(v.any()),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    // --- Auth + permissions (via internal queries) ---
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_patients",
      action: "create",
    }).then((perm: { allowed: boolean; scope: string }) => {
      if (!perm.allowed) throw new Error("Permission denied");
    });

    const now = Date.now();
    const db = createSupabaseDb();

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
      isActive: true,
      tags: args.tags ?? null,
      customFields: args.customFields ?? null,
      tagIds: args.tagIds ?? null,
      categoryId: args.categoryId ?? null,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    // --- Delegate Convex-only side effects ---
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
    tags: v.optional(v.array(v.string())),
    customFields: v.optional(v.any()),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    // --- Auth + permissions (via internal queries) ---
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
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
    if (perm.scope === "own" && String(patient.createdBy) !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only edit your own records");
    }

    // --- Build updates and PATCH to Supabase ---
    const { organizationId, patientId, ...updates } = args;
    await db.patch("gabinetPatients", patientId, { ...updates, updatedAt: Date.now() });

    // --- Delegate Convex-only side effects ---
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
    if (perm.scope === "own" && String(patient.createdBy) !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only delete your own records");
    }

    // --- Soft-delete: PATCH isActive=false in Supabase ---
    await db.patch("gabinetPatients", args.patientId, {
      isActive: false,
      updatedAt: Date.now(),
    });

    // --- Delegate Convex-only side effects ---
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
      results = results.filter((r) => String(r.createdBy) === String(authResult.userId));
    }
    return results;
  },
});
