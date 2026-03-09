import { test, expect } from "@playwright/test";
import { loginAndGoToDashboard } from "../helpers/auth";
import { navigateTo, assertNoErrorBoundary, getBodyText } from "../helpers/common";

test.describe("Gabinet — Document Send to Patient", () => {
  test.setTimeout(120_000);
  test.beforeEach(async ({ page }) => { await loginAndGoToDashboard(page); });

  test("documents page loads", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/documents");
    await assertNoErrorBoundary(page);
    expect((await getBodyText(page)).length).toBeGreaterThan(50);
  });

  test("templates page loads", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/settings/document-templates");
    await assertNoErrorBoundary(page);
    expect((await getBodyText(page)).length).toBeGreaterThan(50);
  });

  test("patient portal renders", async ({ page }) => {
    await page.goto("http://localhost:5173/patient/login", { waitUntil: "domcontentloaded", timeout: 15000 });
    expect((await getBodyText(page)).length).toBeGreaterThan(10);
  });
});
