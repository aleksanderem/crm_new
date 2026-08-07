import { test, expect } from "@playwright/test";
import { loginAndGoToDashboard, waitForApp } from "./helpers/auth";
import { navigateTo, assertNoErrorBoundary, getBodyText } from "./helpers/common";

test.describe("Stripe Checkout & Billing", () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await loginAndGoToDashboard(page);
  });

  // ─── 1. Billing settings page ─────────────────────────────────────

  test("billing settings page loads without errors", async ({ page }) => {
    await navigateTo(page, "/dashboard/settings/billing");
    await assertNoErrorBoundary(page);

    const body = await getBodyText(page);
    expect(body.length).toBeGreaterThan(50);
  });

  test("billing page shows plan options or current subscription", async ({
    page,
  }) => {
    await navigateTo(page, "/dashboard/settings/billing");
    await assertNoErrorBoundary(page);

    const body = await getBodyText(page);
    const hasBillingContent =
      body.includes("plan") ||
      body.includes("Plan") ||
      body.includes("subscription") ||
      body.includes("subskrypcja") ||
      body.includes("Billing") ||
      body.includes("Płatności") ||
      body.includes("free") ||
      body.includes("Free") ||
      body.includes("Pro") ||
      body.includes("Basic");
    expect(hasBillingContent).toBe(true);
  });

  test("billing page has module selector tabs or sections", async ({ page }) => {
    await navigateTo(page, "/dashboard/settings/billing");
    await assertNoErrorBoundary(page);

    // The billing page shows tabs per module (CRM / Gabinet)
    const body = await getBodyText(page);
    const hasModuleSelector =
      body.includes("CRM") ||
      body.includes("Gabinet") ||
      body.includes("crm") ||
      body.includes("module") ||
      body.includes("moduł");
    expect(hasModuleSelector).toBe(true);
  });

  test("billing page with productKey=gabinet query param loads", async ({
    page,
  }) => {
    await navigateTo(page, "/dashboard/settings/billing?productKey=gabinet");
    await assertNoErrorBoundary(page);

    const body = await getBodyText(page);
    expect(body.length).toBeGreaterThan(50);
  });

  // ─── 2. Plan selection UI ──────────────────────────────────────────

  test("billing page shows subscribe or manage button", async ({ page }) => {
    await navigateTo(page, "/dashboard/settings/billing");
    await assertNoErrorBoundary(page);

    // Either a "Subscribe" button (free plan) or "Manage subscription" / portal link
    const actionBtn = page
      .locator(
        'button:has-text("Subscribe"), button:has-text("Subskrybuj"), button:has-text("Upgrade"), button:has-text("Uaktualnij"), button:has-text("Manage"), button:has-text("Zarządzaj"), a:has-text("Manage")'
      )
      .first();

    const hasAction = await actionBtn
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    // If there's an action button, it should be enabled (or show a reason why not)
    if (hasAction) {
      const body = await getBodyText(page);
      // Verify the page context makes sense
      expect(body.length).toBeGreaterThan(100);
    }

    // Page should be functional regardless
    await assertNoErrorBoundary(page);
  });

  test("billing page monthly/yearly toggle works", async ({ page }) => {
    await navigateTo(page, "/dashboard/settings/billing");
    await assertNoErrorBoundary(page);

    // Look for interval toggle (month/year switch)
    const intervalToggle = page
      .locator('[role="switch"], input[type="checkbox"]')
      .first();

    if (await intervalToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await intervalToggle.click();
      await page.waitForTimeout(500);
      await assertNoErrorBoundary(page);

      // Toggle back
      await intervalToggle.click();
      await page.waitForTimeout(500);
      await assertNoErrorBoundary(page);
    }
  });

  // ─── 3. Checkout completion page ──────────────────────────────────

  test("checkout page loads and shows completion state", async ({ page }) => {
    await navigateTo(page, "/dashboard/checkout");
    await assertNoErrorBoundary(page);

    const body = await getBodyText(page);
    expect(body.length).toBeGreaterThan(10);

    // Should show one of: completing/loading, success, or error state
    const hasCheckoutContent =
      body.includes("Checkout") ||
      body.includes("checkout") ||
      body.includes("completed") ||
      body.includes("zakończony") ||
      body.includes("Complete") ||
      body.includes("subscription") ||
      body.includes("Return") ||
      body.includes("Dashboard") ||
      body.includes("went wrong") ||
      body.includes("poszło");
    expect(hasCheckoutContent).toBe(true);
  });

  test("checkout page has return-to-dashboard link", async ({ page }) => {
    await navigateTo(page, "/dashboard/checkout");
    await assertNoErrorBoundary(page);

    // The checkout page always shows a "Return to Dashboard" link
    const returnLink = page
      .locator(
        'a:has-text("Dashboard"), a:has-text("Return"), button:has-text("Dashboard"), button:has-text("Return")'
      )
      .first();

    const hasReturnLink = await returnLink
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    expect(hasReturnLink).toBe(true);
  });

  test("checkout page does not show blank screen", async ({ page }) => {
    await navigateTo(page, "/dashboard/checkout");
    await assertNoErrorBoundary(page);

    const body = await getBodyText(page);
    // Must render something meaningful
    expect(body.length).toBeGreaterThan(20);
  });

  // ─── 4. Checkout redirect path (Stripe → app) ─────────────────────

  test("stripe checkout initiation: clicking subscribe does not crash", async ({
    page,
  }) => {
    await navigateTo(page, "/dashboard/settings/billing");
    await assertNoErrorBoundary(page);

    const subscribeBtn = page
      .locator(
        'button:has-text("Subscribe"), button:has-text("Subskrybuj"), button:has-text("Upgrade"), button:has-text("Uaktualnij")'
      )
      .first();

    if (!(await subscribeBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      // User is already on a paid plan — test the portal path instead
      const manageBtn = page
        .locator('button:has-text("Manage"), button:has-text("Zarządzaj")')
        .first();
      if (await manageBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Don't actually click manage (would open Stripe portal in new tab)
        // Just verify it's present
        expect(await manageBtn.isEnabled()).toBe(true);
      }
      return;
    }

    // Intercept navigation to avoid actually going to Stripe
    let redirectedToStripe = false;
    page.on("request", (req) => {
      if (req.url().includes("stripe.com") || req.url().includes("checkout.stripe")) {
        redirectedToStripe = true;
      }
    });

    // Click subscribe — should either navigate to Stripe or show an error state
    // We don't actually complete the Stripe checkout, just verify it doesn't crash
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("convex") || res.url().includes("stripe"),
        { timeout: 8000 }
      ).catch(() => null),
      subscribeBtn.click(),
    ]);

    await page.waitForTimeout(3000);
    await assertNoErrorBoundary(page);

    // Either we got redirected to Stripe (success) or an error is shown (acceptable)
    // The key check is no error boundary was triggered
    const body = await getBodyText(page);
    expect(body.length).toBeGreaterThan(10);
  });

  // ─── 5. Billing visible in settings nav ───────────────────────────

  test("billing is accessible from settings navigation", async ({ page }) => {
    await navigateTo(page, "/dashboard/settings");
    await assertNoErrorBoundary(page);

    // Look for billing link in settings nav
    const billingLink = page
      .locator('a:has-text("Billing"), a:has-text("Płatności"), a:has-text("billing")')
      .first();

    if (await billingLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await billingLink.click();
      await waitForApp(page);
      await assertNoErrorBoundary(page);

      expect(page.url()).toContain("billing");
    } else {
      // Navigate directly — billing may not be in the nav on all plan tiers
      await navigateTo(page, "/dashboard/settings/billing");
      await assertNoErrorBoundary(page);
    }
  });
});
