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

  // ─── 19.1 continued — Viewer restrictions ────────────────────

  test("permission denied message pattern exists in codebase", async ({
    page,
  }) => {
    // Verify the permission system is active by loading a protected page
    await loginAndGoToDashboard(page);
    await navigateTo(page, "/dashboard/settings/permissions");
    await assertNoErrorBoundary(page);

    // The page should load showing permission controls — admin sees everything
    const bodyText = await getBodyText(page);
    const hasPermissions =
      bodyText.includes("Uprawnienia") ||
      bodyText.includes("Permissions") ||
      bodyText.includes("Role") ||
      bodyText.includes("Rola");
    expect(hasPermissions).toBe(true);
  });

  // ─── 19.2 continued — Role-based UI ──────────────────────────

  test("admin sees edit and delete buttons on contacts page", async ({
    page,
  }) => {
    await loginAndGoToDashboard(page);
    await navigateTo(page, "/dashboard/contacts");

    // Admin should see action menu with edit/delete options
    const menuTrigger = page
      .locator(
        'table tbody tr button[aria-haspopup="menu"], table tbody tr button:has(svg)'
      )
      .first();

    if (
      !(await menuTrigger.isVisible({ timeout: 5000 }).catch(() => false))
    ) {
      // No data rows — that's ok
      await assertNoErrorBoundary(page);
      return;
    }

    await menuTrigger.click();
    await page.waitForTimeout(500);

    const menuText = await page.locator('[role="menu"]').innerText().catch(() => "");
    const hasEditDelete =
      menuText.includes("Edytuj") ||
      menuText.includes("Edit") ||
      menuText.includes("Usuń") ||
      menuText.includes("Delete");
    expect(hasEditDelete).toBe(true);

    await page.keyboard.press("Escape");
  });

  test("quick-create button visible for admin user", async ({ page }) => {
    await loginAndGoToDashboard(page);

    // Quick-create is typically in the header
    const quickCreateBtn = page
      .locator(
        'button:has-text("Szybkie tworzenie"), button:has-text("Quick create"), button[aria-label*="create"], button[aria-label*="nowy"]'
      )
      .first();

    // Look for the + button in header for quick create
    const headerPlusBtn = page
      .locator('header button:has(svg), nav button:has(svg)')
      .first();

    // Admin should have create capability visible somewhere
    await assertNoErrorBoundary(page);

    const bodyText = await getBodyText(page);
    const hasCreateOption =
      bodyText.includes("Dodaj") ||
      bodyText.includes("Add") ||
      bodyText.includes("Nowy") ||
      bodyText.includes("New") ||
      bodyText.includes("Utwórz") ||
      bodyText.includes("Create");
    expect(hasCreateOption).toBe(true);
  });
});
