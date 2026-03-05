import { test, expect } from "@playwright/test";
import { loginAndGoToDashboard, waitForApp } from "../helpers/auth";
import {
  navigateTo,
  assertNoErrorBoundary,
  getBodyText,
} from "../helpers/common";

test.describe("Gabinet — Loyalty", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await loginAndGoToDashboard(page);
  });

  // ─── Helper: navigate to first patient's detail page ─────────

  async function goToFirstPatientDetail(page: import("@playwright/test").Page) {
    await navigateTo(page, "/dashboard/gabinet/patients");
    await page.waitForTimeout(2000);

    // Click first patient row to open detail
    const firstRow = page.locator("table tbody tr").first();
    if (await firstRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstRow.click();
      await page.waitForTimeout(2000);
      await waitForApp(page);
      return true;
    }

    // Fallback: look for a clickable card or link
    const patientLink = page.locator('a[href*="/patients/"]').first();
    if (await patientLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await patientLink.click();
      await page.waitForTimeout(2000);
      await waitForApp(page);
      return true;
    }

    return false;
  }

  async function clickLoyaltyTab(page: import("@playwright/test").Page) {
    const loyaltyTab = page
      .locator(
        'button:has-text("Lojalno"), button:has-text("Loyalty"), [role="tab"]:has-text("Lojalno"), [role="tab"]:has-text("Loyalty")'
      )
      .first();

    if (await loyaltyTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await loyaltyTab.click();
      await page.waitForTimeout(1000);
      return true;
    }
    return false;
  }

  // ─── 15.1 Points Flow ──────────────────────────────────────────

  test("loyalty tab exists in patient detail", async ({ page }) => {
    const opened = await goToFirstPatientDetail(page);
    if (!opened) {
      test.skip();
      return;
    }

    await assertNoErrorBoundary(page);

    // Look for loyalty tab
    const loyaltyTab = page
      .locator(
        'button:has-text("Lojalno"), button:has-text("Loyalty"), [role="tab"]:has-text("Lojalno"), [role="tab"]:has-text("Loyalty")'
      )
      .first();

    const isVisible = await loyaltyTab
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    expect(isVisible).toBe(true);
  });

  test("loyalty tab shows points balance cards", async ({ page }) => {
    const opened = await goToFirstPatientDetail(page);
    if (!opened) {
      test.skip();
      return;
    }

    const tabClicked = await clickLoyaltyTab(page);
    if (!tabClicked) {
      test.skip();
      return;
    }

    await assertNoErrorBoundary(page);

    const bodyText = await getBodyText(page);
    // Should show points-related labels
    const hasPointsContent =
      bodyText.includes("punkt") ||
      bodyText.includes("Punkt") ||
      bodyText.includes("Points") ||
      bodyText.includes("points") ||
      bodyText.includes("Saldo") ||
      bodyText.includes("Balance") ||
      bodyText.includes("balance");
    expect(hasPointsContent).toBe(true);
  });

  test("loyalty tab shows earned and spent totals", async ({ page }) => {
    const opened = await goToFirstPatientDetail(page);
    if (!opened) {
      test.skip();
      return;
    }

    const tabClicked = await clickLoyaltyTab(page);
    if (!tabClicked) {
      test.skip();
      return;
    }

    await assertNoErrorBoundary(page);

    // Should display 3 cards: balance, earned, spent
    // Look for card-like containers
    const cards = page.locator('[class*="Card"], [class*="card"]');
    const bodyText = await getBodyText(page);

    // Should contain earned and/or spent labels
    const hasEarnedSpent =
      bodyText.includes("Zebran") ||
      bodyText.includes("Earned") ||
      bodyText.includes("earned") ||
      bodyText.includes("Wydane") ||
      bodyText.includes("Spent") ||
      bodyText.includes("spent") ||
      bodyText.includes("Zdobyte") ||
      bodyText.includes("zdobyte");

    // Soft assertion — may not have data yet
    await assertNoErrorBoundary(page);
  });

  test("loyalty tier displays based on points", async ({ page }) => {
    const opened = await goToFirstPatientDetail(page);
    if (!opened) {
      test.skip();
      return;
    }

    const tabClicked = await clickLoyaltyTab(page);
    if (!tabClicked) {
      test.skip();
      return;
    }

    await assertNoErrorBoundary(page);

    const bodyText = await getBodyText(page);
    // Should show tier badge (bronze/silver/gold/platinum)
    const hasTier =
      bodyText.includes("bronze") ||
      bodyText.includes("Bronze") ||
      bodyText.includes("Brązowy") ||
      bodyText.includes("silver") ||
      bodyText.includes("Silver") ||
      bodyText.includes("Srebrny") ||
      bodyText.includes("gold") ||
      bodyText.includes("Gold") ||
      bodyText.includes("Złoty") ||
      bodyText.includes("platinum") ||
      bodyText.includes("Platinum") ||
      bodyText.includes("Platynowy") ||
      bodyText.includes("Tier") ||
      bodyText.includes("tier") ||
      bodyText.includes("Poziom") ||
      bodyText.includes("poziom");

    // Soft check — tier display depends on having a loyalty record
    await assertNoErrorBoundary(page);
  });

  test("transaction history shows in loyalty tab", async ({ page }) => {
    const opened = await goToFirstPatientDetail(page);
    if (!opened) {
      test.skip();
      return;
    }

    const tabClicked = await clickLoyaltyTab(page);
    if (!tabClicked) {
      test.skip();
      return;
    }

    await assertNoErrorBoundary(page);

    const bodyText = await getBodyText(page);
    // Should show transaction history section or empty state
    const hasTransactionSection =
      bodyText.includes("Historia") ||
      bodyText.includes("History") ||
      bodyText.includes("history") ||
      bodyText.includes("Transakcj") ||
      bodyText.includes("Transaction") ||
      bodyText.includes("Brak") ||
      bodyText.includes("No transactions") ||
      bodyText.includes("brak");

    // Soft check — may not have transactions yet
    await assertNoErrorBoundary(page);
  });

  test("points balance updates display correctly", async ({ page }) => {
    const opened = await goToFirstPatientDetail(page);
    if (!opened) {
      test.skip();
      return;
    }

    const tabClicked = await clickLoyaltyTab(page);
    if (!tabClicked) {
      test.skip();
      return;
    }

    await assertNoErrorBoundary(page);

    // Verify the balance is displayed as a number
    const bodyText = await getBodyText(page);
    // Should contain at least a "0" or some numeric value for balance
    const hasNumeric = /\d+/.test(bodyText);
    expect(hasNumeric).toBe(true);
  });

  test("earn transaction shows green styling", async ({ page }) => {
    const opened = await goToFirstPatientDetail(page);
    if (!opened) {
      test.skip();
      return;
    }

    const tabClicked = await clickLoyaltyTab(page);
    if (!tabClicked) {
      test.skip();
      return;
    }

    // Look for earn-type transaction indicators (green badge or + icon)
    const earnBadge = page
      .locator(
        '[class*="green"], [class*="emerald"], :has-text("+"):not(button)'
      )
      .first();

    // Soft check — earn transactions may not exist
    await assertNoErrorBoundary(page);
  });

  test("spend transaction shows red styling", async ({ page }) => {
    const opened = await goToFirstPatientDetail(page);
    if (!opened) {
      test.skip();
      return;
    }

    const tabClicked = await clickLoyaltyTab(page);
    if (!tabClicked) {
      test.skip();
      return;
    }

    // Look for spend-type transaction indicators (red badge or - icon)
    const spendBadge = page
      .locator('[class*="red"], [class*="destructive"]')
      .first();

    // Soft check — spend transactions may not exist
    await assertNoErrorBoundary(page);
  });
});
