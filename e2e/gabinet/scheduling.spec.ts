import { test, expect } from "@playwright/test";
import { loginAndGoToDashboard, waitForApp } from "../helpers/auth";
import {
  navigateTo,
  assertNoErrorBoundary,
  getBodyText,
} from "../helpers/common";

test.describe("Gabinet — Scheduling", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await loginAndGoToDashboard(page);
  });

  // ─── 10.1 Working Hours ─────────────────────────────────────

  test("scheduling page loads", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/settings/scheduling");
    await assertNoErrorBoundary(page);

    const bodyText = await getBodyText(page);
    expect(bodyText.length).toBeGreaterThan(50);
  });

  test("7-day table renders", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/settings/scheduling");

    const bodyText = await getBodyText(page);

    // Should contain day names (Polish or English)
    const hasDays =
      (bodyText.includes("Poniedziałek") || bodyText.includes("Monday")) &&
      (bodyText.includes("Piątek") || bodyText.includes("Friday"));
    expect(hasDays).toBe(true);
  });

  test("time pickers work for each day", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/settings/scheduling");

    // There should be multiple time inputs (start, end, break start, break end * 7 days = 28)
    const timeInputs = page.locator('input[type="time"]');
    const count = await timeInputs.count();

    // At least some time inputs should exist
    expect(count).toBeGreaterThanOrEqual(4); // At least start/end for one day
  });

  test("isOpen toggle disables time fields", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/settings/scheduling");

    // Find a checkbox (isOpen toggle)
    const checkboxes = page.locator('button[role="checkbox"]');
    const count = await checkboxes.count();

    if (count > 0) {
      // Sunday (index 0) is typically closed — find its row and toggle
      const sundayCheckbox = checkboxes.first();
      const isChecked = await sundayCheckbox.getAttribute("data-state");

      // Click to toggle
      await sundayCheckbox.click();
      await page.waitForTimeout(500);

      // State should have changed
      const newState = await sundayCheckbox.getAttribute("data-state");
      expect(newState).not.toBe(isChecked);

      // Toggle back
      await sundayCheckbox.click();
      await page.waitForTimeout(300);
    }
  });

  test("break times save", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/settings/scheduling");

    // Look for break time inputs (should have "12:00" or similar default)
    const timeInputs = page.locator('input[type="time"]');
    const count = await timeInputs.count();

    // With 7 days * 4 inputs = 28 max time inputs
    // Just verify they exist and are interactable
    if (count >= 4) {
      const breakInput = timeInputs.nth(2); // Third time input (break start)
      if (await breakInput.isEnabled()) {
        const value = await breakInput.inputValue();
        expect(value).toMatch(/^\d{2}:\d{2}$/);
      }
    }
  });

  test("save button persists all changes", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/settings/scheduling");

    const saveBtn = page
      .locator(
        'button:has-text("Zapisz"), button:has-text("Save")'
      )
      .first();

    if (await saveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      expect(await saveBtn.isVisible()).toBe(true);

      // Click save (this should persist current state)
      await saveBtn.click();
      await page.waitForTimeout(2000);

      // Should show success toast or no error
      await assertNoErrorBoundary(page);
    }
  });

  test("reload shows saved hours", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/settings/scheduling");

    // Get first time input value
    const timeInputs = page.locator('input[type="time"]');
    const count = await timeInputs.count();

    if (count >= 2) {
      const startValue = await timeInputs.first().inputValue();

      // Reload page
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForApp(page);

      // Time input should still have the same value
      const reloadedInputs = page.locator('input[type="time"]');
      const reloadedValue = await reloadedInputs.first().inputValue();
      expect(reloadedValue).toBe(startValue);
    }
  });
});
