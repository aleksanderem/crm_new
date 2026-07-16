import { describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

const PAGES = [{ storageId: "st-1", mimeType: "application/pdf", position: 1 }];

describe("documentAnalysisJobs", () => {
  test("createJob persists a pending job scoped to the org", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const jobId = await t.withIdentity(identity).action(api.documentAnalysisJobs.createJob, {
      organizationId, kind: "form_template", pages: PAGES,
      context: JSON.stringify({ patientFields: [{ key: "pesel", label: "PESEL" }] }),
    });
    const row = (await createSupabaseDb().get("documentAnalysisJobs", String(jobId))) as Record<string, unknown>;
    expect(row?.status).toBe("pending");
    expect(row?.kind).toBe("form_template");
    expect(row?.organizationId).toBe(String(organizationId));
    expect(row?.createdBy).toBe(String(userId));
  });

  test("createJob rejects unknown kind", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    await expect(
      t.withIdentity(identity).action(api.documentAnalysisJobs.createJob, {
        organizationId, kind: "nope", pages: PAGES,
      }),
    ).rejects.toThrow(/unknown analysis kind/i);
  });

  test("createJob rejects empty pages", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    await expect(
      t.withIdentity(identity).action(api.documentAnalysisJobs.createJob, {
        organizationId, kind: "form_template", pages: [],
      }),
    ).rejects.toThrow(/no pages/i);
  });

  test("runJob without provider records error status on the job (retryable)", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    const jobId = await t.withIdentity(identity).action(api.documentAnalysisJobs.createJob, {
      organizationId, kind: "form_template", pages: PAGES,
    });
    const res = await t.withIdentity(identity).action(api.documentAnalysisJobs.runJob, {
      organizationId, jobId: String(jobId),
    });
    expect(res.status).toBe("error");
    const row = (await createSupabaseDb().get("documentAnalysisJobs", String(jobId))) as Record<string, unknown>;
    expect(row?.status).toBe("error");
    expect(String(row?.errorMessage)).toMatch(/not configured/i);
    expect(typeof row?.completedAt).toBe("number");
    // retry = to samo wywołanie, bez wyjątku
    const res2 = await t.withIdentity(identity).action(api.documentAnalysisJobs.runJob, {
      organizationId, jobId: String(jobId),
    });
    expect(res2.status).toBe("error");
  });

  test("getJob returns the row and hides other orgs' jobs", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    const jobId = await t.withIdentity(identity).action(api.documentAnalysisJobs.createJob, {
      organizationId, kind: "form_template", pages: PAGES,
    });
    const job = await t.withIdentity(identity).action(api.documentAnalysisJobs.getJob, {
      organizationId, jobId: String(jobId),
    });
    expect(job?.kind).toBe("form_template");

    const other = await seedTestUser(t); // druga organizacja
    await expect(
      t.withIdentity(other.identity).action(api.documentAnalysisJobs.getJob, {
        organizationId: other.organizationId, jobId: String(jobId),
      }),
    ).resolves.toBeNull();
  });
});
