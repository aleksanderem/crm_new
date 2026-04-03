import { test, expect } from "@playwright/test";
import { loginAndGoToDashboard, waitForApp } from "../helpers/auth";
import { navigateTo, assertNoErrorBoundary } from "../helpers/common";

test.describe("Gabinet — Employees", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await loginAndGoToDashboard(page);
  });

  test("employee history tab renders presenter-style email details when available", async ({
    page,
  }) => {
    await navigateTo(page, "/dashboard/gabinet/employees");
    await waitForApp(page);

    const employeeLink = page.locator('a[href*="/gabinet/employees/"]').first();
    const tableRow = page.locator("table tbody tr").first();

    if (await employeeLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await employeeLink.click();
    } else if (await tableRow.isVisible({ timeout: 3000 }).catch(() => false)) {
      await tableRow.click();
    } else {
      test.skip();
      return;
    }

    await page.waitForTimeout(1500);
    await waitForApp(page);

    if (!page.url().includes("/gabinet/employees/")) {
      test.skip();
      return;
    }

    const historyTab = page
      .locator('[role="tab"]:has-text("Historia"), [role="tab"]:has-text("History")')
      .first();

    if (!(await historyTab.isVisible({ timeout: 4000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await historyTab.click();
    await page.waitForTimeout(1000);
    await assertNoErrorBoundary(page);

    await expect(
      page
        .locator('text=/Subject:|To:|From:|Sent email ".*" to|Received email ".*" from/')
        .first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("employee detail hides the wide shell sidebar after a fresh reload", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/employees");
    await waitForApp(page);

    const employeeLink = page.locator('a[href*="/gabinet/employees/"]').first();
    const tableRow = page.locator("table tbody tr").first();

    if (await employeeLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await employeeLink.click();
    } else if (await tableRow.isVisible({ timeout: 3000 }).catch(() => false)) {
      await tableRow.click();
    } else {
      test.skip();
      return;
    }

    await waitForApp(page);

    if (!page.url().includes("/gabinet/employees/")) {
      test.skip();
      return;
    }

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await assertNoErrorBoundary(page);

    await expect(page.getByRole("button", { name: /Gabinet Klinika i klienci|Gabinet Clinic & clients/ })).toHaveCount(0);
    await expect(page.locator("main h1")).toBeVisible();
  });
});
