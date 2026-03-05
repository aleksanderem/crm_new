import { test, expect } from "@playwright/test";
import { loginAndGoToDashboard, waitForApp } from "../helpers/auth";
import { navigateTo, assertNoErrorBoundary, getBodyText } from "../helpers/common";

test.describe("Settings — Team", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await loginAndGoToDashboard(page);
  });

  test("team members list loads", async ({ page }) => {
    await navigateTo(page, "/dashboard/settings/team");
    await assertNoErrorBoundary(page);

    const bodyText = await getBodyText(page);
    expect(bodyText.length).toBeGreaterThan(50);
  });

  test("seat usage displays", async ({ page }) => {
    await navigateTo(page, "/dashboard/settings/team");

    const bodyText = await getBodyText(page);
    // Should show seat usage like "1 of 5" or "1 z 5"
    const hasSeatUsage =
      /\d+\s*(of|z|\/)\s*\d+/.test(bodyText) ||
      bodyText.includes("seats") ||
      bodyText.includes("miejsc");
    expect(hasSeatUsage).toBe(true);
  });

  test("progress bar shows usage", async ({ page }) => {
    await navigateTo(page, "/dashboard/settings/team");

    const progressBar = page.locator('[role="progressbar"]');
    const isVisible = await progressBar
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    expect(isVisible).toBe(true);
  });

  test("invite member button exists", async ({ page }) => {
    await navigateTo(page, "/dashboard/settings/team");

    const inviteBtn = page
      .locator(
        'button:has-text("Zaproś"), button:has-text("Invite"), button:has-text("Dodaj")'
      )
      .first();

    const isVisible = await inviteBtn
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    expect(isVisible).toBe(true);
  });
});
