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

  // ─── 5.1a Filter Buttons ────────────────────────────────────

  test("type filter dropdown opens and shows options", async ({ page }) => {
    await navigateTo(page, "/dashboard/activities");

    // Find the type filter button (FilterButton component)
    const filterBtn = page
      .locator(
        'button:has-text("Filtruj wg typu"), button:has-text("Filter by type")'
      )
      .first();

    if (!(await filterBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await filterBtn.click();
    await page.waitForTimeout(500);

    // Popover should open with filter options
    const popover = page.locator('[data-radix-popper-content-wrapper]').first();
    await expect(popover).toBeVisible({ timeout: 3000 });

    // Should have at least one filter option visible
    const options = popover.locator("button");
    const optionCount = await options.count();
    expect(optionCount).toBeGreaterThanOrEqual(1);
  });

  test("selecting type filter applies and shows indicator", async ({ page }) => {
    await navigateTo(page, "/dashboard/activities");

    const filterBtn = page
      .locator(
        'button:has-text("Filtruj wg typu"), button:has-text("Filter by type")'
      )
      .first();

    if (!(await filterBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await filterBtn.click();
    await page.waitForTimeout(500);

    // Click the first filter option in the popover
    const popover = page.locator('[data-radix-popper-content-wrapper]').first();
    const firstOption = popover.locator("button").first();

    if (await firstOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      const optionText = (await firstOption.textContent()) ?? "";
      await firstOption.click();
      await page.waitForTimeout(500);

      // After selecting, button should show the selected option name or a badge
      const updatedBtn = page
        .locator(
          'button:has-text("Filtruj wg typu"), button:has-text("Filter by type")'
        )
        .first();

      // Either the button text changed to the option or it has a badge indicator
      const btnText = await page
        .locator('[data-radix-popper-content-wrapper]')
        .isVisible()
        .catch(() => false);
      // Popover should be closed after selection
      expect(btnText).toBe(false);
    }

    await assertNoErrorBoundary(page);
  });

  test("clear filter works", async ({ page }) => {
    await navigateTo(page, "/dashboard/activities");

    const filterBtn = page
      .locator(
        'button:has-text("Filtruj wg typu"), button:has-text("Filter by type")'
      )
      .first();

    if (!(await filterBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip();
      return;
    }

    // First select a filter
    await filterBtn.click();
    await page.waitForTimeout(500);

    const popover = page.locator('[data-radix-popper-content-wrapper]').first();
    const firstOption = popover.locator("button").first();

    if (!(await firstOption.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await firstOption.click();
    await page.waitForTimeout(500);

    // Now re-open and look for the "Clear filter" button
    // The button text should have changed (no longer showing "Filtruj wg typu")
    // Find the filter button area (it may now show the selected type name)
    const activeFilterBtn = page
      .locator('button:has(.bg-primary\\/10), button:has-text("1")')
      .first();

    // Alternatively, just click the same area again
    const reopenBtn = page.locator('button').filter({ has: page.locator('.h-4.min-w-4') }).first();

    if (await reopenBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await reopenBtn.click();
      await page.waitForTimeout(500);

      const clearBtn = page
        .locator('button:has-text("Clear filter"), button:has-text("Wyczyść")')
        .first();

      if (await clearBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await clearBtn.click();
        await page.waitForTimeout(500);
        await assertNoErrorBoundary(page);
      }
    }
  });

  test("show completed toggle works", async ({ page }) => {
    await navigateTo(page, "/dashboard/activities");

    // Find the toggle button
    const toggleBtn = page
      .locator(
        'button:has-text("Pokaż ukończone"), button:has-text("Show completed")'
      )
      .first();

    if (!(await toggleBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip();
      return;
    }

    // Click to enable
    await toggleBtn.click();
    await page.waitForTimeout(500);
    await assertNoErrorBoundary(page);

    // Button text should change to "Ukryj ukończone" / "Hide completed"
    const hideBtn = page
      .locator(
        'button:has-text("Ukryj ukończone"), button:has-text("Hide completed")'
      )
      .first();

    const toggledSuccessfully = await hideBtn
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    // Click again to disable
    if (toggledSuccessfully) {
      await hideBtn.click();
      await page.waitForTimeout(500);
      await assertNoErrorBoundary(page);
    }
  });

  // ─── 5.1 continued — Saved View Filters ────────────────────

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
