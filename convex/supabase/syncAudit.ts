import { v } from "convex/values";
import { internalAction, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { createServiceRoleClient } from "./client";

interface TableAuditResult {
  table: string;
  convexCount: number;
  supabaseCount: number;
  diff: number;
  status: "OK" | "MISMATCH";
}

const TABLE_PAIRS: Array<{ convexTable: string; supabaseTable: string }> = [
  { convexTable: "users", supabaseTable: "users" },
  { convexTable: "organizations", supabaseTable: "organizations" },
  { convexTable: "teamMemberships", supabaseTable: "team_memberships" },
  { convexTable: "contacts", supabaseTable: "contacts" },
  { convexTable: "companies", supabaseTable: "companies" },
  { convexTable: "leads", supabaseTable: "leads" },
  { convexTable: "products", supabaseTable: "products" },
  { convexTable: "calls", supabaseTable: "calls" },
  { convexTable: "notes", supabaseTable: "notes" },
  { convexTable: "activities", supabaseTable: "activities" },
  { convexTable: "emails", supabaseTable: "emails" },
  { convexTable: "emailTemplates", supabaseTable: "email_templates" },
  { convexTable: "savedViews", supabaseTable: "saved_views" },
  { convexTable: "notifications", supabaseTable: "notifications" },
  { convexTable: "scheduledActivities", supabaseTable: "scheduled_activities" },
  { convexTable: "pipelines", supabaseTable: "pipelines" },
  { convexTable: "pipelineStages", supabaseTable: "pipeline_stages" },
  { convexTable: "customFieldDefinitions", supabaseTable: "custom_field_definitions" },
  { convexTable: "customFieldValues", supabaseTable: "custom_field_values" },
  { convexTable: "gabinetPatients", supabaseTable: "gabinet_patients" },
  { convexTable: "gabinetAppointments", supabaseTable: "gabinet_appointments" },
  { convexTable: "gabinetTreatments", supabaseTable: "gabinet_treatments" },
  { convexTable: "gabinetEmployees", supabaseTable: "gabinet_employees" },
  { convexTable: "gabinetLocations", supabaseTable: "gabinet_locations" },
  { convexTable: "gabinetRooms", supabaseTable: "gabinet_rooms" },
  { convexTable: "gabinetWorkingHours", supabaseTable: "gabinet_working_hours" },
  { convexTable: "gabinetEmployeeSchedules", supabaseTable: "gabinet_employee_schedules" },
  { convexTable: "gabinetLeaves", supabaseTable: "gabinet_leaves" },
  { convexTable: "gabinetLeaveTypes", supabaseTable: "gabinet_leave_types" },
  { convexTable: "gabinetTreatmentPackages", supabaseTable: "gabinet_packages" },
  { convexTable: "gabinetLoyaltyPoints", supabaseTable: "gabinet_loyalty_points" },
  { convexTable: "gabinetEquipment", supabaseTable: "gabinet_equipment" },
  { convexTable: "formTemplates", supabaseTable: "form_templates" },
  { convexTable: "formDocuments", supabaseTable: "form_documents" },
  { convexTable: "auditLog", supabaseTable: "audit_log" },
];

export const _countConvexTable = internalQuery({
  args: { table: v.string(), organizationId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const tableName = args.table as any;
    const all = await ctx.db.query(tableName).collect();
    if (!args.organizationId) return all.length;
    const orgId = args.organizationId;
    return all.filter(
      (r: any) => !r.organizationId || r.organizationId === orgId,
    ).length;
  },
});

export const auditAll = internalAction({
  args: { organizationId: v.optional(v.id("organizations")) },
  handler: async (ctx, args) => {
    const client = createServiceRoleClient();
    const results: TableAuditResult[] = [];
    let totalMismatches = 0;

    for (const pair of TABLE_PAIRS) {
      let convexCount: number;
      try {
        convexCount = await ctx.runQuery(
          internal.supabase["sync-audit"]._countConvexTable,
          {
            table: pair.convexTable,
            organizationId: args.organizationId
              ? String(args.organizationId)
              : undefined,
          },
        );
      } catch {
        convexCount = -1;
      }

      let supabaseCount: number;
      try {
        let query = client
          .from(pair.supabaseTable)
          .select("id", { count: "exact", head: true });
        if (args.organizationId) {
          query = query.eq("organization_id", String(args.organizationId));
        }
        const { count, error } = await query;
        if (error) {
          supabaseCount = -1;
        } else {
          supabaseCount = count ?? 0;
        }
      } catch {
        supabaseCount = -1;
      }

      const diff = Math.abs(convexCount - supabaseCount);
      const status =
        convexCount === supabaseCount ? "OK" : ("MISMATCH" as const);
      if (status === "MISMATCH") totalMismatches++;

      results.push({
        table: `${pair.convexTable} → ${pair.supabaseTable}`,
        convexCount,
        supabaseCount,
        diff,
        status,
      });
    }

    const passed = results.filter((r) => r.status === "OK");
    const failed = results.filter((r) => r.status === "MISMATCH");

    console.info("=== SYNC AUDIT RESULTS ===");
    console.info(`PASSED: ${passed.length}/${results.length}`);
    if (failed.length > 0) {
      console.error("MISMATCHES:");
      for (const f of failed) {
        console.error(
          `  ${f.table}: Convex=${f.convexCount} Supabase=${f.supabaseCount} (diff=${f.diff})`,
        );
      }
    }

    return {
      total: results.length,
      passed: passed.length,
      failed: failed.length,
      results,
    };
  },
});
