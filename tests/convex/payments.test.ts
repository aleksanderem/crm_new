import { afterEach, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";

afterEach(async () => {
  // Let any pending setTimeout(0) side-effect callbacks from the test fire
  // against the *current* instance before the next test creates a new one.
  // The process-wide scheduler-noise filter installed in tests/convex/_setup.ts
  // silently consumes the orphan-write rejections that still escape this yield.
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

  // Patient credit / overpayment carry-forward (#1059) -----------------------
  //
  // The payments backend treats `patientId` as an opaque string for credit
  // computations — it just keys the ledger and never reads from
  // `gabinetPatients`. So we don't need to seed a real patient row; a
  // stable string suffices to scope these tests.
  const TEST_PATIENT_ID = "test-patient-credit-1";

  test("getPatientCredit returns zero for a patient with no payments", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    const patientId = TEST_PATIENT_ID;

    const result = await t
      .withIdentity(identity)
      .action(api.payments.getPatientCredit, {
        organizationId,
        patientId: String(patientId),
      });

    expect(result.balance).toBe(0);
    expect(result.history).toHaveLength(0);
  });

  test("overpayment writes credit and increases patient balance", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    const patientId = TEST_PATIENT_ID;

    await t.withIdentity(identity).action(api.payments.create, {
      organizationId,
      patientId: String(patientId),
      amount: 600,
      currency: "PLN",
      paymentMethod: "cash",
      creditEarned: 500,
    });

    const credit = await t
      .withIdentity(identity)
      .action(api.payments.getPatientCredit, {
        organizationId,
        patientId: String(patientId),
      });
    expect(credit.balance).toBe(500);
    expect(credit.history).toHaveLength(1);
    expect(credit.history[0].creditEarned).toBe(500);
  });

  test("applying credit reduces patient balance", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    const patientId = TEST_PATIENT_ID;

    // Seed 500 credit
    await t.withIdentity(identity).action(api.payments.create, {
      organizationId,
      patientId: String(patientId),
      amount: 600,
      currency: "PLN",
      paymentMethod: "cash",
      creditEarned: 500,
    });

    // Apply 200 credit on a next visit (cash leg = 0)
    await t.withIdentity(identity).action(api.payments.create, {
      organizationId,
      patientId: String(patientId),
      amount: 0,
      currency: "PLN",
      paymentMethod: "cash",
      creditApplied: 200,
    });

    const credit = await t
      .withIdentity(identity)
      .action(api.payments.getPatientCredit, {
        organizationId,
        patientId: String(patientId),
      });
    expect(credit.balance).toBe(300);
  });

  test("creditApplied exceeding balance is rejected", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    const patientId = TEST_PATIENT_ID;

    // Seed 100 credit
    await t.withIdentity(identity).action(api.payments.create, {
      organizationId,
      patientId: String(patientId),
      amount: 200,
      currency: "PLN",
      paymentMethod: "cash",
      creditEarned: 100,
    });

    await expect(
      t.withIdentity(identity).action(api.payments.create, {
        organizationId,
        patientId: String(patientId),
        amount: 0,
        currency: "PLN",
        paymentMethod: "cash",
        creditApplied: 200,
      }),
    ).rejects.toThrow(/exceeds available balance/);
  });

  test("refundCredit drains the credit balance", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    const patientId = TEST_PATIENT_ID;

    await t.withIdentity(identity).action(api.payments.create, {
      organizationId,
      patientId: String(patientId),
      amount: 500,
      currency: "PLN",
      paymentMethod: "cash",
      creditEarned: 500,
    });

    await t.withIdentity(identity).action(api.payments.refundCredit, {
      organizationId,
      patientId: String(patientId),
      amount: 300,
      paymentMethod: "cash",
    });

    const credit = await t
      .withIdentity(identity)
      .action(api.payments.getPatientCredit, {
        organizationId,
        patientId: String(patientId),
      });
    expect(credit.balance).toBe(200);
  });

  test("refundCredit beyond balance is rejected", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    const patientId = TEST_PATIENT_ID;

    await t.withIdentity(identity).action(api.payments.create, {
      organizationId,
      patientId: String(patientId),
      amount: 100,
      currency: "PLN",
      paymentMethod: "cash",
      creditEarned: 100,
    });

    await expect(
      t.withIdentity(identity).action(api.payments.refundCredit, {
        organizationId,
        patientId: String(patientId),
        amount: 500,
        paymentMethod: "cash",
      }),
    ).rejects.toThrow(/exceeds available credit/);
  });

  test("refundCredit is admin-only", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t, {
      role: "member",
    });
    const patientId = TEST_PATIENT_ID;

    await expect(
      t.withIdentity(identity).action(api.payments.refundCredit, {
        organizationId,
        patientId: String(patientId),
        amount: 50,
        paymentMethod: "cash",
      }),
    ).rejects.toThrow(/admins can refund/);
  });

  test("refunding a payment with creditEarned releases that credit", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    const patientId = TEST_PATIENT_ID;

    const paymentId = await t
      .withIdentity(identity)
      .action(api.payments.create, {
        organizationId,
        patientId: String(patientId),
        amount: 600,
        currency: "PLN",
        paymentMethod: "cash",
        creditEarned: 500,
      });

    let credit = await t
      .withIdentity(identity)
      .action(api.payments.getPatientCredit, {
        organizationId,
        patientId: String(patientId),
      });
    expect(credit.balance).toBe(500);

    await t.withIdentity(identity).action(api.payments.refund, {
      organizationId,
      paymentId,
      reason: "Patient cancelled",
    });

    credit = await t
      .withIdentity(identity)
      .action(api.payments.getPatientCredit, {
        organizationId,
        patientId: String(patientId),
      });
    expect(credit.balance).toBe(0);
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
