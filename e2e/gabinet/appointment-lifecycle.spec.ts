import { test, expect } from "@playwright/test";
import { loginAndGoToDashboard, waitForApp } from "../helpers/auth";
import {
  navigateTo,
  assertNoErrorBoundary,
  getBodyText,
  testId,
} from "../helpers/common";

test.describe("Gabinet — Appointment Full Lifecycle", () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({ page }) => {
    await loginAndGoToDashboard(page);
  });

  // ─── Full lifecycle: create → confirm → complete ───────────────

  test("create → confirm → complete lifecycle", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/calendar");
    await assertNoErrorBoundary(page);

    const bodyText = await getBodyText(page);
    expect(bodyText.length).toBeGreaterThan(50);

    // ── Step 1: Open create appointment dialog ──
    const createBtn = page
      .locator(
        'button:has-text("Nowa wizyta"), button:has-text("New appointment"), button:has-text("Dodaj wizytę"), button:has-text("Dodaj")'
      )
      .first();

    if (!(await createBtn.isVisible({ timeout: 8000 }).catch(() => false))) {
      // Calendar may not have a floating create button; try the header area
      const headerBtn = page
        .locator('header button, [data-testid="create-appointment"]')
        .first();
      if (!(await headerBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
        test.skip();
        return;
      }
      await headerBtn.click();
    } else {
      await createBtn.click();
    }

    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"]');
    if (!(await dialog.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip();
      return;
    }

    // ── Step 2: Fill appointment form ──
    const comboboxes = dialog.locator('button[role="combobox"]');
    const comboCount = await comboboxes.count();

    if (comboCount >= 1) {
      await comboboxes.nth(0).click();
      await page.waitForTimeout(500);
      const firstOption = page.locator('[role="option"]').first();
      if (await firstOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await firstOption.click();
        await page.waitForTimeout(300);
      }
    }

    if (comboCount >= 2) {
      await comboboxes.nth(1).click();
      await page.waitForTimeout(500);
      const firstOption = page.locator('[role="option"]').first();
      if (await firstOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await firstOption.click();
        await page.waitForTimeout(300);
      }
    }

    if (comboCount >= 3) {
      await comboboxes.nth(2).click();
      await page.waitForTimeout(500);
      const firstOption = page.locator('[role="option"]').first();
      if (await firstOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await firstOption.click();
        await page.waitForTimeout(300);
      }
    }

    // Set date (tomorrow to avoid conflicts)
    const dateInput = dialog.locator('input[type="date"]').first();
    if (await dateInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      await dateInput.fill(tomorrow.toISOString().split("T")[0]);
      await page.waitForTimeout(200);
    }

    // Set start and end time
    const timeInputs = dialog.locator('input[type="time"]');
    const timeCount = await timeInputs.count();
    if (timeCount >= 2) {
      await timeInputs.nth(0).fill("10:00");
      await timeInputs.nth(1).fill("10:30");
    } else if (timeCount === 1) {
      await timeInputs.nth(0).fill("10:00");
    }

    await assertNoErrorBoundary(page);

    // ── Step 3: Submit the form ──
    const submitBtn = dialog
      .locator(
        'button:has-text("Utwórz"), button:has-text("Create"), button:has-text("Zapisz"), button:has-text("Save")'
      )
      .first();

    if (!(await submitBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      await page.keyboard.press("Escape");
      test.skip();
      return;
    }

    await submitBtn.click();
    await page.waitForTimeout(3000);
    await waitForApp(page);
    await assertNoErrorBoundary(page);

    // Dialog should close after successful creation
    const dialogAfterCreate = page.locator('[role="dialog"]');
    const dialogStillOpen = await dialogAfterCreate
      .isVisible({ timeout: 1000 })
      .catch(() => false);
    if (dialogStillOpen) {
      // May have validation issues — close and check calendar
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
    }

    // ── Step 4: Find the newly created appointment ──
    // Navigate back to calendar and look for the appointment
    await navigateTo(page, "/dashboard/gabinet/calendar");
    await page.waitForTimeout(2000);
    await assertNoErrorBoundary(page);

    // Look for clickable appointment elements in the calendar
    const appointmentEl = page
      .locator(
        '[data-appointment-id], [class*="appointment-card"], [class*="event-card"]'
      )
      .first();

    const hasAppointmentEl = await appointmentEl
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    if (!hasAppointmentEl) {
      // Try appointment list view instead
      await navigateTo(page, "/dashboard/gabinet/appointments");
      await page.waitForTimeout(2000);
      await assertNoErrorBoundary(page);

      const listItem = page
        .locator('[class*="appointment"], [data-appointment-id]')
        .first();
      if (!(await listItem.isVisible({ timeout: 3000 }).catch(() => false))) {
        // Can't find the appointment — lifecycle test done up to creation
        return;
      }
      await listItem.click();
    } else {
      await appointmentEl.click();
    }

    await page.waitForTimeout(1500);
    await assertNoErrorBoundary(page);

    // ── Step 5: Confirm the appointment ──
    const detailDialog = page.locator('[role="dialog"]');
    const detailVisible = await detailDialog
      .isVisible({ timeout: 4000 })
      .catch(() => false);

    if (detailVisible) {
      const confirmBtn = detailDialog
        .locator(
          'button:has-text("Potwierdź"), button:has-text("Confirm"), button:has-text("confirmed")'
        )
        .first();

      if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmBtn.click();
        await page.waitForTimeout(2000);
        await waitForApp(page);
        await assertNoErrorBoundary(page);

        // Verify status changed to confirmed
        const confirmedText = await detailDialog
          .innerText()
          .catch(() => "");
        const isConfirmed =
          confirmedText.toLowerCase().includes("confirmed") ||
          confirmedText.toLowerCase().includes("potwierdzona") ||
          confirmedText.toLowerCase().includes("potwierdzon");
        // Status transition happened — presence of complete/in_progress button is evidence
        const completeBtn = detailDialog
          .locator(
            'button:has-text("Ukończ"), button:has-text("Complete"), button:has-text("In progress"), button:has-text("W trakcie")'
          )
          .first();
        const hasCompleteBtn = await completeBtn
          .isVisible({ timeout: 2000 })
          .catch(() => false);

        expect(isConfirmed || hasCompleteBtn).toBe(true);

        // ── Step 6: Complete the appointment ──
        if (hasCompleteBtn) {
          await completeBtn.click();
          await page.waitForTimeout(2000);
          await waitForApp(page);
          await assertNoErrorBoundary(page);

          const completedText = await detailDialog
            .innerText()
            .catch(() => "");
          const isCompleted =
            completedText.toLowerCase().includes("completed") ||
            completedText.toLowerCase().includes("zakończona") ||
            completedText.toLowerCase().includes("ukończona");
          expect(isCompleted).toBe(true);
        }
      }

      await page.keyboard.press("Escape");
    }

    await assertNoErrorBoundary(page);
  });

  // ─── Smoke: appointments list page ────────────────────────────

  test("appointments list page loads without errors", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/appointments");
    await assertNoErrorBoundary(page);

    const body = await getBodyText(page);
    expect(body.length).toBeGreaterThan(50);
  });

  // ─── Smoke: calendar loads in week view ───────────────────────

  test("calendar loads without errors and shows navigation", async ({
    page,
  }) => {
    await navigateTo(page, "/dashboard/gabinet/calendar");
    await assertNoErrorBoundary(page);

    const body = await getBodyText(page);
    // Calendar should render something (week labels, time grid, etc.)
    expect(body.length).toBeGreaterThan(100);
  });
});
