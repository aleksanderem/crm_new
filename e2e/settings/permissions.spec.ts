import { test, expect } from "@playwright/test";
import { BASE_URL, waitForApp } from "../helpers/auth";
import { assertNoErrorBoundary } from "../helpers/common";

test.describe("Settings — Permissions", () => {
  test.setTimeout(60_000);

  test("non-authenticated user cannot access admin routes", async ({
    page,
  }) => {
    // Try to access settings without login
    await page.goto(`${BASE_URL}/dashboard/settings/team`, {
      waitUntil: "domcontentloaded",
      timeout: 10000,
    });
    await waitForApp(page);

    // Should redirect to login
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
});
