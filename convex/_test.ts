/**
 * Internal test functions for E2E backend testing.
 * Run with: npx convex run _test:runAllTests
 * Cleanup with: npx convex run _test:cleanup
 */
import { mutation } from "./_generated/server";

const TEST_PREFIX = "__test__";

// ─── Setup ──────────────────────────────────────────────────────

export const runAllTests = mutation({
  args: {},
  handler: async (ctx) => {
    const results: { test: string; passed: boolean; error?: string }[] = [];
    const now = Date.now();

    function assert(condition: boolean, msg: string) {
      if (!condition) throw new Error(`ASSERTION FAILED: ${msg}`);
    }

    try {
      // ── 1. Create test user ──
      const userId = await ctx.db.insert("users", {
        name: `${TEST_PREFIX}user`,
        email: `${TEST_PREFIX}user@test.com`,
      });
      results.push({ test: "Create test user", passed: true });

      // ── 2. Create organization ──
      const orgId = await ctx.db.insert("organizations", {
        name: `${TEST_PREFIX}org`,
        slug: `${TEST_PREFIX}org`,
        ownerId: userId,
        createdAt: now,
        updatedAt: now,
      });
      results.push({ test: "Create organization", passed: true });

      // ── 3. Create team membership ──
      await ctx.db.insert("teamMemberships", {
        userId,
        organizationId: orgId,
        role: "owner",
        joinedAt: now,
      });
      results.push({ test: "Create team membership", passed: true });

      // ── 4. CRUD Contacts ──
      const contactId = await ctx.db.insert("contacts", {
        organizationId: orgId,
        firstName: `${TEST_PREFIX}Jan`,
        lastName: "Kowalski",
        email: "jan@test.com",
        phone: "+48123456789",
        title: "CTO",
        notes: "Test contact",
        tags: ["vip", "tech"],
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });

      const contact = await ctx.db.get(contactId);
      assert(contact !== null, "Contact should exist");
      assert(contact!.firstName === `${TEST_PREFIX}Jan`, "Contact firstName mismatch");
      assert(contact!.tags?.includes("vip") === true, "Contact should have vip tag");
      results.push({ test: "Create & read contact", passed: true });

      await ctx.db.patch(contactId, { lastName: "Nowak", updatedAt: Date.now() });
      const updated = await ctx.db.get(contactId);
      assert(updated!.lastName === "Nowak", "Contact update failed");
      results.push({ test: "Update contact", passed: true });

      // ── 5. CRUD Companies ──
      const companyId = await ctx.db.insert("companies", {
        organizationId: orgId,
        name: `${TEST_PREFIX}Acme Corp`,
        domain: "acme.test",
        industry: "Technology",
        size: "11-50",
        website: "https://acme.test",
        address: {
          street: "123 Main St",
          city: "Warsaw",
          country: "Poland",
        },
        tags: ["enterprise"],
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });

      const company = await ctx.db.get(companyId);
      assert(company !== null, "Company should exist");
      assert(company!.name === `${TEST_PREFIX}Acme Corp`, "Company name mismatch");
      assert(company!.address?.city === "Warsaw", "Company address mismatch");
      results.push({ test: "Create & read company", passed: true });

      // ── 6. Pipeline + Stages ──
      const pipelineId = await ctx.db.insert("pipelines", {
        organizationId: orgId,
        name: `${TEST_PREFIX}Sales Pipeline`,
        type: "sales",
        isDefault: true,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });

      const stage1Id = await ctx.db.insert("pipelineStages", {
        pipelineId,
        organizationId: orgId,
        name: "Prospecting",
        color: "#3B82F6",
        order: 1,
        createdAt: now,
        updatedAt: now,
      });

      const stage2Id = await ctx.db.insert("pipelineStages", {
        pipelineId,
        organizationId: orgId,
        name: "Negotiation",
        color: "#F59E0B",
        order: 2,
        createdAt: now,
        updatedAt: now,
      });

      const stage3Id = await ctx.db.insert("pipelineStages", {
        pipelineId,
        organizationId: orgId,
        name: "Closed Won",
        color: "#10B981",
        order: 3,
        isWonStage: true,
        createdAt: now,
        updatedAt: now,
      });

      const stages = await ctx.db
        .query("pipelineStages")
        .withIndex("by_pipeline", (q) => q.eq("pipelineId", pipelineId))
        .collect();
      assert(stages.length === 3, `Expected 3 stages, got ${stages.length}`);
      assert(stages[0].name === "Prospecting", "Stages should be ordered");
      results.push({ test: "Create pipeline + 3 stages", passed: true });

      // ── 7. CRUD Leads ──
      const leadId = await ctx.db.insert("leads", {
        organizationId: orgId,
        title: `${TEST_PREFIX}Big Deal`,
        value: 50000,
        currency: "PLN",
        status: "open",
        priority: "high",
        source: "referral",
        companyId,
        assignedTo: userId,
        pipelineStageId: stage1Id,
        stageOrder: 1.0,
        tags: ["hot"],
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });

      const lead = await ctx.db.get(leadId);
      assert(lead !== null, "Lead should exist");
      assert(lead!.value === 50000, "Lead value mismatch");
      assert(lead!.status === "open", "Lead status should be open");
      assert(lead!.pipelineStageId === stage1Id, "Lead should be in stage 1");
      results.push({ test: "Create & read lead", passed: true });

      // ── 8. Move lead to stage (simulate Kanban drag) ──
      await ctx.db.patch(leadId, {
        pipelineStageId: stage2Id,
        stageOrder: 1.0,
        updatedAt: Date.now(),
      });
      const movedLead = await ctx.db.get(leadId);
      assert(movedLead!.pipelineStageId === stage2Id, "Lead should be in stage 2");
      results.push({ test: "Move lead between stages", passed: true });

      // Move to won stage — auto-set status
      await ctx.db.patch(leadId, {
        pipelineStageId: stage3Id,
        stageOrder: 1.0,
        status: "won",
        wonAt: Date.now(),
        updatedAt: Date.now(),
      });
      const wonLead = await ctx.db.get(leadId);
      assert(wonLead!.status === "won", "Lead should be won after moving to won stage");
      assert(wonLead!.wonAt !== undefined, "wonAt should be set");
      results.push({ test: "Lead auto-wins on won stage", passed: true });

      // ── 9. Documents ──
      const docId = await ctx.db.insert("documents", {
        organizationId: orgId,
        name: `${TEST_PREFIX}proposal.pdf`,
        description: "Test proposal document",
        mimeType: "application/pdf",
        fileSize: 1024000,
        category: "proposal",
        tags: ["q1"],
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });

      const doc = await ctx.db.get(docId);
      assert(doc !== null, "Document should exist");
      assert(doc!.category === "proposal", "Document category mismatch");
      results.push({ test: "Create & read document", passed: true });

      // ── 10. Custom Field Definitions ──
      const fieldDef1 = await ctx.db.insert("customFieldDefinitions", {
        organizationId: orgId,
        entityType: "contact",
        name: "LinkedIn URL",
        fieldKey: "linkedin_url",
        fieldType: "url",
        isRequired: false,
        order: 1,
        group: "Social Media",
        createdAt: now,
        updatedAt: now,
      });

      const fieldDef2 = await ctx.db.insert("customFieldDefinitions", {
        organizationId: orgId,
        entityType: "contact",
        name: "Department",
        fieldKey: "department",
        fieldType: "select",
        options: ["Engineering", "Sales", "Marketing", "HR"],
        isRequired: true,
        order: 2,
        group: "Work Info",
        createdAt: now,
        updatedAt: now,
      });

      const defs = await ctx.db
        .query("customFieldDefinitions")
        .withIndex("by_orgAndEntity", (q) =>
          q.eq("organizationId", orgId).eq("entityType", "contact")
        )
        .collect();
      assert(defs.length === 2, `Expected 2 field defs, got ${defs.length}`);
      assert(defs[0].fieldType === "url", "First field should be url type");
      results.push({ test: "Create custom field definitions", passed: true });

      // ── 11. Custom Field Values ──
      await ctx.db.insert("customFieldValues", {
        organizationId: orgId,
        fieldDefinitionId: fieldDef1,
        entityType: "contact",
        entityId: contactId as string,
        value: "https://linkedin.com/in/jankowalski",
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("customFieldValues", {
        organizationId: orgId,
        fieldDefinitionId: fieldDef2,
        entityType: "contact",
        entityId: contactId as string,
        value: "Engineering",
        createdAt: now,
        updatedAt: now,
      });

      const cfValues = await ctx.db
        .query("customFieldValues")
        .withIndex("by_entity", (q) =>
          q.eq("entityType", "contact").eq("entityId", contactId as string)
        )
        .collect();
      assert(cfValues.length === 2, `Expected 2 custom field values, got ${cfValues.length}`);
      assert(cfValues[0].value === "https://linkedin.com/in/jankowalski", "CF value mismatch");
      results.push({ test: "Create & read custom field values", passed: true });

      // ── 12. Object Relationships ──
      await ctx.db.insert("objectRelationships", {
        organizationId: orgId,
        sourceType: "contact",
        sourceId: contactId as string,
        targetType: "company",
        targetId: companyId as string,
        relationshipType: "works_at",
        createdBy: userId,
        createdAt: now,
      });

      await ctx.db.insert("objectRelationships", {
        organizationId: orgId,
        sourceType: "document",
        sourceId: docId as string,
        targetType: "lead",
        targetId: leadId as string,
        relationshipType: "attached_to",
        createdBy: userId,
        createdAt: now,
      });

      // Bidirectional check
      const contactRels = await ctx.db
        .query("objectRelationships")
        .withIndex("by_source", (q) =>
          q.eq("sourceType", "contact").eq("sourceId", contactId as string)
        )
        .collect();
      assert(contactRels.length === 1, "Contact should have 1 outgoing relationship");
      assert(contactRels[0].targetType === "company", "Relationship target should be company");

      const companyRels = await ctx.db
        .query("objectRelationships")
        .withIndex("by_target", (q) =>
          q.eq("targetType", "company").eq("targetId", companyId as string)
        )
        .collect();
      assert(companyRels.length === 1, "Company should have 1 incoming relationship");
      results.push({ test: "Create & query relationships (bidirectional)", passed: true });

      // ── 13. Activity Log ──
      await ctx.db.insert("activities", {
        organizationId: orgId,
        entityType: "contact",
        entityId: contactId as string,
        action: "created",
        description: "Created contact Jan Kowalski",
        performedBy: userId,
        createdAt: now,
      });

      await ctx.db.insert("activities", {
        organizationId: orgId,
        entityType: "lead",
        entityId: leadId as string,
        action: "stage_changed",
        description: "Moved from Prospecting to Closed Won",
        metadata: { previousStage: "Prospecting", newStage: "Closed Won" },
        performedBy: userId,
        createdAt: now + 1000,
      });

      await ctx.db.insert("activities", {
        organizationId: orgId,
        entityType: "contact",
        entityId: contactId as string,
        action: "note_added",
        description: "Added a note",
        performedBy: userId,
        createdAt: now + 2000,
      });

      const contactActivities = await ctx.db
        .query("activities")
        .withIndex("by_entity", (q) =>
          q.eq("entityType", "contact").eq("entityId", contactId as string)
        )
        .collect();
      assert(contactActivities.length === 2, `Expected 2 contact activities, got ${contactActivities.length}`);

      const orgActivities = await ctx.db
        .query("activities")
        .withIndex("by_org", (q) => q.eq("organizationId", orgId))
        .collect();
      assert(orgActivities.length === 3, `Expected 3 org activities, got ${orgActivities.length}`);
      results.push({ test: "Create & query activities", passed: true });

      // ── 14. Dashboard aggregation queries ──
      const totalContacts = (await ctx.db
        .query("contacts")
        .withIndex("by_org", (q) => q.eq("organizationId", orgId))
        .collect()).length;
      assert(totalContacts === 1, `Expected 1 contact, got ${totalContacts}`);

      const totalCompanies = (await ctx.db
        .query("companies")
        .withIndex("by_org", (q) => q.eq("organizationId", orgId))
        .collect()).length;
      assert(totalCompanies === 1, `Expected 1 company, got ${totalCompanies}`);

      const leads_all = await ctx.db
        .query("leads")
        .withIndex("by_org", (q) => q.eq("organizationId", orgId))
        .collect();
      const wonLeads = leads_all.filter((l) => l.status === "won");
      const pipelineValue = leads_all.reduce((sum, l) => sum + (l.value ?? 0), 0);
      assert(pipelineValue === 50000, `Expected pipeline value 50000, got ${pipelineValue}`);
      assert(wonLeads.length === 1, "Should have 1 won lead");
      results.push({ test: "Dashboard aggregation queries", passed: true });

      // ── 15. Search indexes ──
      const searchResults = await ctx.db
        .query("contacts")
        .withSearchIndex("search_contacts", (q) =>
          q.search("firstName", TEST_PREFIX).eq("organizationId", orgId)
        )
        .take(10);
      assert(searchResults.length === 1, `Search should find 1 contact, got ${searchResults.length}`);
      results.push({ test: "Search index (contacts)", passed: true });

      const companySearch = await ctx.db
        .query("companies")
        .withSearchIndex("search_companies", (q) =>
          q.search("name", TEST_PREFIX).eq("organizationId", orgId)
        )
        .take(10);
      assert(companySearch.length === 1, `Company search should find 1, got ${companySearch.length}`);
      results.push({ test: "Search index (companies)", passed: true });

      // ── 16. Cascade delete test ──
      // Delete contact → should be able to clean up custom values and relationships
      const cvBeforeDelete = await ctx.db
        .query("customFieldValues")
        .withIndex("by_entity", (q) =>
          q.eq("entityType", "contact").eq("entityId", contactId as string)
        )
        .collect();
      assert(cvBeforeDelete.length === 2, "Should have 2 custom values before delete");

      // Simulate cascade: delete custom values
      for (const cv of cvBeforeDelete) {
        await ctx.db.delete(cv._id);
      }
      // Delete relationships
      for (const rel of contactRels) {
        await ctx.db.delete(rel._id);
      }
      // Delete contact
      await ctx.db.delete(contactId);

      const deletedContact = await ctx.db.get(contactId);
      assert(deletedContact === null, "Contact should be deleted");

      const cvAfterDelete = await ctx.db
        .query("customFieldValues")
        .withIndex("by_entity", (q) =>
          q.eq("entityType", "contact").eq("entityId", contactId as string)
        )
        .collect();
      assert(cvAfterDelete.length === 0, "Custom values should be cascade deleted");
      results.push({ test: "Cascade delete (contact + custom values + relationships)", passed: true });

      // ── 17. Multi-tenancy isolation ──
      const otherUserId = await ctx.db.insert("users", {
        name: `${TEST_PREFIX}other_user`,
        email: `${TEST_PREFIX}other@test.com`,
      });
      const otherOrgId = await ctx.db.insert("organizations", {
        name: `${TEST_PREFIX}other_org`,
        slug: `${TEST_PREFIX}other-org`,
        ownerId: otherUserId,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("contacts", {
        organizationId: otherOrgId,
        firstName: `${TEST_PREFIX}OtherContact`,
        createdBy: otherUserId,
        createdAt: now,
        updatedAt: now,
      });

      const org1Contacts = await ctx.db
        .query("contacts")
        .withIndex("by_org", (q) => q.eq("organizationId", orgId))
        .collect();
      assert(org1Contacts.length === 0, "Org1 should have 0 contacts (deleted earlier)");

      const org2Contacts = await ctx.db
        .query("contacts")
        .withIndex("by_org", (q) => q.eq("organizationId", otherOrgId))
        .collect();
      assert(org2Contacts.length === 1, "Org2 should have 1 contact");
      results.push({ test: "Multi-tenancy isolation", passed: true });

      // ── Summary ──
      const passed = results.filter((r) => r.passed).length;
      const failed = results.filter((r) => !r.passed).length;

      return {
        summary: `${passed}/${results.length} tests passed, ${failed} failed`,
        results,
        testDataPrefix: TEST_PREFIX,
      };
    } catch (e: any) {
      results.push({ test: "UNEXPECTED ERROR", passed: false, error: e.message });
      return {
        summary: `FAILED - ${results.filter((r) => r.passed).length}/${results.length} passed`,
        results,
        error: e.message,
        testDataPrefix: TEST_PREFIX,
      };
    }
  },
});

// ─── Cleanup ────────────────────────────────────────────────────

export const cleanup = mutation({
  args: {},
  handler: async (ctx) => {
    let deleted = 0;

    // Delete all test data in reverse dependency order
    const tables = [
      "activities",
      "customFieldValues",
      "customFieldDefinitions",
      "objectRelationships",
      "leads",
      "pipelineStages",
      "pipelines",
      "documents",
      "contacts",
      "companies",
      "teamMemberships",
      "organizations",
    ] as const;

    for (const table of tables) {
      const rows = await ctx.db.query(table).collect();
      for (const row of rows) {
        const nameField = (row as any).name ?? (row as any).firstName ?? (row as any).title ?? (row as any).slug ?? "";
        if (typeof nameField === "string" && nameField.startsWith(TEST_PREFIX)) {
          await ctx.db.delete(row._id);
          deleted++;
        }
      }
    }

    // Delete test users
    const users = await ctx.db.query("users").collect();
    for (const u of users) {
      if (u.name?.startsWith(TEST_PREFIX) || u.email?.startsWith(TEST_PREFIX)) {
        await ctx.db.delete(u._id);
        deleted++;
      }
    }

    return { deleted, message: `Cleaned up ${deleted} test records` };
  },
});

// Diagnostic: check activity custom fields in database
export const diagCustomFields = mutation({
  args: {},
  handler: async (ctx) => {
    const allDefs = await ctx.db.query("customFieldDefinitions").collect();
    const activityDefs = allDefs.filter((d) => d.entityType === "activity");
    const allValues = await ctx.db.query("customFieldValues").collect();
    const activityValues = allValues.filter((v) => v.entityType === "activity");
    const allActivities = await ctx.db.query("scheduledActivities").collect();

    // Also test the index lookup that getValuesBulk uses
    const indexResults: Record<string, any[]> = {};
    for (const act of allActivities) {
      const values = await ctx.db
        .query("customFieldValues")
        .withIndex("by_orgEntityField", (q) =>
          q
            .eq("organizationId", act.organizationId)
            .eq("entityType", "activity")
            .eq("entityId", act._id as string)
        )
        .collect();
      if (values.length > 0) {
        indexResults[act._id] = values.map((v) => ({
          fieldDefId: v.fieldDefinitionId,
          value: v.value,
          orgId: v.organizationId,
        }));
      }
    }

    return {
      activityDefs: activityDefs.map((d) => ({
        id: d._id,
        name: d.name,
        fieldKey: d.fieldKey,
        activityTypeKey: d.activityTypeKey,
        orgId: d.organizationId,
      })),
      activityValues: activityValues.map((v) => ({
        id: v._id,
        fieldDefinitionId: v.fieldDefinitionId,
        entityId: v.entityId,
        value: v.value,
        orgId: v.organizationId,
      })),
      scheduledActivities: allActivities.map((a) => ({
        id: a._id,
        title: a.title,
        activityType: a.activityType,
        orgId: a.organizationId,
      })),
      indexLookupResults: indexResults,
    };
  },
});
