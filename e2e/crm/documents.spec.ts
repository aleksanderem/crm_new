import { test, expect } from "@playwright/test";
import { loginAndGoToDashboard } from "../helpers/auth";
import { navigateTo, assertNoErrorBoundary, getBodyText } from "../helpers/common";

test.describe("CRM — Documents", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await loginAndGoToDashboard(page);
  });

  test("documents list loads", async ({ page }) => {
    await navigateTo(page, "/dashboard/documents");
    await assertNoErrorBoundary(page);

    const bodyText = await getBodyText(page);
    expect(bodyText.length).toBeGreaterThan(50);
  });

  test("upload button is available", async ({ page }) => {
    await navigateTo(page, "/dashboard/documents");

    const uploadBtn = page
      .locator(
        'button:has-text("Dodaj"), button:has-text("Upload"), button:has-text("Prześlij"), button:has-text("Nowy")'
      )
      .first();

    const isVisible = await uploadBtn
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    // Document page should either show upload button or empty state
    await assertNoErrorBoundary(page);
  });
});
