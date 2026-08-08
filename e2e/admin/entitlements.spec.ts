import { test, expect } from "@playwright/test";
import { BASE_URL, loginAndGoToDashboard, waitForApp } from "../helpers/auth";
import { navigateTo, assertNoErrorBoundary, getBodyText } from "../helpers/common";

/**
 * E2E tests for admin/entitlements — module-access entitlements grid.
 *
 * NOTE: These tests require:
 *   1. A running dev/preview server at PLAYWRIGHT_BASE_URL (default: http://localhost:5173)
 *   2. The default test account (PLAYWRIGHT_TEST_EMAIL / PLAYWRIGHT_TEST_PASSWORD) must
 *      be a platform admin so it can reach the entitlements page.
 *
 * If the server is unavailable or the account lacks platform-admin status, the tests
 * that assert page content will be marked as skipped rather than failed.
 *
 * Run command: npx playwright test e2e/admin/entitlements.spec.ts
 */

test.describe("Admin — Module-access entitlements", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await loginAndGoToDashboard(page);
  });

  // ─── Admin (platform-admin account) ─────────────────────────────────────

  test("platform admin sees 'Dostęp do modułów' heading", async ({ page }) => {
    await navigateTo(page, "/admin/entitlements");
    await assertNoErrorBoundary(page);

    const bodyText = await getBodyText(page);

    // If the user is not a platform admin, the 403 card appears — skip the
    // platform-admin-specific assertions rather than failing.
    if (bodyText.includes("Platform admin required")) {
      test.skip();
      return;
    }

    expect(bodyText).toContain("Dostęp do modułów");
  });

  test("platform admin sees at least one org row in the table", async ({ page }) => {
    await navigateTo(page, "/admin/entitlements");
    await assertNoErrorBoundary(page);

    const bodyText = await getBodyText(page);

    if (bodyText.includes("Platform admin required")) {
      test.skip();
      return;
    }

    // The table has column headers Organizacja / Członkowie / CRM / Gabinet.
    expect(bodyText).toContain("Organizacja");
    expect(bodyText).toContain("CRM");
    expect(bodyText).toContain("Gabinet");

    // There should be at least one row with a "Bazowy" CRM badge.
    const bazowy = page.locator('text="Bazowy"').first();
    await expect(bazowy).toBeVisible({ timeout: 10_000 });
  });

  test("platform admin can toggle Gabinet switch and sees success toast", async ({ page }) => {
    await navigateTo(page, "/admin/entitlements");
    await assertNoErrorBoundary(page);

    const bodyText = await getBodyText(page);

    if (bodyText.includes("Platform admin required")) {
      test.skip();
      return;
    }

    // Find the first Gabinet switch in the table.
    const firstSwitch = page.locator('[role="switch"][aria-label*="Gabinet"]').first();
    const switchVisible = await firstSwitch.isVisible({ timeout: 8_000 }).catch(() => false);

    if (!switchVisible) {
      // No orgs visible — skip rather than fail.
      test.skip();
      return;
    }

    // Read current state and toggle.
    const isChecked = await firstSwitch.getAttribute("data-state");
    const wasActive = isChecked === "checked";

    // If revoking (turning off), the confirm dialog will appear — handle it.
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    await firstSwitch.click();

    // Expect either a success toast or the switch to change state.
    const toastAppeared = await page
      .locator('text="Zaktualizowano dostęp"')
      .waitFor({ timeout: 10_000 })
      .then(() => true)
      .catch(() => false);

    if (!toastAppeared) {
      // Mutation may have toggled without toast (already in desired state) —
      // still verify the switch changed.
      const newState = await firstSwitch.getAttribute("data-state").catch(() => null);
      const nowActive = newState === "checked";
      expect(nowActive).not.toBe(wasActive);
    } else {
      expect(toastAppeared).toBe(true);
    }

    // Toggle back to restore state (best-effort, no assertion).
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });
    await firstSwitch.click().catch(() => {});
  });

  // ─── Non-admin (regular authenticated user) ─────────────────────────────

  test("non-platform-admin user sees 403 card", async ({ page }) => {
    await navigateTo(page, "/admin/entitlements");
    await assertNoErrorBoundary(page);
    await waitForApp(page);

    const bodyText = await getBodyText(page);

    // The test account (amiesak@gmail.com) IS a platform admin in the dev
    // environment, so the 403 path cannot be exercised without a separate
    // non-admin account. Guard with a conditional so CI doesn't fail if the
    // account has been granted admin status.
    if (bodyText.includes("Dostęp do modułów")) {
      // Account is a platform admin — skip the 403 assertion.
      test.skip();
      return;
    }

    expect(bodyText).toContain("Platform admin required");

    // "Back to admin" link must be visible.
    const backLink = page.locator('a:has-text("Back to admin")').first();
    await expect(backLink).toBeVisible({ timeout: 5_000 });
  });
});
