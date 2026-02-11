import { query } from "./_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";

export const getStats = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const [contacts, companies, allLeads] = await Promise.all([
      ctx.db
        .query("contacts")
        .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
        .collect(),
      ctx.db
        .query("companies")
        .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
        .collect(),
      ctx.db
        .query("leads")
        .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
        .collect(),
    ]);

    const openLeads = allLeads.filter((l) => l.status === "open");
    const wonLeads = allLeads.filter((l) => l.status === "won");
    const lostLeads = allLeads.filter((l) => l.status === "lost");

    const pipelineValue = openLeads.reduce((sum, l) => sum + (l.value ?? 0), 0);
    const wonValue = wonLeads.reduce((sum, l) => sum + (l.value ?? 0), 0);
    const closedCount = wonLeads.length + lostLeads.length;
    const winRate = closedCount > 0 ? wonLeads.length / closedCount : 0;

    return {
      totalContacts: contacts.length,
      totalCompanies: companies.length,
      totalLeads: allLeads.length,
      openLeads: openLeads.length,
      wonLeads: wonLeads.length,
      lostLeads: lostLeads.length,
      pipelineValue,
      wonValue,
      winRate,
    };
  },
});

export const getLeadsByStage = query({
  args: {
    organizationId: v.id("organizations"),
    pipelineId: v.id("pipelines"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const stages = await ctx.db
      .query("pipelineStages")
      .withIndex("by_pipeline", (q) => q.eq("pipelineId", args.pipelineId))
      .collect();

    return await Promise.all(
      stages.map(async (stage) => {
        const leads = await ctx.db
          .query("leads")
          .withIndex("by_pipelineStage", (q) => q.eq("pipelineStageId", stage._id))
          .collect();

        const totalValue = leads.reduce((sum, l) => sum + (l.value ?? 0), 0);

        return {
          stageId: stage._id,
          stageName: stage.name,
          stageColor: stage.color,
          order: stage.order,
          count: leads.length,
          totalValue,
        };
      })
    );
  },
});
