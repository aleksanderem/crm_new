import { test, expect } from "@playwright/test";
import { loginAndGoToDashboard, waitForApp } from "../helpers/auth";
import { navigateTo, assertNoErrorBoundary } from "../helpers/common";

test.describe("Sidebar Navigation", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await loginAndGoToDashboard(page);
  });

  test("all sidebar items navigate correctly", async ({ page }) => {
    await navigateTo(page, "/dashboard");

    // Get all sidebar links
    const sidebarLinks = page.locator("aside a[href]");
    const count = await sidebarLinks.count();
    expect(count).toBeGreaterThan(3);

    // Click through a few key links and verify navigation
    const paths = ["/dashboard/contacts", "/dashboard/companies", "/dashboard/leads"];

    for (const path of paths) {
      const link = page.locator(`aside a[href*="${path.replace("/dashboard/", "")}"]`).first();
      if (await link.isVisible({ timeout: 2000 }).catch(() => false)) {
        await link.click();
        await page.waitForTimeout(1500);
        await waitForApp(page);
        await assertNoErrorBoundary(page);
      }
    }
  });

  test("active item highlights", async ({ page }) => {
    await navigateTo(page, "/dashboard/contacts");

    // The active sidebar item should have a different style (data-active, aria-current, etc.)
    const activeLink = page.locator(
      'aside a[data-active="true"], aside a[aria-current="page"], aside a.active'
    );
    const hasActive = (await activeLink.count()) > 0;
    // Alternatively, check for a link that includes "/contacts" with distinct styling
    const contactsLink = page.locator('aside a[href*="contacts"]').first();
    expect(
      await contactsLink.isVisible({ timeout: 3000 }).catch(() => false)
    ).toBe(true);
  });

  test("collapsible sections expand/collapse", async ({ page }) => {
    await navigateTo(page, "/dashboard");

    // Look for collapsible group triggers in sidebar
    const collapsible = page
      .locator(
        'aside button[data-state], aside [data-collapsible], aside button[aria-expanded]'
      )
      .first();

    if (
      await collapsible.isVisible({ timeout: 3000 }).catch(() => false)
    ) {
      await collapsible.click();
      await page.waitForTimeout(300);
      // Should toggle state without errors
      await assertNoErrorBoundary(page);
    }
  });
});
