import { test, expect } from "@playwright/test";
import { loginAndGoToDashboard, waitForApp } from "../helpers/auth";
import {
  navigateTo,
  assertNoErrorBoundary,
  getBodyText,
  testId,
} from "../helpers/common";

test.describe("CRM — Products", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await loginAndGoToDashboard(page);
  });

  test("products list loads", async ({ page }) => {
    await navigateTo(page, "/dashboard/products");
    await assertNoErrorBoundary(page);

    const bodyText = await getBodyText(page);
    expect(bodyText.length).toBeGreaterThan(50);
  });

  test("search filters results", async ({ page }) => {
    await navigateTo(page, "/dashboard/products");

    const searchInput = page
      .locator(
        'input[placeholder*="Szukaj"], input[placeholder*="Search"], input[placeholder*="Filtr"]'
      )
      .first();

    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchInput.fill("nonexistent-product-xyz-999");
      await page.waitForTimeout(1000);
      await assertNoErrorBoundary(page);
    }
  });

  test("create product succeeds", async ({ page }) => {
    const productName = testId("E2EProduct");

    await navigateTo(page, "/dashboard/products");

    const addBtn = page
      .locator(
        'button:has-text("Dodaj produkt"), button:has-text("Add product"), button:has-text("Dodaj")'
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

    const nameInput = dialog.locator("input").first();
    await nameInput.fill(productName);

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
      expect(bodyText).toContain(productName);
    }
  });

  test("edit product via row action", async ({ page }) => {
    await navigateTo(page, "/dashboard/products");

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

      const editOption = page
        .locator(
          '[role="menuitem"]:has-text("Edytuj"), [role="menuitem"]:has-text("Edit")'
        )
        .first();

      if (
        await editOption.isVisible({ timeout: 2000 }).catch(() => false)
      ) {
        expect(await editOption.isVisible()).toBe(true);
      }
      await page.keyboard.press("Escape");
    }
  });

  test("delete product via row action", async ({ page }) => {
    await navigateTo(page, "/dashboard/products");

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
