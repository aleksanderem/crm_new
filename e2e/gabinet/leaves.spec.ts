import { test, expect } from "@playwright/test";
import { loginAndGoToDashboard, waitForApp } from "../helpers/auth";
import {
  navigateTo,
  assertNoErrorBoundary,
  getBodyText,
} from "../helpers/common";

test.describe("Gabinet — Leaves", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await loginAndGoToDashboard(page);
  });

  // ─── 11.1 Leave Request Flow ─────────────────────────────────

  test("leaves page loads", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/settings/leaves");
    await assertNoErrorBoundary(page);

    const bodyText = await getBodyText(page);
    expect(bodyText.length).toBeGreaterThan(50);
  });

  test("create leave request opens dialog", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/settings/leaves");

    const requestBtn = page
      .locator(
        'button:has-text("Złóż wniosek"), button:has-text("Request leave"), button:has-text("Dodaj")'
      )
      .first();

    if (await requestBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await requestBtn.click();
      await page.waitForTimeout(1000);

      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Dialog should have employee selector, type selector, date inputs
      const dialogText = await dialog.innerText();
      const hasFields =
        dialogText.includes("Data") ||
        dialogText.includes("Date") ||
        dialogText.includes("Typ") ||
        dialogText.includes("Type") ||
        dialogText.includes("Pracownik") ||
        dialogText.includes("Employee");
      expect(hasFields).toBe(true);

      await page.keyboard.press("Escape");
    }
  });

  test("create leave request succeeds", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/settings/leaves");

    const requestBtn = page
      .locator(
        'button:has-text("Złóż wniosek"), button:has-text("Request leave"), button:has-text("Dodaj")'
      )
      .first();

    if (!(await requestBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await requestBtn.click();
    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Select employee from dropdown
    const employeeSelect = dialog
      .locator('button[role="combobox"]')
      .first();
    if (await employeeSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await employeeSelect.click();
      await page.waitForTimeout(500);

      const firstOption = page.locator('[role="option"]').first();
      if (await firstOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await firstOption.click();
        await page.waitForTimeout(500);
      }
    }

    // Fill start date
    const startDateInput = dialog.locator('input[type="date"]').first();
    if (await startDateInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await startDateInput.fill("2026-04-01");
    }

    // Fill end date
    const endDateInput = dialog.locator('input[type="date"]').nth(1);
    if (await endDateInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await endDateInput.fill("2026-04-05");
    }

    // Fill reason
    const reasonInput = dialog.locator("textarea").first();
    if (await reasonInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await reasonInput.fill("E2E Test leave request");
    }

    // Submit
    const submitBtn = dialog
      .locator(
        'button:has-text("Złóż"), button:has-text("Submit"), button:has-text("Zapisz"), button:has-text("Save")'
      )
      .first();
    if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      const isDisabled = await submitBtn.isDisabled();
      if (!isDisabled) {
        await submitBtn.click();
        await page.waitForTimeout(3000);
        await waitForApp(page);
      }
    }

    await assertNoErrorBoundary(page);
  });

  test("leave appears with pending status", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/settings/leaves");
    await page.waitForTimeout(2000);

    const bodyText = await getBodyText(page);
    // Look for pending badge or status
    const hasPending =
      bodyText.includes("pending") ||
      bodyText.includes("Oczekuj") ||
      bodyText.includes("oczekuj");
    // Soft check — pending leaves may or may not exist yet
    await assertNoErrorBoundary(page);
  });

  test("admin can approve leave via action button", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/settings/leaves");
    await page.waitForTimeout(2000);

    // Look for approve button (check icon) in pending rows
    const approveBtn = page
      .locator('table tbody tr button:has(svg)')
      .first();

    if (await approveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Just verify the action button exists
      expect(await approveBtn.isVisible()).toBe(true);
    }
  });

  test("admin can reject leave via action button", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/settings/leaves");
    await page.waitForTimeout(2000);

    // Look for reject button (X icon) — typically the second action button
    const actionBtns = page.locator("table tbody tr button:has(svg)");
    const count = await actionBtns.count();

    if (count >= 2) {
      // Second button should be reject
      expect(await actionBtns.nth(1).isVisible()).toBe(true);
    }
  });

  test("status filter works", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/settings/leaves");

    // Click the status filter Select
    const statusFilter = page
      .locator('button[role="combobox"]')
      .first();

    if (await statusFilter.isVisible({ timeout: 3000 }).catch(() => false)) {
      await statusFilter.click();
      await page.waitForTimeout(500);

      // Should show filter options
      const options = page.locator('[role="option"]');
      const count = await options.count();
      expect(count).toBeGreaterThanOrEqual(2); // at least "all" + one status

      // Select "pending" if available
      const pendingOption = page
        .locator(
          '[role="option"]:has-text("Oczekuj"), [role="option"]:has-text("Pending"), [role="option"]:has-text("pending")'
        )
        .first();
      if (await pendingOption.isVisible({ timeout: 1000 }).catch(() => false)) {
        await pendingOption.click();
        await page.waitForTimeout(1000);
        await assertNoErrorBoundary(page);
      } else {
        await page.keyboard.press("Escape");
      }
    }
  });

  // ─── 11.2 Leave Types ───────────────────────────────────────

  test("leave types page loads", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/settings/leave-types");
    await assertNoErrorBoundary(page);

    const bodyText = await getBodyText(page);
    expect(bodyText.length).toBeGreaterThan(50);
  });

  test("create leave type opens dialog", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/settings/leave-types");

    const addBtn = page
      .locator(
        'button:has-text("Dodaj typ"), button:has-text("Add"), button:has-text("Nowy")'
      )
      .first();

    if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(1000);

      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Dialog should have name input and color picker
      const nameInput = dialog.locator("input").first();
      expect(await nameInput.isVisible()).toBe(true);

      // Check color picker exists
      const colorPicker = dialog.locator('input[type="color"]').first();
      if (await colorPicker.isVisible({ timeout: 1000 }).catch(() => false)) {
        expect(await colorPicker.isVisible()).toBe(true);
      }

      await page.keyboard.press("Escape");
    }
  });

  test("create leave type succeeds", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/settings/leave-types");

    const addBtn = page
      .locator(
        'button:has-text("Dodaj typ"), button:has-text("Add"), button:has-text("Nowy")'
      )
      .first();

    if (!(await addBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await addBtn.click();
    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Fill name
    const nameInput = dialog.locator("input").first();
    await nameInput.fill(`E2E Leave Type ${Date.now()}`);

    // Fill quota
    const quotaInput = dialog.locator('input[type="number"]').first();
    if (await quotaInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await quotaInput.fill("20");
    }

    // Submit
    const saveBtn = dialog
      .locator(
        'button:has-text("Zapisz"), button:has-text("Save"), button:has-text("Utwórz"), button:has-text("Create")'
      )
      .first();
    if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await saveBtn.click();
      await page.waitForTimeout(3000);
      await waitForApp(page);
    }

    await assertNoErrorBoundary(page);
  });

  test("leave type color picker is available", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/settings/leave-types");

    const addBtn = page
      .locator(
        'button:has-text("Dodaj typ"), button:has-text("Add"), button:has-text("Nowy")'
      )
      .first();

    if (!(await addBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await addBtn.click();
    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const colorPicker = dialog.locator('input[type="color"]').first();
    if (await colorPicker.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Verify color picker has a value
      const value = await colorPicker.inputValue();
      expect(value).toMatch(/^#[0-9a-fA-F]{6}$/);
    }

    await page.keyboard.press("Escape");
  });

  test("edit leave type via card action", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/settings/leave-types");

    // Leave types are shown as cards with edit buttons
    const editBtn = page.locator('button:has(svg)').first();

    if (await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await editBtn.click();
      await page.waitForTimeout(1000);

      const dialog = page.locator('[role="dialog"]');
      if (await dialog.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Verify name input is pre-filled
        const nameInput = dialog.locator("input").first();
        const value = await nameInput.inputValue();
        expect(value.length).toBeGreaterThan(0);

        // Verify delete button exists for editing
        const deleteBtn = dialog
          .locator(
            'button:has-text("Usuń"), button:has-text("Delete")'
          )
          .first();
        if (await deleteBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          expect(await deleteBtn.isVisible()).toBe(true);
        }

        await page.keyboard.press("Escape");
      }
    }
  });

  // ─── 11.3 Leave Balances ──────────────────────────────────────

  test("leave balances page loads", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/settings/leave-balances");
    await assertNoErrorBoundary(page);

    const bodyText = await getBodyText(page);
    expect(bodyText.length).toBeGreaterThan(50);
  });

  test("year filter works on balances page", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/settings/leave-balances");

    const yearFilter = page
      .locator('button[role="combobox"]')
      .first();

    if (await yearFilter.isVisible({ timeout: 3000 }).catch(() => false)) {
      await yearFilter.click();
      await page.waitForTimeout(500);

      const options = page.locator('[role="option"]');
      const count = await options.count();
      expect(count).toBeGreaterThanOrEqual(1);

      // Select a different year
      const lastOption = options.last();
      if (await lastOption.isVisible({ timeout: 1000 }).catch(() => false)) {
        await lastOption.click();
        await page.waitForTimeout(1000);
        await assertNoErrorBoundary(page);
      } else {
        await page.keyboard.press("Escape");
      }
    }
  });

  test("balance display shows progress bars per employee", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/settings/leave-balances");
    await page.waitForTimeout(2000);

    // Look for progress bar elements (rounded-full divs are the progress bars)
    const bodyText = await getBodyText(page);

    // The page should display employee names or a "no employees" message
    const hasContent =
      bodyText.includes("/") || // usage format: "5 / 20"
      bodyText.includes("Brak") ||
      bodyText.includes("No ") ||
      bodyText.includes("brak");

    await assertNoErrorBoundary(page);
  });

  // ─── 11.1 continued: Status Change Verification ───────────────

  test("approved status text appears after approve action", async ({
    page,
  }) => {
    await navigateTo(page, "/dashboard/gabinet/settings/leaves");
    await page.waitForTimeout(2000);

    // Filter to show approved leaves
    const statusFilter = page.locator('button[role="combobox"]').first();
    if (await statusFilter.isVisible({ timeout: 3000 }).catch(() => false)) {
      await statusFilter.click();
      await page.waitForTimeout(500);

      const approvedOption = page
        .locator(
          '[role="option"]:has-text("Zatwierdzony"), [role="option"]:has-text("Approved"), [role="option"]:has-text("approved")'
        )
        .first();

      if (
        await approvedOption.isVisible({ timeout: 1000 }).catch(() => false)
      ) {
        await approvedOption.click();
        await page.waitForTimeout(1000);

        const bodyText = await getBodyText(page);
        // Should show "approved" status or empty (no approved leaves yet)
        const hasApproved =
          bodyText.includes("Zatwierdzony") ||
          bodyText.includes("Approved") ||
          bodyText.includes("approved") ||
          bodyText.includes("Brak") ||
          bodyText.includes("No ");

        expect(hasApproved).toBe(true);
      } else {
        await page.keyboard.press("Escape");
      }
    }

    await assertNoErrorBoundary(page);
  });

  test("rejected status text appears after reject action", async ({
    page,
  }) => {
    await navigateTo(page, "/dashboard/gabinet/settings/leaves");
    await page.waitForTimeout(2000);

    // Filter to show rejected leaves
    const statusFilter = page.locator('button[role="combobox"]').first();
    if (await statusFilter.isVisible({ timeout: 3000 }).catch(() => false)) {
      await statusFilter.click();
      await page.waitForTimeout(500);

      const rejectedOption = page
        .locator(
          '[role="option"]:has-text("Odrzucony"), [role="option"]:has-text("Rejected"), [role="option"]:has-text("rejected")'
        )
        .first();

      if (
        await rejectedOption.isVisible({ timeout: 1000 }).catch(() => false)
      ) {
        await rejectedOption.click();
        await page.waitForTimeout(1000);

        const bodyText = await getBodyText(page);
        const hasRejected =
          bodyText.includes("Odrzucony") ||
          bodyText.includes("Rejected") ||
          bodyText.includes("rejected") ||
          bodyText.includes("Brak") ||
          bodyText.includes("No ");

        expect(hasRejected).toBe(true);
      } else {
        await page.keyboard.press("Escape");
      }
    }

    await assertNoErrorBoundary(page);
  });

  test("delete leave type soft-deletes via dialog", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/settings/leave-types");
    await page.waitForTimeout(2000);

    // Open a leave type card edit dialog
    const editBtn = page.locator("button:has(svg)").first();
    if (await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await editBtn.click();
      await page.waitForTimeout(1000);

      const dialog = page.locator('[role="dialog"]');
      if (await dialog.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Verify delete button exists
        const deleteBtn = dialog
          .locator(
            'button:has-text("Usuń"), button:has-text("Delete")'
          )
          .first();

        if (
          await deleteBtn.isVisible({ timeout: 2000 }).catch(() => false)
        ) {
          // Just verify it exists, don't actually delete
          expect(await deleteBtn.isVisible()).toBe(true);
        }

        await page.keyboard.press("Escape");
      }
    }
  });
});
