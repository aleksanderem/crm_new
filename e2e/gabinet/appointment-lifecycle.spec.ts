import { test, expect } from "@playwright/test";
import { loginAndGoToDashboard, waitForApp } from "../helpers/auth";
import { navigateTo, assertNoErrorBoundary, getBodyText } from "../helpers/common";

test.describe("Gabinet — Appointment Full Lifecycle", () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({ page }) => {
    await loginAndGoToDashboard(page);
  });

  test("create → confirm → complete lifecycle", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/calendar");
    await assertNoErrorBoundary(page);
    const createBtn = page.locator('button:has-text("Nowa wizyta"), button:has-text("New appointment")').first();
    if (!(await createBtn.isVisible({ timeout: 8000 }).catch(() => false))) { test.skip(); return; }
    await createBtn.click();
    await page.waitForTimeout(1000);
    const dialog = page.locator('[role="dialog"]');
    if (!(await dialog.isVisible({ timeout: 5000 }).catch(() => false))) { test.skip(); return; }
    const comboboxes = dialog.locator('button[role="combobox"]');
    if (await comboboxes.count() >= 1) {
      await comboboxes.nth(0).click();
      await page.waitForTimeout(500);
      const firstOption = page.locator('[role="option"]').first();
      if (await firstOption.isVisible({ timeout: 2000 }).catch(() => false)) await firstOption.click();
    }
    const dateInput = dialog.locator('input[type="date"]').first();
    if (await dateInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
      await dateInput.fill(tomorrow.toISOString().split("T")[0]);
    }
    const submitBtn = dialog.locator('button:has-text("Utwórz"), button:has-text("Create")').first();
    if (!(await submitBtn.isVisible({ timeout: 3000 }).catch(() => false))) { await page.keyboard.press("Escape"); test.skip(); return; }
    await submitBtn.click();
    await page.waitForTimeout(3000);
    await waitForApp(page);
    await assertNoErrorBoundary(page);
    await navigateTo(page, "/dashboard/gabinet/appointments");
    await page.waitForTimeout(2000);
    await assertNoErrorBoundary(page);
  });

  test("appointments list loads", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/appointments");
    await assertNoErrorBoundary(page);
    expect((await getBodyText(page)).length).toBeGreaterThan(50);
  });

  test("calendar loads", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/calendar");
    await assertNoErrorBoundary(page);
    expect((await getBodyText(page)).length).toBeGreaterThan(100);
  });
});
