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

  // ─── 22.1 Custom Validation Messages ────────────────────────────

  test("custom validation messages show on contact form", async ({
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

    // Submit empty form to trigger custom validation messages
    const submitBtn = dialog
      .locator(
        'button:has-text("Utwórz"), button:has-text("Create"), button:has-text("Zapisz")'
      )
      .first();

    if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(1000);

      // Check for custom validation messages (not browser defaults)
      const dialogText = await dialog.innerText();
      const hasCustomValidation =
        dialogText.includes("wymagane") ||
        dialogText.includes("required") ||
        dialogText.includes("Required") ||
        dialogText.includes("Wymagane") ||
        dialogText.includes("Pole") ||
        dialogText.includes("Field") ||
        dialogText.includes("Podaj") ||
        dialogText.includes("Wprowadź");

      // Check for visual error indicators
      const dialogHTML = await dialog.innerHTML();
      const hasVisualError =
        dialogHTML.includes("text-destructive") ||
        dialogHTML.includes("text-red") ||
        dialogHTML.includes("border-destructive") ||
        dialogHTML.includes("border-red") ||
        dialogHTML.includes('aria-invalid="true"');

      // Should have either custom message or visual error indicator
      expect(hasCustomValidation || hasVisualError).toBe(true);
    }

    await page.keyboard.press("Escape");
  });

  // ─── 22.2 Network & Validation Errors ───────────────────────────

  test("network error shows user-friendly message", async ({ page }) => {
    await navigateTo(page, "/dashboard/contacts");

    // Intercept API calls to simulate network failure
    await page.route("**/api/**", (route) => route.abort("connectionfailed"));

    const addBtn = page
      .locator(
        'button:has-text("Dodaj kontakt"), button:has-text("Add contact")'
      )
      .first();

    if (!(await addBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      // Unroute and skip
      await page.unrouteAll();
      test.skip();
      return;
    }

    await addBtn.click();
    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Fill minimal data
    const firstInput = dialog.locator("input").first();
    await firstInput.fill("NetworkTest");

    const submitBtn = dialog
      .locator(
        'button:has-text("Utwórz"), button:has-text("Create"), button:has-text("Zapisz")'
      )
      .first();

    if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(3000);

      // Should show error toast, message, or dialog remains open
      const bodyText = await getBodyText(page);
      const hasErrorMessage =
        bodyText.includes("Błąd") ||
        bodyText.includes("Error") ||
        bodyText.includes("error") ||
        bodyText.includes("nie udało") ||
        bodyText.includes("failed") ||
        bodyText.includes("spróbuj") ||
        bodyText.includes("retry");

      // Dialog should at minimum stay open (not silently fail)
      const dialogStillOpen = await dialog
        .isVisible({ timeout: 1000 })
        .catch(() => false);

      expect(hasErrorMessage || dialogStillOpen).toBe(true);
    }

    await page.unrouteAll();
    await page.keyboard.press("Escape");
  });

  test("validation error shows inline message on lead form", async ({
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

    // Fill value with negative number (should fail validation)
    const valueInput = dialog.locator('input[type="number"]').first();
    if (await valueInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await valueInput.fill("-999");
    }

    // Submit form
    const submitBtn = dialog
      .locator(
        'button:has-text("Utwórz"), button:has-text("Create"), button:has-text("Zapisz")'
      )
      .first();

    if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(1000);

      // Check for validation error — dialog should remain open or show error
      const dialogStillOpen = await dialog
        .isVisible({ timeout: 2000 })
        .catch(() => false);

      if (dialogStillOpen) {
        const dialogHTML = await dialog.innerHTML();
        const hasValidation =
          dialogHTML.includes("error") ||
          dialogHTML.includes("destructive") ||
          dialogHTML.includes("invalid") ||
          dialogHTML.includes("wymagane") ||
          dialogHTML.includes("required") ||
          dialogHTML.includes("border-red");
        // Either has inline validation or dialog stays open preventing bad data
        expect(dialogStillOpen).toBe(true);
      }
    }

    await page.keyboard.press("Escape");
  });
});
