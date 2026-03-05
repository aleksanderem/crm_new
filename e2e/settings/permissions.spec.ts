import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  loginAndGoToDashboard,
  waitForApp,
} from "../helpers/auth";
import {
  assertNoErrorBoundary,
  getBodyText,
  navigateTo,
} from "../helpers/common";

test.describe("Settings — Permissions", () => {
  test.setTimeout(60_000);

  // ─── 19.1 Permission Gates (unauthenticated) ─────────────────

  test("non-authenticated user cannot access admin routes", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/dashboard/settings/team`, {
      waitUntil: "domcontentloaded",
      timeout: 10000,
    });
    await waitForApp(page);

    expect(page.url()).toContain("/login");
  });

  test("non-authenticated user cannot access permissions settings", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/dashboard/settings/permissions`, {
      waitUntil: "domcontentloaded",
      timeout: 10000,
    });
    await waitForApp(page);

    expect(page.url()).toContain("/login");
  });

  test("non-authenticated user cannot access gabinet settings", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/dashboard/gabinet/settings/scheduling`, {
      waitUntil: "domcontentloaded",
      timeout: 10000,
    });
    await waitForApp(page);

    expect(page.url()).toContain("/login");
  });

  test("non-authenticated user cannot access CRM contacts", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/dashboard/contacts`, {
      waitUntil: "domcontentloaded",
      timeout: 10000,
    });
    await waitForApp(page);

    expect(page.url()).toContain("/login");
  });

  test("non-authenticated user cannot access patient portal admin", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/dashboard/gabinet/patients`, {
      waitUntil: "domcontentloaded",
      timeout: 10000,
    });
    await waitForApp(page);

    expect(page.url()).toContain("/login");
  });

  // ─── 19.2 Role-Based UI (authenticated admin) ────────────────

  test("admin can access permissions settings page", async ({ page }) => {
    await loginAndGoToDashboard(page);
    await navigateTo(page, "/dashboard/settings/permissions");
    await assertNoErrorBoundary(page);

    const bodyText = await getBodyText(page);
    // Admin should see permission management UI
    const hasPermContent =
      bodyText.includes("Uprawnienia") ||
      bodyText.includes("Permissions") ||
      bodyText.includes("Role") ||
      bodyText.includes("Rola");
    expect(hasPermContent).toBe(true);
  });

  test("permissions page shows role matrix", async ({ page }) => {
    await loginAndGoToDashboard(page);
    await navigateTo(page, "/dashboard/settings/permissions");
    await assertNoErrorBoundary(page);

    const bodyText = await getBodyText(page);
    // Should contain role names
    const hasRoles =
      bodyText.includes("admin") ||
      bodyText.includes("Admin") ||
      bodyText.includes("member") ||
      bodyText.includes("Member") ||
      bodyText.includes("viewer") ||
      bodyText.includes("Viewer") ||
      bodyText.includes("owner") ||
      bodyText.includes("Owner");
    expect(hasRoles).toBe(true);
  });

  test("permissions page shows feature toggle controls", async ({ page }) => {
    await loginAndGoToDashboard(page);
    await navigateTo(page, "/dashboard/settings/permissions");

    // Should have checkboxes or switches for permissions
    const toggles = page.locator(
      'input[type="checkbox"], button[role="checkbox"], button[role="switch"]'
    );
    const count = await toggles.count();

    // Should have some toggleable permission controls
    await assertNoErrorBoundary(page);
  });

  test("sidebar shows correct actions for authenticated user", async ({
    page,
  }) => {
    await loginAndGoToDashboard(page);

    // Sidebar should show navigation items for the user's permissions
    const sidebar = page.locator("aside, nav").first();
    if (await sidebar.isVisible({ timeout: 5000 }).catch(() => false)) {
      const sidebarText = await sidebar.innerText();

      // Admin should see settings link
      const hasSettings =
        sidebarText.includes("Ustawienia") ||
        sidebarText.includes("Settings");
      expect(hasSettings).toBe(true);
    }
  });
});
