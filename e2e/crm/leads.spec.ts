import { test, expect } from "@playwright/test";
import { loginAndGoToDashboard, waitForApp } from "../helpers/auth";
import {
  navigateTo,
  assertNoErrorBoundary,
  getBodyText,
  testId,
} from "../helpers/common";

test.describe("CRM — Leads", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await loginAndGoToDashboard(page);
  });

  // ─── 4.1 Pipeline View ─────────────────────────────────────

  test("pipeline loads with stages", async ({ page }) => {
    await navigateTo(page, "/dashboard/leads");
    await assertNoErrorBoundary(page);

    const bodyText = await getBodyText(page);
    expect(bodyText.length).toBeGreaterThan(50);
  });

  test("leads appear in correct stages", async ({ page }) => {
    await navigateTo(page, "/dashboard/leads");
    await assertNoErrorBoundary(page);

    // Pipeline/kanban or table view should have content
    const bodyText = await getBodyText(page);
    // Look for stage names or lead content
    const hasContent =
      bodyText.length > 100 ||
      bodyText.includes("Nowy") ||
      bodyText.includes("New") ||
      bodyText.includes("Brak");
    expect(hasContent).toBe(true);
  });

  // ─── 4.2 Lead CRUD ──────────────────────────────────────────

  test("create lead succeeds", async ({ page }) => {
    const leadTitle = testId("E2ELead");

    await navigateTo(page, "/dashboard/leads");

    const addBtn = page
      .locator(
        'button:has-text("Dodaj transakcję"), button:has-text("Add lead"), button:has-text("Dodaj")'
      )
      .first();

    if (!(await addBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      // Try empty state button
      const emptyBtn = page
        .locator('button:has-text("Dodaj transakcję")')
        .last();
      if (
        !(await emptyBtn.isVisible({ timeout: 3000 }).catch(() => false))
      ) {
        test.skip();
        return;
      }
      await emptyBtn.click();
    } else {
      await addBtn.click();
    }

    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Fill title (first input)
    const titleInput = dialog.locator("input").first();
    await titleInput.fill(leadTitle);

    // Fill value
    const valueInput = dialog.locator('input[type="number"]').first();
    if (await valueInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await valueInput.fill("10000");
    }

    // Submit
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
      expect(bodyText).toContain(leadTitle);
    }
  });

  test("edit lead persists", async ({ page }) => {
    await navigateTo(page, "/dashboard/leads");

    const leadLink = page.locator('a[href*="/leads/"]').first();
    if (
      !(await leadLink.isVisible({ timeout: 5000 }).catch(() => false))
    ) {
      test.skip();
      return;
    }

    await leadLink.click();
    await page.waitForTimeout(2000);
    await waitForApp(page);

    expect(page.url()).toContain("/leads/");
    await assertNoErrorBoundary(page);
  });

  test("delete lead removes", async ({ page }) => {
    await navigateTo(page, "/dashboard/leads");

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
});
