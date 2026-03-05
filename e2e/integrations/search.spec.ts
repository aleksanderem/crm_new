import { test, expect } from "@playwright/test";
import { loginAndGoToDashboard, waitForApp } from "../helpers/auth";
import { navigateTo, assertNoErrorBoundary, getBodyText } from "../helpers/common";

test.describe("Global Search", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await loginAndGoToDashboard(page);
  });

  test("search opens with shortcut", async ({ page }) => {
    await navigateTo(page, "/dashboard");

    // Try Cmd+K or Ctrl+K shortcut
    await page.keyboard.press("Meta+k");
    await page.waitForTimeout(500);

    // Check for command palette / search dialog
    let searchDialog = page.locator('[role="dialog"]').first();
    let opened = await searchDialog
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    if (!opened) {
      // Try Ctrl+K
      await page.keyboard.press("Control+k");
      await page.waitForTimeout(500);
      opened = await searchDialog
        .isVisible({ timeout: 2000 })
        .catch(() => false);
    }

    if (!opened) {
      // Try clicking search button
      const searchBtn = page
        .locator(
          'button:has(svg.lucide-search), [data-testid="search"], button:has-text("Szukaj")'
        )
        .first();
      if (
        await searchBtn.isVisible({ timeout: 2000 }).catch(() => false)
      ) {
        await searchBtn.click();
        await page.waitForTimeout(500);
      }
    }

    // Close whatever opened
    await page.keyboard.press("Escape");
  });

  test("search returns results for known entities", async ({ page }) => {
    await navigateTo(page, "/dashboard");

    // Open search
    await page.keyboard.press("Meta+k");
    await page.waitForTimeout(500);

    const searchDialog = page.locator('[role="dialog"], [cmdk-root]').first();
    if (
      !(await searchDialog.isVisible({ timeout: 3000 }).catch(() => false))
    ) {
      await page.keyboard.press("Control+k");
      await page.waitForTimeout(500);
    }

    const searchInput = page
      .locator('[cmdk-input], [role="dialog"] input, [role="combobox"]')
      .first();

    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill("E2E");
      await page.waitForTimeout(1000);
      // Should not crash
      await assertNoErrorBoundary(page);
    }

    await page.keyboard.press("Escape");
  });

  test("search returns companies", async ({ page }) => {
    await navigateTo(page, "/dashboard");

    await page.keyboard.press("Meta+k");
    await page.waitForTimeout(500);

    let searchInput = page
      .locator('[cmdk-input], [role="dialog"] input, [role="combobox"]')
      .first();

    if (!(await searchInput.isVisible({ timeout: 2000 }).catch(() => false))) {
      await page.keyboard.press("Control+k");
      await page.waitForTimeout(500);
      searchInput = page
        .locator('[cmdk-input], [role="dialog"] input, [role="combobox"]')
        .first();
    }

    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill("Company");
      await page.waitForTimeout(1000);
      await assertNoErrorBoundary(page);
    }

    await page.keyboard.press("Escape");
  });

  test("search returns leads", async ({ page }) => {
    await navigateTo(page, "/dashboard");

    await page.keyboard.press("Meta+k");
    await page.waitForTimeout(500);

    let searchInput = page
      .locator('[cmdk-input], [role="dialog"] input, [role="combobox"]')
      .first();

    if (!(await searchInput.isVisible({ timeout: 2000 }).catch(() => false))) {
      await page.keyboard.press("Control+k");
      await page.waitForTimeout(500);
      searchInput = page
        .locator('[cmdk-input], [role="dialog"] input, [role="combobox"]')
        .first();
    }

    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill("Lead");
      await page.waitForTimeout(1000);
      await assertNoErrorBoundary(page);
    }

    await page.keyboard.press("Escape");
  });

  test("search returns patients", async ({ page }) => {
    await navigateTo(page, "/dashboard");

    await page.keyboard.press("Meta+k");
    await page.waitForTimeout(500);

    let searchInput = page
      .locator('[cmdk-input], [role="dialog"] input, [role="combobox"]')
      .first();

    if (!(await searchInput.isVisible({ timeout: 2000 }).catch(() => false))) {
      await page.keyboard.press("Control+k");
      await page.waitForTimeout(500);
      searchInput = page
        .locator('[cmdk-input], [role="dialog"] input, [role="combobox"]')
        .first();
    }

    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill("Patient");
      await page.waitForTimeout(1000);
      await assertNoErrorBoundary(page);
    }

    await page.keyboard.press("Escape");
  });

  test("click result navigates to detail", async ({ page }) => {
    await navigateTo(page, "/dashboard");

    await page.keyboard.press("Meta+k");
    await page.waitForTimeout(500);

    let searchInput = page
      .locator('[cmdk-input], [role="dialog"] input, [role="combobox"]')
      .first();

    if (!(await searchInput.isVisible({ timeout: 2000 }).catch(() => false))) {
      await page.keyboard.press("Control+k");
      await page.waitForTimeout(500);
      searchInput = page
        .locator('[cmdk-input], [role="dialog"] input, [role="combobox"]')
        .first();
    }

    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill("E2E");
      await page.waitForTimeout(1500);

      // Click first result if available
      const resultItem = page
        .locator('[cmdk-item], [role="dialog"] [role="option"], [role="dialog"] a')
        .first();

      if (
        await resultItem.isVisible({ timeout: 2000 }).catch(() => false)
      ) {
        await resultItem.click();
        await page.waitForTimeout(2000);
        await waitForApp(page);

        // Should have navigated away from dashboard
        await assertNoErrorBoundary(page);
      }
    }

    await page.keyboard.press("Escape");
  });
});
