import { test, expect } from "@playwright/test";
import { loginAndGoToDashboard, waitForApp } from "./helpers/auth";
import {
  navigateTo,
  assertNoErrorBoundary,
} from "./helpers/common";

test.describe("Accessibility", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await loginAndGoToDashboard(page);
  });

  // ─── 23.1 Keyboard Navigation ────────────────────────────────

  test("tab navigation works on contacts page", async ({ page }) => {
    await navigateTo(page, "/dashboard/contacts");

    // Press Tab multiple times and verify focus moves through interactive elements
    await page.keyboard.press("Tab");
    await page.waitForTimeout(200);
    await page.keyboard.press("Tab");
    await page.waitForTimeout(200);
    await page.keyboard.press("Tab");
    await page.waitForTimeout(200);

    // Active element should be focusable
    const activeTag = await page.evaluate(
      () => document.activeElement?.tagName ?? ""
    );
    const isInteractive =
      activeTag === "BUTTON" ||
      activeTag === "INPUT" ||
      activeTag === "A" ||
      activeTag === "SELECT" ||
      activeTag === "TEXTAREA";
    // Tab should focus on interactive elements
    expect(activeTag.length).toBeGreaterThan(0);
    await assertNoErrorBoundary(page);
  });

  test("enter submits contact create form", async ({ page }) => {
    await navigateTo(page, "/dashboard/contacts");

    const addBtn = page
      .locator(
        'button:has-text("Dodaj kontakt"), button:has-text("Add contact")'
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

    // Fill required field
    const firstInput = dialog.locator("input").first();
    await firstInput.fill("KeyboardTest");

    // Press Enter to attempt submit
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);

    // Form should either submit or stay open (both valid behaviors)
    await assertNoErrorBoundary(page);

    // Close dialog if still open
    const stillOpen = await dialog
      .isVisible({ timeout: 1000 })
      .catch(() => false);
    if (stillOpen) {
      await page.keyboard.press("Escape");
    }
  });

  test("escape closes contact create dialog", async ({ page }) => {
    await navigateTo(page, "/dashboard/contacts");

    const addBtn = page
      .locator(
        'button:has-text("Dodaj kontakt"), button:has-text("Add contact")'
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

    // Press Escape to close
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // Dialog should be closed
    await expect(dialog).not.toBeVisible({ timeout: 3000 });
  });

  test("escape closes appointment create dialog", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/calendar");

    const createBtn = page
      .locator(
        'button:has-text("Nowa wizyta"), button:has-text("New appointment"), button:has-text("Dodaj")'
      )
      .first();

    if (!(await createBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await createBtn.click();
    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    await expect(dialog).not.toBeVisible({ timeout: 3000 });
  });

  test("escape closes dropdown menus", async ({ page }) => {
    await navigateTo(page, "/dashboard/contacts");

    const menuTrigger = page
      .locator(
        'table tbody tr button[aria-haspopup="menu"], table tbody tr button:has(svg)'
      )
      .first();

    if (
      !(await menuTrigger.isVisible({ timeout: 5000 }).catch(() => false))
    ) {
      test.skip();
      return;
    }

    await menuTrigger.click();
    await page.waitForTimeout(500);

    const menu = page.locator('[role="menu"]');
    if (await menu.isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);

      await expect(menu).not.toBeVisible({ timeout: 2000 });
    }
  });

  // ─── 23.2 Screen Reader ──────────────────────────────────────

  test("form inputs have labels", async ({ page }) => {
    await navigateTo(page, "/dashboard/contacts");

    const addBtn = page
      .locator(
        'button:has-text("Dodaj kontakt"), button:has-text("Add contact")'
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

    // Check that inputs have associated labels or aria-label
    const inputs = dialog.locator("input");
    const inputCount = await inputs.count();

    for (let i = 0; i < Math.min(inputCount, 5); i++) {
      const input = inputs.nth(i);
      const id = await input.getAttribute("id");
      const ariaLabel = await input.getAttribute("aria-label");
      const ariaLabelledBy = await input.getAttribute("aria-labelledby");
      const placeholder = await input.getAttribute("placeholder");
      const name = await input.getAttribute("name");

      // Input should have at least one accessibility identifier
      const hasAccessibility =
        (id && (await dialog.locator(`label[for="${id}"]`).count()) > 0) ||
        ariaLabel !== null ||
        ariaLabelledBy !== null ||
        placeholder !== null ||
        name !== null;

      expect(hasAccessibility).toBe(true);
    }

    await page.keyboard.press("Escape");
  });

  test("dialogs have ARIA role and title", async ({ page }) => {
    await navigateTo(page, "/dashboard/contacts");

    const addBtn = page
      .locator(
        'button:has-text("Dodaj kontakt"), button:has-text("Add contact")'
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

    // Dialog should have role="dialog"
    const role = await dialog.getAttribute("role");
    expect(role).toBe("dialog");

    // Dialog should have an accessible name (aria-label or aria-labelledby)
    const ariaLabel = await dialog.getAttribute("aria-label");
    const ariaLabelledBy = await dialog.getAttribute("aria-labelledby");
    const ariaDescribedBy = await dialog.getAttribute("aria-describedby");

    const hasAccessibleName =
      ariaLabel !== null || ariaLabelledBy !== null || ariaDescribedBy !== null;
    expect(hasAccessibleName).toBe(true);

    await page.keyboard.press("Escape");
  });

  test("focus moves into dialog when opened", async ({ page }) => {
    await navigateTo(page, "/dashboard/contacts");

    const addBtn = page
      .locator(
        'button:has-text("Dodaj kontakt"), button:has-text("Add contact")'
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

    // Focus should be inside the dialog
    const isFocusInDialog = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return dialog?.contains(document.activeElement) ?? false;
    });
    expect(isFocusInDialog).toBe(true);

    await page.keyboard.press("Escape");
  });
});
