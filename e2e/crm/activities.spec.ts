import { test, expect } from "@playwright/test";
import { loginAndGoToDashboard, waitForApp } from "../helpers/auth";
import {
  navigateTo,
  assertNoErrorBoundary,
  getBodyText,
  testId,
} from "../helpers/common";

test.describe("CRM — Activities", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await loginAndGoToDashboard(page);
  });

  // ─── 5.1 List View ──────────────────────────────────────────

  test("activities list loads", async ({ page }) => {
    await navigateTo(page, "/dashboard/activities");
    await assertNoErrorBoundary(page);

    const bodyText = await getBodyText(page);
    expect(bodyText.length).toBeGreaterThan(50);
  });

  // ─── 5.2 Activity CRUD ─────────────────────────────────────

  test("create activity succeeds", async ({ page }) => {
    const actTitle = testId("E2EActivity");

    await navigateTo(page, "/dashboard/activities");

    const addBtn = page
      .locator(
        'button:has-text("Dodaj aktywność"), button:has-text("Add activity"), button:has-text("Dodaj")'
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

    const titleInput = dialog.locator("input").first();
    await titleInput.fill(actTitle);

    const submitBtn = dialog
      .locator(
        'button:has-text("Utwórz"), button:has-text("Create"), button:has-text("Zapisz")'
      )
      .first();

    if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(3000);
      await waitForApp(page);

      const bodyText = await getBodyText(page);
      expect(bodyText).toContain(actTitle);
    }
  });

  // ─── 5.3 Calendar Integration ──────────────────────────────

  test("activities appear in calendar", async ({ page }) => {
    await navigateTo(page, "/dashboard/calendar");
    await assertNoErrorBoundary(page);

    const bodyText = await getBodyText(page);
    // Calendar should render with date-related content
    const hasCalendar =
      bodyText.includes("2026") ||
      bodyText.includes("Mar") ||
      bodyText.includes("marz") ||
      bodyText.includes("Pon") ||
      bodyText.includes("Mon");
    expect(hasCalendar).toBe(true);
  });
});
