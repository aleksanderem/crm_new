import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { logError } from "../_helpers/logged";
import type { GabinetEmployeeLocationRow } from "../_helpers/supabaseRows";

/** List all location assignments for an employee. */
export const listByEmployee = action({
  args: {
    organizationId: v.id("organizations"),
    employeeId: v.string(),
  },
  handler: async (ctx, args): Promise<GabinetEmployeeLocationRow[]> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_employees",
      action: "view",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    return (await db
      .query("gabinetEmployeeLocations")
      .eq("employeeId", args.employeeId)
      .collect()) as GabinetEmployeeLocationRow[];
  },
});

/** Assign an employee to a location. Idempotent — silently succeeds if the grant already exists. */
export const addLocation = action({
  args: {
    organizationId: v.id("organizations"),
    employeeId: v.string(),
    locationId: v.string(),
    isPrimary: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<string> => {
    try {
      const authResult = await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
        organizationId: args.organizationId,
      });
      await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
        organizationId: args.organizationId,
      });
      if (authResult.role !== "owner" && authResult.role !== "admin") {
        throw new Error("Admin access required");
      }
      const perm = await ctx.runQuery(internal._helpers.authAction.checkPermission, {
        organizationId: args.organizationId,
        feature: "gabinet_employees",
        action: "edit",
      }) as { allowed: boolean; scope: string };
      if (!perm.allowed) throw new Error("Permission denied");

      const db = createSupabaseDb();

      // Verify employee belongs to org.
      const emp = await db.get("gabinetEmployees", args.employeeId);
      if (!emp || String(emp.organizationId) !== String(args.organizationId)) {
        throw new Error("Employee not found");
      }

      // Verify location belongs to org.
      const loc = await db.get("gabinetLocations", args.locationId);
      if (!loc || String(loc.organizationId) !== String(args.organizationId)) {
        throw new Error("Location not found");
      }

      // Idempotency: return existing grant if already assigned.
      const existing = await db
        .query("gabinetEmployeeLocations")
        .eq("employeeId", args.employeeId)
        .eq("locationId", args.locationId)
        .first();
      if (existing) return String(existing._id);

      const makePrimary = args.isPrimary ?? false;

      // If this should become primary, clear any existing primary for this employee.
      if (makePrimary) {
        const currentPrimary = await db
          .query("gabinetEmployeeLocations")
          .eq("employeeId", args.employeeId)
          .eq("isPrimary", true)
          .first();
        if (currentPrimary) {
          await db.patch("gabinetEmployeeLocations", String(currentPrimary._id), {
            isPrimary: false,
          });
        }
      }

      const grantId = await db.insert("gabinetEmployeeLocations", {
        organizationId: String(args.organizationId),
        employeeId: args.employeeId,
        locationId: args.locationId,
        isPrimary: makePrimary,
        createdAt: Date.now(),
      });

      return grantId;
    } catch (err) {
      await logError(ctx, err, {
        scope: "gabinet.employeeLocations",
        fnName: "addLocation",
        argsJson: JSON.stringify({
          organizationId: args.organizationId,
          employeeId: args.employeeId,
          locationId: args.locationId,
          isPrimary: args.isPrimary,
        }),
        organizationId: args.organizationId,
      });
      throw err;
    }
  },
});

/** Remove an employee–location assignment. */
export const removeLocation = action({
  args: {
    organizationId: v.id("organizations"),
    employeeId: v.string(),
    locationId: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    try {
      const authResult = await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
        organizationId: args.organizationId,
      });
      await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
        organizationId: args.organizationId,
      });
      if (authResult.role !== "owner" && authResult.role !== "admin") {
        throw new Error("Admin access required");
      }
      const perm = await ctx.runQuery(internal._helpers.authAction.checkPermission, {
        organizationId: args.organizationId,
        feature: "gabinet_employees",
        action: "edit",
      }) as { allowed: boolean; scope: string };
      if (!perm.allowed) throw new Error("Permission denied");

      const db = createSupabaseDb();

      const grant = await db
        .query("gabinetEmployeeLocations")
        .eq("employeeId", args.employeeId)
        .eq("locationId", args.locationId)
        .first();

      if (!grant) return; // already removed — idempotent

      // Guard: confirm the grant belongs to the org.
      if (String(grant.organizationId) !== String(args.organizationId)) {
        throw new Error("Grant not found");
      }

      await db.delete("gabinetEmployeeLocations", String(grant._id));
    } catch (err) {
      await logError(ctx, err, {
        scope: "gabinet.employeeLocations",
        fnName: "removeLocation",
        argsJson: JSON.stringify({
          organizationId: args.organizationId,
          employeeId: args.employeeId,
          locationId: args.locationId,
        }),
        organizationId: args.organizationId,
      });
      throw err;
    }
  },
});

/**
 * Set a location as the primary for an employee.
 * Clears isPrimary on all other location assignments for that employee first,
 * then marks the target location as primary.
 * The target location must already be assigned to the employee.
 */
export const setPrimary = action({
  args: {
    organizationId: v.id("organizations"),
    employeeId: v.string(),
    locationId: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    try {
      const authResult = await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
        organizationId: args.organizationId,
      });
      await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
        organizationId: args.organizationId,
      });
      if (authResult.role !== "owner" && authResult.role !== "admin") {
        throw new Error("Admin access required");
      }
      const perm = await ctx.runQuery(internal._helpers.authAction.checkPermission, {
        organizationId: args.organizationId,
        feature: "gabinet_employees",
        action: "edit",
      }) as { allowed: boolean; scope: string };
      if (!perm.allowed) throw new Error("Permission denied");

      const db = createSupabaseDb();

      const allGrants = (await db
        .query("gabinetEmployeeLocations")
        .eq("employeeId", args.employeeId)
        .collect()) as GabinetEmployeeLocationRow[];

      // Verify the target grant exists and belongs to this org.
      const target = allGrants.find(
        (g) => String(g.locationId) === args.locationId,
      );
      if (!target || String(target.organizationId) !== String(args.organizationId)) {
        throw new Error("Location not assigned to this employee");
      }

      // Unset isPrimary on all grants, then set on the target.
      for (const grant of allGrants) {
        const wantPrimary = String(grant.locationId) === args.locationId;
        if (Boolean(grant.isPrimary) !== wantPrimary) {
          await db.patch("gabinetEmployeeLocations", String(grant._id), {
            isPrimary: wantPrimary,
          });
        }
      }
    } catch (err) {
      await logError(ctx, err, {
        scope: "gabinet.employeeLocations",
        fnName: "setPrimary",
        argsJson: JSON.stringify({
          organizationId: args.organizationId,
          employeeId: args.employeeId,
          locationId: args.locationId,
        }),
        organizationId: args.organizationId,
      });
      throw err;
    }
  },
});
