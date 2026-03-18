import { expect, test, describe } from "vitest";
import { api } from "../_generated/api";
import { createTestCtx, seedTestUser } from "../_test_helpers";

describe("payments", () => {
  test("create a pending payment", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const paymentId = await t.withIdentity(identity).mutation(
      api.payments.create,
      {
        organizationId,
        amount: 100,
        currency: "USD",
        paymentMethod: "cash",
      },
    );

    expect(paymentId).toBeTruthy();

    // Verify the payment is in the list with pending status
    const result = await t.withIdentity(identity).query(api.payments.list, {
      organizationId,
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(result.page).toHaveLength(1);
    expect(result.page[0].status).toBe("pending");
    expect(result.page[0].amount).toBe(100);
  });

  test("mark a pending payment as paid", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const paymentId = await t.withIdentity(identity).mutation(
      api.payments.create,
      {
        organizationId,
        amount: 200,
        currency: "EUR",
        paymentMethod: "card",
      },
    );

    await t.withIdentity(identity).mutation(api.payments.markPaid, {
      organizationId,
      paymentId,
    });

    const result = await t.withIdentity(identity).query(api.payments.list, {
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

    const paymentId = await t.withIdentity(identity).mutation(
      api.payments.create,
      {
        organizationId,
        amount: 50,
        currency: "USD",
        paymentMethod: "transfer",
      },
    );

    // Mark as paid first
    await t.withIdentity(identity).mutation(api.payments.markPaid, {
      organizationId,
      paymentId,
    });

    // Try to mark as paid again — should fail
    await expect(
      t.withIdentity(identity).mutation(api.payments.markPaid, {
        organizationId,
        paymentId,
      }),
    ).rejects.toThrow("Cannot mark completed payment as paid");
  });

  test("refund a completed payment", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const paymentId = await t.withIdentity(identity).mutation(
      api.payments.create,
      {
        organizationId,
        amount: 300,
        currency: "USD",
        paymentMethod: "card",
      },
    );

    await t.withIdentity(identity).mutation(api.payments.markPaid, {
      organizationId,
      paymentId,
    });

    await t.withIdentity(identity).mutation(api.payments.refund, {
      organizationId,
      paymentId,
      reason: "Patient request",
    });

    const result = await t.withIdentity(identity).query(api.payments.list, {
      organizationId,
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(result.page[0].status).toBe("refunded");
    expect(result.page[0].notes).toContain("Refund: Patient request");
  });

  test("cannot refund a pending payment", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const paymentId = await t.withIdentity(identity).mutation(
      api.payments.create,
      {
        organizationId,
        amount: 50,
        currency: "USD",
        paymentMethod: "cash",
      },
    );

    await expect(
      t.withIdentity(identity).mutation(api.payments.refund, {
        organizationId,
        paymentId,
      }),
    ).rejects.toThrow("Cannot refund a pending payment");
  });

  test("revenue summary aggregates completed payments", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const now = Date.now();

    // Create and complete two payments
    for (const amount of [100, 250]) {
      const id = await t.withIdentity(identity).mutation(
        api.payments.create,
        {
          organizationId,
          amount,
          currency: "USD",
          paymentMethod: "cash",
        },
      );
      await t.withIdentity(identity).mutation(api.payments.markPaid, {
        organizationId,
        paymentId: id,
      });
    }

    // Create a pending payment (should not be counted)
    await t.withIdentity(identity).mutation(api.payments.create, {
      organizationId,
      amount: 999,
      currency: "USD",
      paymentMethod: "card",
    });

    const summary = await t.withIdentity(identity).query(
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

  test("markPaid can change payment method", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const paymentId = await t.withIdentity(identity).mutation(
      api.payments.create,
      {
        organizationId,
        amount: 75,
        currency: "USD",
        paymentMethod: "cash",
      },
    );

    await t.withIdentity(identity).mutation(api.payments.markPaid, {
      organizationId,
      paymentId,
      paymentMethod: "card",
    });

    const result = await t.withIdentity(identity).query(api.payments.list, {
      organizationId,
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(result.page[0].paymentMethod).toBe("card");
  });
});
