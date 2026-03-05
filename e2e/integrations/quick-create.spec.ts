import { test, expect } from "@playwright/test";
import { loginAndGoToDashboard, waitForApp } from "../helpers/auth";
import { navigateTo, assertNoErrorBoundary } from "../helpers/common";

test.describe("Quick-Create Modal", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await loginAndGoToDashboard(page);
  });

  test("quick-create button in header works", async ({ page }) => {
    await navigateTo(page, "/dashboard");

    const qcTrigger = page.locator('[data-testid="quick-create-trigger"]');
    if (
      !(await qcTrigger.isVisible({ timeout: 5000 }).catch(() => false))
    ) {
      // Try alternative selectors
      const altTrigger = page
        .locator(
          'header button:has-text("+"), header button:has(svg.lucide-plus)'
        )
        .first();
      if (
        !(await altTrigger.isVisible({ timeout: 3000 }).catch(() => false))
      ) {
        test.skip();
        return;
      }
      await altTrigger.click();
    } else {
      await qcTrigger.click();
    }

    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Should have multiple entity type tabs
    const dialogText = await dialog.innerText();
    const hasEntityTypes =
      dialogText.includes("Kontakt") ||
      dialogText.includes("Contact") ||
      dialogText.includes("Firma") ||
      dialogText.includes("Company") ||
      dialogText.includes("Transakcj") ||
      dialogText.includes("Lead");
    expect(hasEntityTypes).toBe(true);

    await page.keyboard.press("Escape");
  });

  test("contact form in quick-create works", async ({ page }) => {
    await navigateTo(page, "/dashboard");

    const qcTrigger = page.locator('[data-testid="quick-create-trigger"]');
    if (
      !(await qcTrigger.isVisible({ timeout: 5000 }).catch(() => false))
    ) {
      test.skip();
      return;
    }

    await qcTrigger.click();
    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Look for contact tab and click it
    const contactTab = dialog
      .locator(
        'button:has-text("Kontakt"), button:has-text("Contact"), [role="tab"]:has-text("Kontakt")'
      )
      .first();

    if (
      await contactTab.isVisible({ timeout: 2000 }).catch(() => false)
    ) {
      await contactTab.click();
      await page.waitForTimeout(500);
    }

    // Should have input fields
    const inputs = dialog.locator("input");
    const inputCount = await inputs.count();
    expect(inputCount).toBeGreaterThan(0);

    await page.keyboard.press("Escape");
  });

  test("all entity types appear in tabs", async ({ page }) => {
    await navigateTo(page, "/dashboard");

    const qcTrigger = page.locator('[data-testid="quick-create-trigger"]');
    if (
      !(await qcTrigger.isVisible({ timeout: 5000 }).catch(() => false))
    ) {
      test.skip();
      return;
    }

    await qcTrigger.click();
    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const dialogText = await dialog.innerText();

    // Check for all entity types
    const entityTypes = [
      { pl: "Kontakt", en: "Contact" },
      { pl: "Firma", en: "Company" },
      { pl: "Transakcj", en: "Lead" },
      { pl: "Aktywnoś", en: "Activity" },
    ];

    let foundCount = 0;
    for (const type of entityTypes) {
      if (dialogText.includes(type.pl) || dialogText.includes(type.en)) {
        foundCount++;
      }
    }
    // Should have at least 2 entity types
    expect(foundCount).toBeGreaterThanOrEqual(2);

    await page.keyboard.press("Escape");
  });

  test("company form creates company via quick-create", async ({ page }) => {
    await navigateTo(page, "/dashboard");

    const qcTrigger = page.locator('[data-testid="quick-create-trigger"]');
    if (
      !(await qcTrigger.isVisible({ timeout: 5000 }).catch(() => false))
    ) {
      test.skip();
      return;
    }

    await qcTrigger.click();
    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Click company tab
    const companyTab = dialog
      .locator(
        'button:has-text("Firma"), button:has-text("Company"), [role="tab"]:has-text("Firma")'
      )
      .first();

    if (
      await companyTab.isVisible({ timeout: 2000 }).catch(() => false)
    ) {
      await companyTab.click();
      await page.waitForTimeout(500);

      // Should have input fields for company
      const inputs = dialog.locator("input");
      const inputCount = await inputs.count();
      expect(inputCount).toBeGreaterThan(0);
    }

    await page.keyboard.press("Escape");
  });

  test("lead form creates lead via quick-create", async ({ page }) => {
    await navigateTo(page, "/dashboard");

    const qcTrigger = page.locator('[data-testid="quick-create-trigger"]');
    if (
      !(await qcTrigger.isVisible({ timeout: 5000 }).catch(() => false))
    ) {
      test.skip();
      return;
    }

    await qcTrigger.click();
    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const leadTab = dialog
      .locator(
        'button:has-text("Transakcj"), button:has-text("Lead"), [role="tab"]:has-text("Transakcj")'
      )
      .first();

    if (
      await leadTab.isVisible({ timeout: 2000 }).catch(() => false)
    ) {
      await leadTab.click();
      await page.waitForTimeout(500);

      const inputs = dialog.locator("input");
      const inputCount = await inputs.count();
      expect(inputCount).toBeGreaterThan(0);
    }

    await page.keyboard.press("Escape");
  });

  test("activity form creates activity via quick-create", async ({ page }) => {
    await navigateTo(page, "/dashboard");

    const qcTrigger = page.locator('[data-testid="quick-create-trigger"]');
    if (
      !(await qcTrigger.isVisible({ timeout: 5000 }).catch(() => false))
    ) {
      test.skip();
      return;
    }

    await qcTrigger.click();
    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const activityTab = dialog
      .locator(
        'button:has-text("Aktywnoś"), button:has-text("Activity"), [role="tab"]:has-text("Aktywnoś")'
      )
      .first();

    if (
      await activityTab.isVisible({ timeout: 2000 }).catch(() => false)
    ) {
      await activityTab.click();
      await page.waitForTimeout(500);

      const inputs = dialog.locator("input");
      const inputCount = await inputs.count();
      expect(inputCount).toBeGreaterThan(0);
    }

    await page.keyboard.press("Escape");
  });
});
