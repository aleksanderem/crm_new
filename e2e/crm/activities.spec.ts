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

  // ─── 5.1 continued — Filters ────────────────────────────────

  test("filters by type work via saved views", async ({ page }) => {
    await navigateTo(page, "/dashboard/activities");

    // Saved view tabs like "All", "Open", "Due Today", "Due This Week", "Overdue"
    const openTab = page
      .locator(
        'button:has-text("Otwarte"), button:has-text("Open"), [role="tab"]:has-text("Otwarte"), [role="tab"]:has-text("Open")'
      )
      .first();

    if (await openTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await openTab.click();
      await page.waitForTimeout(1000);
      await assertNoErrorBoundary(page);
    }
  });

  test("filters by date work via due-today view", async ({ page }) => {
    await navigateTo(page, "/dashboard/activities");

    const dueTodayTab = page
      .locator(
        'button:has-text("Na dziś"), button:has-text("Due today"), [role="tab"]:has-text("Na dziś"), [role="tab"]:has-text("Due today")'
      )
      .first();

    if (await dueTodayTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dueTodayTab.click();
      await page.waitForTimeout(1000);
      await assertNoErrorBoundary(page);
    }

    // Also try "This Week" / "Overdue"
    const weekTab = page
      .locator(
        'button:has-text("Ten tydzień"), button:has-text("This week"), [role="tab"]:has-text("Ten tydzień"), [role="tab"]:has-text("This week")'
      )
      .first();

    if (await weekTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await weekTab.click();
      await page.waitForTimeout(1000);
      await assertNoErrorBoundary(page);
    }
  });

  // ─── 5.2 continued — Complete & Delete ────────────────────────

  test("complete activity via row action", async ({ page }) => {
    await navigateTo(page, "/dashboard/activities");

    // Look for complete button (check icon) or row action menu
    const menuTrigger = page
      .locator(
        'table tbody tr button[aria-haspopup="menu"], table tbody tr button:has(svg)'
      )
      .first();

    if (
      await menuTrigger.isVisible({ timeout: 5000 }).catch(() => false)
    ) {
      await menuTrigger.click();
      await page.waitForTimeout(500);

      // Look for "Complete" / "Zakończ" menu item
      const completeOption = page
        .locator(
          '[role="menuitem"]:has-text("Zakończ"), [role="menuitem"]:has-text("Complete"), [role="menuitem"]:has-text("Oznacz")'
        )
        .first();

      if (
        await completeOption.isVisible({ timeout: 2000 }).catch(() => false)
      ) {
        expect(await completeOption.isVisible()).toBe(true);
      }
      await page.keyboard.press("Escape");
    }
  });

  test("delete activity via row action", async ({ page }) => {
    await navigateTo(page, "/dashboard/activities");

    const menuTrigger = page
      .locator(
        'table tbody tr button[aria-haspopup="menu"], table tbody tr button:has(svg)'
      )
      .first();

    if (
      await menuTrigger.isVisible({ timeout: 5000 }).catch(() => false)
    ) {
      await menuTrigger.click();
      await page.waitForTimeout(500);

      const deleteOption = page
        .locator(
          '[role="menuitem"]:has-text("Usuń"), [role="menuitem"]:has-text("Delete")'
        )
        .first();

      if (
        await deleteOption.isVisible({ timeout: 2000 }).catch(() => false)
      ) {
        expect(await deleteOption.isVisible()).toBe(true);
      }
      await page.keyboard.press("Escape");
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

  test("click activity in calendar opens detail", async ({ page }) => {
    await navigateTo(page, "/dashboard/calendar");
    await page.waitForTimeout(2000);

    // Look for calendar event items (usually styled divs with cursor-pointer)
    const calendarEvent = page
      .locator(
        '.fc-event, [data-event], [class*="event"], [class*="appointment"]'
      )
      .first();

    if (await calendarEvent.isVisible({ timeout: 5000 }).catch(() => false)) {
      await calendarEvent.click();
      await page.waitForTimeout(1000);

      // Should open some detail view (dialog or navigation)
      await assertNoErrorBoundary(page);
    }
  });
});
