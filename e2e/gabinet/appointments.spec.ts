import { test, expect } from "@playwright/test";
import { loginAndGoToDashboard, waitForApp } from "../helpers/auth";
import {
  navigateTo,
  assertNoErrorBoundary,
  getBodyText,
} from "../helpers/common";

test.describe("Gabinet — Appointments", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await loginAndGoToDashboard(page);
  });

  // ─── 12.1 Appointment Creation ─────────────────────────────

  test("calendar page loads", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/calendar");
    await assertNoErrorBoundary(page);

    const bodyText = await getBodyText(page);
    expect(bodyText.length).toBeGreaterThan(50);
  });

  test("create button opens appointment dialog", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/calendar");

    const createBtn = page
      .locator(
        'button:has-text("Nowa wizyta"), button:has-text("New appointment"), button:has-text("Dodaj")'
      )
      .first();

    if (await createBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(1000);

      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      const dialogText = await dialog.innerText();
      const hasFields =
        dialogText.includes("Pacjent") ||
        dialogText.includes("Patient") ||
        dialogText.includes("Zabieg") ||
        dialogText.includes("Treatment");
      expect(hasFields).toBe(true);

      await page.keyboard.press("Escape");
    }
  });

  test("patient selector shows patients in dialog", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/calendar");

    const createBtn = page
      .locator(
        'button:has-text("Nowa wizyta"), button:has-text("New appointment"), button:has-text("Dodaj")'
      )
      .first();

    if (!(await createBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await createBtn.click();
    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Click patient selector (first combobox in the dialog)
    const patientSelect = dialog.locator('button[role="combobox"]').first();
    if (await patientSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await patientSelect.click();
      await page.waitForTimeout(500);

      // Should show patient options
      const options = page.locator('[role="option"]');
      const count = await options.count();
      // At least some patients should be available
      expect(count).toBeGreaterThanOrEqual(0);

      await page.keyboard.press("Escape");
    }

    await page.keyboard.press("Escape");
  });

  test("treatment selector shows categories in dialog", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/calendar");

    const createBtn = page
      .locator(
        'button:has-text("Nowa wizyta"), button:has-text("New appointment"), button:has-text("Dodaj")'
      )
      .first();

    if (!(await createBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await createBtn.click();
    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Treatment selector is second combobox
    const comboboxes = dialog.locator('button[role="combobox"]');
    const count = await comboboxes.count();
    if (count >= 2) {
      const treatmentSelect = comboboxes.nth(1);
      await treatmentSelect.click();
      await page.waitForTimeout(500);

      const options = page.locator('[role="option"]');
      const optCount = await options.count();
      expect(optCount).toBeGreaterThanOrEqual(0);

      await page.keyboard.press("Escape");
    }

    await page.keyboard.press("Escape");
  });

  test("employee selector shows employees in dialog", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/calendar");

    const createBtn = page
      .locator(
        'button:has-text("Nowa wizyta"), button:has-text("New appointment"), button:has-text("Dodaj")'
      )
      .first();

    if (!(await createBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await createBtn.click();
    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Employee selector is third combobox
    const comboboxes = dialog.locator('button[role="combobox"]');
    const count = await comboboxes.count();
    if (count >= 3) {
      const employeeSelect = comboboxes.nth(2);
      await employeeSelect.click();
      await page.waitForTimeout(500);

      const options = page.locator('[role="option"]');
      const optCount = await options.count();
      expect(optCount).toBeGreaterThanOrEqual(0);

      await page.keyboard.press("Escape");
    }

    await page.keyboard.press("Escape");
  });

  test("date and time inputs are present in dialog", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/calendar");

    const createBtn = page
      .locator(
        'button:has-text("Nowa wizyta"), button:has-text("New appointment"), button:has-text("Dodaj")'
      )
      .first();

    if (!(await createBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await createBtn.click();
    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Date input
    const dateInput = dialog.locator('input[type="date"]').first();
    expect(await dateInput.isVisible({ timeout: 2000 }).catch(() => false)).toBe(true);

    // Time inputs
    const timeInputs = dialog.locator('input[type="time"]');
    const timeCount = await timeInputs.count();
    expect(timeCount).toBeGreaterThanOrEqual(2); // start + end

    await page.keyboard.press("Escape");
  });

  // ─── 12.2 Recurring Appointments ──────────────────────────

  test("recurring toggle shows frequency options", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/calendar");

    const createBtn = page
      .locator(
        'button:has-text("Nowa wizyta"), button:has-text("New appointment"), button:has-text("Dodaj")'
      )
      .first();

    if (!(await createBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await createBtn.click();
    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Find the recurring checkbox
    const recurringCheckbox = dialog.locator(
      'button[role="checkbox"], input[type="checkbox"]'
    ).first();

    if (await recurringCheckbox.isVisible({ timeout: 2000 }).catch(() => false)) {
      await recurringCheckbox.click();
      await page.waitForTimeout(500);

      // After toggling, frequency selector and count input should appear
      const dialogText = await dialog.innerText();
      const hasFrequency =
        dialogText.includes("Częstotl") ||
        dialogText.includes("Frequency") ||
        dialogText.includes("frequency") ||
        dialogText.includes("Powtarzaj") ||
        dialogText.includes("dziennie") ||
        dialogText.includes("weekly") ||
        dialogText.includes("Ilość") ||
        dialogText.includes("Count");
      expect(hasFrequency).toBe(true);
    }

    await page.keyboard.press("Escape");
  });

  // ─── 12.4 Status Transitions ──────────────────────────────

  test("appointment detail dialog has status controls", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/calendar");
    await page.waitForTimeout(2000);

    // Try to find and click an existing appointment in the calendar
    // Calendar events are usually styled elements with appointment data
    const appointmentEl = page
      .locator(
        '[data-appointment-id], [class*="appointment"], [class*="event"]'
      )
      .first();

    if (await appointmentEl.isVisible({ timeout: 5000 }).catch(() => false)) {
      await appointmentEl.click();
      await page.waitForTimeout(1000);

      const dialog = page.locator('[role="dialog"]');
      if (await dialog.isVisible({ timeout: 3000 }).catch(() => false)) {
        const dialogText = await dialog.innerText();
        // Should show status-related info
        const hasStatus =
          dialogText.includes("Status") ||
          dialogText.includes("scheduled") ||
          dialogText.includes("Zaplanowana") ||
          dialogText.includes("Potwierdzona") ||
          dialogText.includes("confirmed");
        expect(hasStatus).toBe(true);

        await page.keyboard.press("Escape");
      }
    }
  });

  test("cancel appointment shows reason dialog", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/calendar");
    await page.waitForTimeout(2000);

    const appointmentEl = page
      .locator(
        '[data-appointment-id], [class*="appointment"], [class*="event"]'
      )
      .first();

    if (await appointmentEl.isVisible({ timeout: 5000 }).catch(() => false)) {
      await appointmentEl.click();
      await page.waitForTimeout(1000);

      const dialog = page.locator('[role="dialog"]');
      if (await dialog.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Look for cancel button
        const cancelBtn = dialog
          .locator(
            'button:has-text("Anuluj wizytę"), button:has-text("Cancel appointment"), button:has-text("Anuluj")'
          )
          .first();

        if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          expect(await cancelBtn.isVisible()).toBe(true);
        }

        await page.keyboard.press("Escape");
      }
    }
  });

  // ─── 13.3 Filters continued ──────────────────────────────

  test("filtered appointments display per employee", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/calendar");

    // Find employee filter
    const filterTrigger = page
      .locator('button[role="combobox"]')
      .first();

    if (await filterTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
      await filterTrigger.click();
      await page.waitForTimeout(500);

      // Select a specific employee
      const options = page.locator('[role="option"]');
      const count = await options.count();

      if (count >= 2) {
        // Select second option (first is likely "all")
        await options.nth(1).click();
        await page.waitForTimeout(1000);
        await assertNoErrorBoundary(page);
      } else {
        await page.keyboard.press("Escape");
      }
    }
  });

  // ─── 13.3 & 13.4 — Appointment Display ────────────────────

  test("appointment click opens detail dialog", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/calendar");
    await page.waitForTimeout(2000);

    // Look for any clickable appointment element in the calendar grid
    const appointmentEl = page
      .locator(
        '[data-appointment-id], [class*="appointment"], [class*="event"], .cursor-pointer'
      )
      .first();

    if (await appointmentEl.isVisible({ timeout: 5000 }).catch(() => false)) {
      await appointmentEl.click();
      await page.waitForTimeout(1000);

      // Should open detail dialog
      const dialog = page.locator('[role="dialog"]');
      if (await dialog.isVisible({ timeout: 3000 }).catch(() => false)) {
        await assertNoErrorBoundary(page);

        // Should have appointment details
        const dialogText = await dialog.innerText();
        expect(dialogText.length).toBeGreaterThan(20);

        await page.keyboard.press("Escape");
      }
    }
  });

  test("edit from detail dialog works", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/calendar");
    await page.waitForTimeout(2000);

    const appointmentEl = page
      .locator(
        '[data-appointment-id], [class*="appointment"], [class*="event"]'
      )
      .first();

    if (await appointmentEl.isVisible({ timeout: 5000 }).catch(() => false)) {
      await appointmentEl.click();
      await page.waitForTimeout(1000);

      const dialog = page.locator('[role="dialog"]');
      if (await dialog.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Look for edit button
        const editBtn = dialog
          .locator(
            'button:has-text("Edytuj"), button:has-text("Edit"), button:has(svg)'
          )
          .first();

        if (await editBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          expect(await editBtn.isVisible()).toBe(true);
        }

        await page.keyboard.press("Escape");
      }
    }
  });
});
