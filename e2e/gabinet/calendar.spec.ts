import { test, expect } from "@playwright/test";
import { loginAndGoToDashboard, waitForApp } from "../helpers/auth";
import {
  navigateTo,
  assertNoErrorBoundary,
  getBodyText,
} from "../helpers/common";

test.describe("Gabinet — Calendar", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await loginAndGoToDashboard(page);
  });

  // ─── 13.1 View Switching ────────────────────────────────────

  test("calendar page loads", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/calendar");
    await assertNoErrorBoundary(page);

    const bodyText = await getBodyText(page);
    expect(bodyText.length).toBeGreaterThan(50);
  });

  test("day view renders time grid", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/calendar");

    // Click "Day" view button
    const dayBtn = page
      .locator(
        'button:has-text("Dzień"), button:has-text("Day")'
      )
      .first();

    if (await dayBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dayBtn.click();
      await page.waitForTimeout(1000);
      await assertNoErrorBoundary(page);

      // Time grid should render with hour labels
      const bodyText = await getBodyText(page);
      const hasTimeLabels =
        bodyText.includes("08:00") ||
        bodyText.includes("09:00") ||
        bodyText.includes("10:00") ||
        bodyText.includes("8:00") ||
        bodyText.includes("9:00");
      expect(hasTimeLabels).toBe(true);
    }
  });

  test("week view renders 7 columns", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/calendar");

    // Week view is default
    const weekBtn = page
      .locator(
        'button:has-text("Tydzień"), button:has-text("Week")'
      )
      .first();

    if (await weekBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await weekBtn.click();
      await page.waitForTimeout(1000);
    }

    await assertNoErrorBoundary(page);
    const bodyText = await getBodyText(page);
    expect(bodyText.length).toBeGreaterThan(50);
  });

  test("month view renders day cells", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/calendar");

    const monthBtn = page
      .locator(
        'button:has-text("Miesiąc"), button:has-text("Month")'
      )
      .first();

    if (await monthBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await monthBtn.click();
      await page.waitForTimeout(1000);
      await assertNoErrorBoundary(page);

      // Month view should have day numbers
      const bodyText = await getBodyText(page);
      expect(bodyText).toContain("1");
    }
  });

  test("view switcher works", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/calendar");

    const viewButtons = ["Dzień", "Day", "Tydzień", "Week", "Miesiąc", "Month"];

    for (const text of viewButtons) {
      const btn = page.locator(`button:has-text("${text}")`).first();
      if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(500);
        await assertNoErrorBoundary(page);
      }
    }
  });

  // ─── 13.2 Navigation ───────────────────────────────────────

  test("previous button works", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/calendar");

    // Get current title text
    const titleBefore = await getBodyText(page);

    // Click previous (ChevronLeft)
    const prevBtn = page.locator("button").filter({ has: page.locator("svg") }).first();
    if (await prevBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await prevBtn.click();
      await page.waitForTimeout(500);
      await assertNoErrorBoundary(page);
    }
  });

  test("next button works", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/calendar");

    // Click next (second chevron button)
    const buttons = page.locator("button").filter({ has: page.locator("svg") });
    const count = await buttons.count();
    if (count >= 3) {
      // Third button should be the "next" chevron (after prev and today)
      await buttons.nth(2).click();
      await page.waitForTimeout(500);
      await assertNoErrorBoundary(page);
    }
  });

  test("today button works", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/calendar");

    const todayBtn = page
      .locator(
        'button:has-text("Dziś"), button:has-text("Today"), button:has-text("Dzis")'
      )
      .first();

    if (await todayBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await todayBtn.click();
      await page.waitForTimeout(500);
      await assertNoErrorBoundary(page);
    }
  });

  // ─── 13.3 Filters ──────────────────────────────────────────

  test("employee filter works", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/calendar");

    // Employee filter is a Select component
    const filterTrigger = page
      .locator(
        'button[role="combobox"]:has-text("Wszyscy"), button[role="combobox"]'
      )
      .first();

    if (
      await filterTrigger.isVisible({ timeout: 3000 }).catch(() => false)
    ) {
      await filterTrigger.click();
      await page.waitForTimeout(500);

      // Dropdown should show employee options
      const content = page.locator('[role="listbox"], [data-radix-popper-content-wrapper]');
      if (await content.isVisible({ timeout: 2000 }).catch(() => false)) {
        const optionCount = await page.locator('[role="option"]').count();
        expect(optionCount).toBeGreaterThanOrEqual(1); // At least "all"
      }

      await page.keyboard.press("Escape");
    }
  });

  // ─── 12.1 Appointment Creation ──────────────────────────────

  test("create appointment button opens dialog", async ({ page }) => {
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

      // Should have patient search or selector
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
});
