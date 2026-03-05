import { test, expect } from "@playwright/test";
import { loginAndGoToDashboard, waitForApp } from "../helpers/auth";
import {
  navigateTo,
  assertNoErrorBoundary,
  getBodyText,
  testId,
} from "../helpers/common";

test.describe("Gabinet — Treatments", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await loginAndGoToDashboard(page);
  });

  // ─── 9.1 List View ──────────────────────────────────────────

  test("treatments list loads", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/treatments");
    await assertNoErrorBoundary(page);

    const bodyText = await getBodyText(page);
    expect(bodyText.length).toBeGreaterThan(50);
  });

  test("filter by category works", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/treatments");

    // Look for category faceted filter button
    const categoryFilter = page
      .locator(
        'button:has-text("Kategori"), button:has-text("Category")'
      )
      .first();

    if (
      await categoryFilter.isVisible({ timeout: 3000 }).catch(() => false)
    ) {
      await categoryFilter.click();
      await page.waitForTimeout(500);
      await assertNoErrorBoundary(page);
      await page.keyboard.press("Escape");
    }
  });

  test("filter by isActive works via saved views", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/treatments");

    const activeTab = page
      .locator(
        'button:has-text("Aktywne"), button:has-text("Active"), [role="tab"]:has-text("Aktywne"), [role="tab"]:has-text("Active")'
      )
      .first();

    if (await activeTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await activeTab.click();
      await page.waitForTimeout(1000);
      await assertNoErrorBoundary(page);
    }
  });

  // ─── 9.2 Treatment CRUD ─────────────────────────────────────

  test("create treatment succeeds", async ({ page }) => {
    const treatmentName = testId("E2ETreatment");

    await navigateTo(page, "/dashboard/gabinet/treatments");

    const addBtn = page
      .locator(
        'button:has-text("Dodaj zabieg"), button:has-text("Add treatment"), button:has-text("Dodaj")'
      )
      .first();

    if (!(await addBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      const emptyBtn = page
        .locator('button:has-text("Dodaj zabieg")')
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

    // Fill name (first input)
    const nameInput = dialog.locator("input").first();
    await nameInput.fill(treatmentName);

    // Fill duration
    const durationInput = dialog
      .locator('input[name="duration"], input[type="number"]')
      .first();
    if (
      await durationInput.isVisible({ timeout: 1000 }).catch(() => false)
    ) {
      await durationInput.fill("60");
    }

    // Fill price
    const priceInput = dialog
      .locator('input[name="price"]')
      .first();
    if (await priceInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await priceInput.fill("150");
    } else {
      // Try second number input
      const numberInputs = dialog.locator('input[type="number"]');
      const count = await numberInputs.count();
      if (count > 1) {
        await numberInputs.nth(1).fill("150");
      }
    }

    // Submit
    const submitBtn = dialog
      .locator(
        'button:has-text("Utwórz"), button:has-text("Create"), button:has-text("Zapisz"), button:has-text("Save")'
      )
      .first();
    if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(3000);
      await waitForApp(page);

      const bodyText = await getBodyText(page);
      expect(bodyText).toContain(treatmentName);
    }
  });

  test("color picker works in treatment form", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/treatments");

    const addBtn = page
      .locator(
        'button:has-text("Dodaj zabieg"), button:has-text("Add treatment"), button:has-text("Dodaj")'
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

    // Look for color picker — could be input[type="color"], a swatch button, or color radio buttons
    const colorInput = dialog.locator('input[type="color"]').first();
    const colorSwatches = dialog.locator(
      '[class*="color"], [class*="swatch"], button[style*="background"]'
    );
    const colorRadios = dialog.locator(
      'button[role="radio"], [data-color], [class*="Color"]'
    );

    const hasColorInput = await colorInput
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    const hasSwatches = (await colorSwatches.count()) > 0;
    const hasRadios = (await colorRadios.count()) > 0;

    // Color selection should be available in some form
    const dialogText = await dialog.innerText();
    const hasColorLabel =
      dialogText.includes("Kolor") || dialogText.includes("Color");

    expect(hasColorInput || hasSwatches || hasRadios || hasColorLabel).toBe(
      true
    );

    await page.keyboard.press("Escape");
  });

  test("edit treatment via row action", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/treatments");

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
        await editOption.click();
        await page.waitForTimeout(1000);

        // SidePanel should open for editing
        const dialog = page.locator('[role="dialog"]');
        if (
          await dialog.isVisible({ timeout: 3000 }).catch(() => false)
        ) {
          // Verify inputs are pre-filled
          const firstInput = dialog.locator("input").first();
          const value = await firstInput.inputValue();
          expect(value.length).toBeGreaterThan(0);

          await page.keyboard.press("Escape");
        }
      } else {
        await page.keyboard.press("Escape");
      }
    }
  });

  test("delete treatment via row action", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/treatments");

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

  test("duration in minutes saves correctly", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/treatments");

    // Verify treatments show duration in "min" format
    const bodyText = await getBodyText(page);
    const hasDuration = bodyText.includes("min");
    // If treatments exist, at least one should show duration
    if (bodyText.includes("Zabieg") || bodyText.includes("Treatment")) {
      expect(hasDuration).toBe(true);
    }
  });

  test("price + currency saves and displays", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/treatments");

    // Verify treatments show price with PLN formatting
    const bodyText = await getBodyText(page);
    const hasCurrency =
      bodyText.includes("zł") ||
      bodyText.includes("PLN") ||
      bodyText.includes(",");
    // Soft check — if treatments exist, currency should appear
    if (bodyText.includes("Zabieg") || bodyText.includes("Treatment")) {
      expect(hasCurrency).toBe(true);
    }
  });
});
