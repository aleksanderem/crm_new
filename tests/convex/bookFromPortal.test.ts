import { describe, expect, test } from "vitest";
import { createHash } from "crypto";
import { api } from "../../convex/_generated/api";
import {
  createTestCtx,
  seedTestUser,
  seedGabinetPrereqs,
} from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

function sha256Sync(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

async function seedActivePortalSession(
  patientId: string,
  organizationId: string,
) {
  const token = "portal-test-token";
  const tokenHash = sha256Sync(token);
  const db = createSupabaseDb();
  const now = Date.now();
  await db.insert("gabinetPortalSessions", {
    patientId,
    organizationId,
    isActive: true,
    tokenHash,
    lastAccessedAt: now,
    createdAt: now,
    expiresAt: now + 30 * 24 * 60 * 60 * 1000,
  });
  return { tokenHash };
}

describe("bookFromPortal past-time guard (issue #1415)", () => {
  test("rejects bookings whose start time is already in the past", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );
    const { tokenHash } = await seedActivePortalSession(
      String(patientId),
      String(organizationId),
    );

    // A clearly-past date (server clock will be later than this).
    await expect(
      t.action(api.gabinet.patientPortal.bookFromPortal, {
        tokenHash,
        treatmentId: String(treatmentId),
        preferredDate: "2020-01-01",
        preferredTime: "09:00",
      }),
    ).rejects.toThrow(/start time is in the past/i);
  });
});
