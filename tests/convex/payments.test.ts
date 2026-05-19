import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";

// payments.{create,markPaid,refund} schedule audit-log / activity-envelope
// dual-writes via `ctx.scheduler.runAfter(0, …)`. convex-test fires those via
// `setTimeout(0, …)` against a `global.Convex` reference; once the next test
// creates a fresh instance, the orphan callbacks from the previous test fire
// against the new `global.Convex` and surface as "Write outside of
// transaction" unhandled rejections that fail the suite even though every
// assertion passes. Match the per-file filter used by appointmentStateMachine
// (see #506) — swallow only the known scheduler noise shape, let everything
// else through to vitest's listener.
const SCHEDULER_NOISE = [
  /Write outside of transaction \d+;_scheduled_functions/,
];

function onUnhandledRejection(reason: unknown) {
  const msg = reason instanceof Error ? reason.message : String(reason);
  if (SCHEDULER_NOISE.some((re) => re.test(msg))) return;
}

beforeAll(() => {
  process.on("unhandledRejection", onUnhandledRejection);
});

afterAll(() => {
  process.off("unhandledRejection", onUnhandledRejection);
});

afterEach(async () => {
  // Let any pending setTimeout(0) side-effect callbacks from the test fire
  // against the *current* instance before the next test creates a new one.
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe("payments", () => {
  test("create a pending payment when status is explicit", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const paymentId = await t.withIdentity(identity).action(
      api.payments.create,
      {
        organizationId,
        amount: 100,
        currency: "USD",
        paymentMethod: "cash",
        status: "pending",
      },
    );

    expect(paymentId).toBeTruthy();

    const result = await t.withIdentity(identity).action(api.payments.list, {
      organizationId,
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(result.page).toHaveLength(1);
    expect(result.page[0].status).toBe("pending");
    expect(result.page[0].amount).toBe(100);
  });

  test("create defaults to completed status", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const paymentId = await t.withIdentity(identity).action(
      api.payments.create,
      {
        organizationId,
        amount: 100,
        currency: "USD",
        paymentMethod: "cash",
      },
    );

    expect(paymentId).toBeTruthy();

    const result = await t.withIdentity(identity).action(api.payments.list, {
      organizationId,
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(result.page).toHaveLength(1);
    expect(result.page[0].status).toBe("completed");
    expect(result.page[0].paidAt).toBeTruthy();
  });

  test("mark a pending payment as paid", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const paymentId = await t.withIdentity(identity).action(
      api.payments.create,
      {
        organizationId,
        amount: 200,
        currency: "EUR",
        paymentMethod: "card",
        status: "pending",
      },
    );

    await t.withIdentity(identity).action(api.payments.markPaid, {
      organizationId,
      paymentId,
    });

    const result = await t.withIdentity(identity).action(api.payments.list, {
      organizationId,
      paginationOpts: { numItems: 10, cursor: null },
      status: "completed",
    });

    expect(result.page).toHaveLength(1);
    expect(result.page[0].status).toBe("completed");
    expect(result.page[0].paidAt).toBeTruthy();
  });

  test("cannot mark a non-pending payment as paid", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const paymentId = await t.withIdentity(identity).action(
      api.payments.create,
      {
        organizationId,
        amount: 50,
        currency: "USD",
        paymentMethod: "transfer",
      },
    );

    // Payment is already completed by default — markPaid should reject it
    await expect(
      t.withIdentity(identity).action(api.payments.markPaid, {
        organizationId,
        paymentId,
      }),
    ).rejects.toThrow("Cannot mark completed payment as paid");
  });

  test("refund a completed payment", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const paymentId = await t.withIdentity(identity).action(
      api.payments.create,
      {
        organizationId,
        amount: 300,
        currency: "USD",
        paymentMethod: "card",
      },
    );

    await t.withIdentity(identity).action(api.payments.refund, {
      organizationId,
      paymentId,
      reason: "Patient request",
    });

    const result = await t.withIdentity(identity).action(api.payments.list, {
      organizationId,
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(result.page[0].status).toBe("refunded");
    expect(result.page[0].notes).toContain("Refund: Patient request");
  });

  test("cannot refund a pending payment", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const paymentId = await t.withIdentity(identity).action(
      api.payments.create,
      {
        organizationId,
        amount: 50,
        currency: "USD",
        paymentMethod: "cash",
        status: "pending",
      },
    );

    await expect(
      t.withIdentity(identity).action(api.payments.refund, {
        organizationId,
        paymentId,
      }),
    ).rejects.toThrow("Cannot refund a pending payment");
  });

  test("revenue summary aggregates completed payments", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const now = Date.now();

    // Two completed payments (default status)
    for (const amount of [100, 250]) {
      await t.withIdentity(identity).action(
        api.payments.create,
        {
          organizationId,
          amount,
          currency: "USD",
          paymentMethod: "cash",
        },
      );
    }

    // A pending payment — should not be counted
    await t.withIdentity(identity).action(api.payments.create, {
      organizationId,
      amount: 999,
      currency: "USD",
      paymentMethod: "card",
      status: "pending",
    });

    const summary = await t.withIdentity(identity).action(
      api.payments.getRevenueSummary,
      {
        organizationId,
        startDate: now - 60000,
        endDate: now + 60000,
      },
    );

    expect(summary.total).toBe(350);
    expect(summary.count).toBe(2);
    expect(summary.byMethod.cash.total).toBe(350);
  });

  test("list paginates results via cursor (offset)", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    // Create 5 payments
    for (let i = 0; i < 5; i++) {
      await t.withIdentity(identity).action(api.payments.create, {
        organizationId,
        amount: 10 + i,
        currency: "USD",
        paymentMethod: "cash",
      });
    }

    // First page: 2 items, more remaining
    const page1 = await t.withIdentity(identity).action(api.payments.list, {
      organizationId,
      paginationOpts: { numItems: 2, cursor: null },
    });
    expect(page1.page).toHaveLength(2);
    expect(page1.isDone).toBe(false);
    expect(page1.continueCursor).toBe("2");

    // Second page using returned cursor
    const page2 = await t.withIdentity(identity).action(api.payments.list, {
      organizationId,
      paginationOpts: { numItems: 2, cursor: page1.continueCursor },
    });
    expect(page2.page).toHaveLength(2);
    expect(page2.isDone).toBe(false);
    expect(page2.continueCursor).toBe("4");

    // Third (last) page: only one row left
    const page3 = await t.withIdentity(identity).action(api.payments.list, {
      organizationId,
      paginationOpts: { numItems: 2, cursor: page2.continueCursor },
    });
    expect(page3.page).toHaveLength(1);
    expect(page3.isDone).toBe(true);
    expect(page3.continueCursor).toBe("");

    // No overlap between pages
    const allIds = [...page1.page, ...page2.page, ...page3.page].map(
      (p: any) => p._id,
    );
    expect(new Set(allIds).size).toBe(5);
  });

  test("markPaid can change payment method", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const paymentId = await t.withIdentity(identity).action(
      api.payments.create,
      {
        organizationId,
        amount: 75,
        currency: "USD",
        paymentMethod: "cash",
        status: "pending",
      },
    );

    await t.withIdentity(identity).action(api.payments.markPaid, {
      organizationId,
      paymentId,
      paymentMethod: "card",
    });

    const result = await t.withIdentity(identity).action(api.payments.list, {
      organizationId,
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(result.page[0].paymentMethod).toBe("card");
  });
});
