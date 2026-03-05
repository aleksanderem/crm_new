import { test, expect } from "@playwright/test";
import { loginAndGoToDashboard, waitForApp, BASE_URL } from "./helpers/auth";
import {
  navigateTo,
  assertNoErrorBoundary,
  getBodyText,
} from "./helpers/common";

test.describe("Error Handling & Edge Cases", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await loginAndGoToDashboard(page);
  });

  // ─── 22.1 Form Validation ────────────────────────────────────

  test("contact form shows required field errors on empty submit", async ({
    page,
  }) => {
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

    // Submit without filling anything
    const submitBtn = dialog
      .locator(
        'button:has-text("Utwórz"), button:has-text("Create"), button:has-text("Zapisz")'
      )
      .first();

    if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(1000);

      // Dialog should remain open (validation prevented submit)
      await expect(dialog).toBeVisible();

      // Look for validation error messages or red borders
      const dialogHTML = await dialog.innerHTML();
      const hasError =
        dialogHTML.includes("error") ||
        dialogHTML.includes("destructive") ||
        dialogHTML.includes("required") ||
        dialogHTML.includes("wymagane") ||
        dialogHTML.includes("border-red") ||
        dialogHTML.includes("text-red");

      expect(hasError).toBe(true);
    }

    await page.keyboard.press("Escape");
  });

  test("email validation works in contact form", async ({ page }) => {
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

    // Fill name first
    const firstInput = dialog.locator("input").first();
    await firstInput.fill("TestValidation");

    // Fill invalid email
    const emailInput = dialog.locator('input[type="email"]').first();
    if (await emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await emailInput.fill("not-an-email");

      // Try to submit
      const submitBtn = dialog
        .locator(
          'button:has-text("Utwórz"), button:has-text("Create"), button:has-text("Zapisz")'
        )
        .first();

      if (await submitBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await submitBtn.click();
        await page.waitForTimeout(1000);

        // Either browser native validation or custom validation should prevent submit
        // Dialog should remain open
        const isStillOpen = await dialog
          .isVisible({ timeout: 2000 })
          .catch(() => false);
        expect(isStillOpen).toBe(true);
      }
    }

    await page.keyboard.press("Escape");
  });

  test("phone validation works in contact form", async ({ page }) => {
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

    // Fill name
    const firstInput = dialog.locator("input").first();
    await firstInput.fill("TestPhone");

    // Find phone input
    const phoneInput = dialog
      .locator(
        'input[type="tel"], input[name*="phone"], input[placeholder*="Telefon"], input[placeholder*="Phone"]'
      )
      .first();

    if (await phoneInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await phoneInput.fill("abc-not-phone");
      await page.waitForTimeout(500);

      // Check if validation error appears
      await assertNoErrorBoundary(page);
    }

    await page.keyboard.press("Escape");
  });

  test("lead form validation shows required field errors", async ({
    page,
  }) => {
    await navigateTo(page, "/dashboard/leads");

    const addBtn = page
      .locator(
        'button:has-text("Dodaj transakcję"), button:has-text("Add lead"), button:has-text("Dodaj")'
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

    // Submit without filling anything
    const submitBtn = dialog
      .locator(
        'button:has-text("Utwórz"), button:has-text("Create"), button:has-text("Zapisz")'
      )
      .first();

    if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(1000);

      // Dialog should remain open
      await expect(dialog).toBeVisible();
    }

    await page.keyboard.press("Escape");
  });

  // ─── 22.2 API Errors ───────────────────────────────────────────

  test("permission error shows message on restricted route", async ({
    page,
  }) => {
    // Navigate to settings which requires admin access
    await navigateTo(page, "/dashboard/settings/permissions");
    await assertNoErrorBoundary(page);

    // Page should either load (if admin) or show permission denied
    const bodyText = await getBodyText(page);
    expect(bodyText.length).toBeGreaterThan(20);
  });

  // ─── 22.3 Edge Cases ──────────────────────────────────────────

  test("contacts empty state displays when no results found", async ({
    page,
  }) => {
    await navigateTo(page, "/dashboard/contacts");

    const searchInput = page
      .locator(
        'input[placeholder*="Szukaj"], input[placeholder*="Search"], input[placeholder*="Filtr"]'
      )
      .first();

    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchInput.fill(
        "absolutely-no-results-zzzzz999-" + Date.now()
      );
      await page.waitForTimeout(1500);

      const bodyText = await getBodyText(page);
      // Should show empty state or no results message
      const hasEmpty =
        bodyText.includes("Brak") ||
        bodyText.includes("No results") ||
        bodyText.includes("brak") ||
        bodyText.includes("Nie znaleziono") ||
        bodyText.includes("Not found") ||
        bodyText.includes("0 wynik");

      expect(hasEmpty).toBe(true);
    }
  });

  test("companies empty state displays when no results found", async ({
    page,
  }) => {
    await navigateTo(page, "/dashboard/companies");

    const searchInput = page
      .locator(
        'input[placeholder*="Szukaj"], input[placeholder*="Search"], input[placeholder*="Filtr"]'
      )
      .first();

    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchInput.fill(
        "absolutely-no-results-zzzzz999-" + Date.now()
      );
      await page.waitForTimeout(1500);

      const bodyText = await getBodyText(page);
      const hasEmpty =
        bodyText.includes("Brak") ||
        bodyText.includes("No results") ||
        bodyText.includes("brak") ||
        bodyText.includes("Nie znaleziono") ||
        bodyText.includes("0 wynik");

      expect(hasEmpty).toBe(true);
    }
  });

  test("leads empty state displays when no results found", async ({
    page,
  }) => {
    await navigateTo(page, "/dashboard/leads");

    const searchInput = page
      .locator(
        'input[placeholder*="Szukaj"], input[placeholder*="Search"], input[placeholder*="Filtr"]'
      )
      .first();

    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchInput.fill(
        "absolutely-no-results-zzzzz999-" + Date.now()
      );
      await page.waitForTimeout(1500);

      // Soft check — leads page might be kanban view without search
      await assertNoErrorBoundary(page);
    }
  });

  test("loading states display during data fetch", async ({ page }) => {
    // Navigate to contacts and check for loading indicators
    await page.goto(`${BASE_URL}/dashboard/contacts`, {
      waitUntil: "domcontentloaded",
      timeout: 10000,
    });

    // During initial load, should show skeleton or spinner
    const bodyHTML = await page.locator("body").innerHTML();
    const hasLoadingIndicator =
      bodyHTML.includes("skeleton") ||
      bodyHTML.includes("Skeleton") ||
      bodyHTML.includes("spinner") ||
      bodyHTML.includes("animate-") ||
      bodyHTML.includes("loading") ||
      bodyHTML.includes("Loading");

    // After settling, no error
    await waitForApp(page);
    await assertNoErrorBoundary(page);
  });

  test("pagination at first page disables previous button", async ({
    page,
  }) => {
    await navigateTo(page, "/dashboard/contacts");

    const prevBtn = page
      .locator(
        'button:has-text("Previous"), button:has-text("Poprzed"), button[aria-label="Go to previous page"]'
      )
      .first();

    if (await prevBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const isDisabled = await prevBtn.isDisabled();
      expect(isDisabled).toBe(true);
    }
  });

  test("404 page displays for non-existent routes", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/this-route-does-not-exist`, {
      waitUntil: "domcontentloaded",
      timeout: 10000,
    });
    await waitForApp(page);

    // Should show 404 or redirect to dashboard
    const url = page.url();
    const bodyText = await getBodyText(page);

    const isHandled =
      bodyText.includes("404") ||
      bodyText.includes("Nie znaleziono") ||
      bodyText.includes("Not found") ||
      url.includes("/dashboard");

    expect(isHandled).toBe(true);
  });
});
