/**
 * Behavioral tests for the nowDate/nowTime filtering in the availability engine.
 *
 * In production, orgSettings.timezone drives this: the appointment-dialog
 * reads orgSettings.timezone, computes "now" in the clinic's local time, then
 * passes nowDate + nowTime to getAvailableSlotsQuery. The engine filters out
 * slots at or before that time so stale past-slots never appear in the picker.
 *
 * This file verifies the backend half of that contract: given nowDate + nowTime,
 * only slots strictly after nowTime are returned. Testing orgSettings.timezone
 * itself is not possible at the backend level because the field is consumed in
 * the frontend (see appointment-dialog.tsx and orgSettingsEffect.test.ts).
 *
 * Issue #3676 — timezone orgSettings field availability-engine harness test,
 * follow-up from #3672.
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { vi } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createTestCtx,
  seedGabinetPrereqs,
  seedTestUser,
} from "../../convex/_test_helpers";

// A far-future date so the slot query never hits any past-booking guards.
// seedGabinetPrereqs seeds working hours for all 7 days (08:00–18:00) so
// the day-of-week of TEST_DATE does not matter.
const TEST_DATE = "2099-12-15";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      text: async () => "{}",
    })) as unknown as typeof fetch,
  );
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  vi.unstubAllGlobals();
});

describe("nowDate/nowTime filtering in getAvailableSlotsQuery (timezone contract)", () => {
  test("without nowDate/nowTime all slots across working hours are returned", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await seedGabinetPrereqs(t, organizationId, userId);

    const result = await t
      .withIdentity(identity)
      .action(api.gabinet.appointments.getAvailableSlotsQuery, {
        organizationId,
        userId: String(userId),
        date: TEST_DATE,
        duration: 30,
      });

    // Working hours 08:00–18:00, 15-min increments, 30-min duration.
    // First slot: 08:00; last slot starts at 17:30.
    const { slots } = result;
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0].start).toBe("08:00");
    expect(slots[slots.length - 1].start).toBe("17:30");
  });

  test("nowDate=date nowTime=14:00 excludes all slots at or before 14:00", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await seedGabinetPrereqs(t, organizationId, userId);

    const result = await t
      .withIdentity(identity)
      .action(api.gabinet.appointments.getAvailableSlotsQuery, {
        organizationId,
        userId: String(userId),
        date: TEST_DATE,
        duration: 30,
        nowDate: TEST_DATE,
        nowTime: "14:00",
      });

    const { slots } = result;
    expect(slots.length).toBeGreaterThan(0);
    // Every slot must start strictly after 14:00
    for (const slot of slots) {
      expect(slot.start > "14:00").toBe(true);
    }
    // First 15-min-aligned slot after 14:00 is 14:15
    expect(slots[0].start).toBe("14:15");
  });

  test("nowDate on a different date does not filter slots for the requested date", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await seedGabinetPrereqs(t, organizationId, userId);

    const OTHER_DATE = "2099-12-14"; // day before TEST_DATE

    const result = await t
      .withIdentity(identity)
      .action(api.gabinet.appointments.getAvailableSlotsQuery, {
        organizationId,
        userId: String(userId),
        date: TEST_DATE,
        duration: 30,
        nowDate: OTHER_DATE,
        nowTime: "23:59", // late — would wipe all slots if it applied
      });

    // Filter only applies when nowDate === date, so all day's slots come back
    const { slots } = result;
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0].start).toBe("08:00");
  });

  test("nowTime at or after last slot start returns no slots", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await seedGabinetPrereqs(t, organizationId, userId);

    const result = await t
      .withIdentity(identity)
      .action(api.gabinet.appointments.getAvailableSlotsQuery, {
        organizationId,
        userId: String(userId),
        date: TEST_DATE,
        duration: 30,
        nowDate: TEST_DATE,
        nowTime: "17:30", // last slot starts at 17:30; must be filtered out (not strictly after)
      });

    expect(result.slots).toHaveLength(0);
  });
});
