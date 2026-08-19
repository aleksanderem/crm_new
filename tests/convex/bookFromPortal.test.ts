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

const RAW_PORTAL_TOKEN = "portal-test-token";

async function seedActivePortalSession(
  patientId: string,
  organizationId: string,
) {
  // The code calls validatePortalSessionSupabase(db, rawToken), which runs
  // SHA-256 internally before querying. So we seed the DB with the hash of the
  // raw token, and pass the raw token to bookFromPortal.
  const tokenHash = sha256Sync(RAW_PORTAL_TOKEN);
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
  // Return the raw token — callers must pass this, not the hash.
  return { rawToken: RAW_PORTAL_TOKEN };
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
    const { rawToken } = await seedActivePortalSession(
      String(patientId),
      String(organizationId),
    );

    // A clearly-past date (server clock will be later than this).
    // bookFromPortal takes the raw bearer token; it hashes internally before lookup.
    await expect(
      t.action(api.gabinet.patientPortal.bookFromPortal, {
        tokenHash: rawToken,
        treatmentId: String(treatmentId),
        preferredDate: "2020-01-01",
        preferredTime: "09:00",
      }),
    ).rejects.toThrow(/start time is in the past/i);
  });
});
