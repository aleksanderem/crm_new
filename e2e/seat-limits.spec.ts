import { test, expect, Page } from "@playwright/test";

const BASE = "http://localhost:5173";
const CREDS = { email: "amiesak@gmail.com", password: "ABcdefg123!@#" };

async function waitForApp(page: Page, timeout = 10000) {
  await page.waitForLoadState("networkidle", { timeout }).catch(() => {});
  await page.waitForTimeout(800);
}

async function login(page: Page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 15000 });

  const passwordBtn = page
    .locator(
      'button:has-text("Email i hasło"), button:has-text("Email"), button:has-text("Password")'
    )
    .first();
  if (await passwordBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await passwordBtn.click();
    await page.waitForTimeout(500);
  }

  await page.fill(
    'input[type="email"], input[placeholder*="Email"], input[name="email"]',
    CREDS.email
  );
  await page.fill(
    'input[type="password"], input[placeholder*="asło"], input[name="password"]',
    CREDS.password
  );
  await page.click(
    'button[type="submit"], button:has-text("Zaloguj"), button:has-text("Sign in")'
  );
  await page.waitForTimeout(3000);
  await waitForApp(page);
}

test.describe("Seat Limits E2E", () => {
  test.setTimeout(120000);

  test("team settings page shows seat usage and invite flow works", async ({
    page,
  }) => {
    // Login
    await login(page);

    // Navigate to team settings
    await page.goto(`${BASE}/dashboard/settings/team`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await waitForApp(page);

    // ─── Test: UI shows seat usage correctly ───
    // Look for the seat usage card with "X of Y" pattern or progress bar
    const seatUsageText = await page.locator("body").innerText();
    const hasSeatUsage =
      /\d+\s*(of|z|\/)\s*\d+/.test(seatUsageText) ||
      seatUsageText.includes("seats") ||
      seatUsageText.includes("miejsc");

    expect(hasSeatUsage).toBe(true);

    // Verify progress bar is visible
    const progressBar = page.locator('[role="progressbar"]');
    const progressVisible = await progressBar
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    expect(progressVisible).toBe(true);

    // ─── Test: Invite flow with seat limit ───
    // Find the invite member button
    const inviteBtn = page
      .locator(
        'button:has-text("Zaproś"), button:has-text("Invite"), button:has-text("Dodaj")'
      )
      .first();
    const inviteBtnVisible = await inviteBtn
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (inviteBtnVisible) {
      const isDisabled = await inviteBtn.isDisabled();

      if (isDisabled) {
        // ─── Test: Upgrade CTA appears when limit reached ───
        // When button is disabled, we should see an upgrade CTA or limit message
        const bodyText = await page.locator("body").innerText();
        const hasLimitMessage =
          bodyText.includes("limit") ||
          bodyText.includes("Upgrade") ||
          bodyText.includes("Uaktualnij") ||
          bodyText.includes("plan");
        expect(hasLimitMessage).toBe(true);
      } else {
        // Button is enabled — open dialog and verify remaining seats info
        await inviteBtn.click();
        await page.waitForTimeout(1000);

        const dialog = page.locator('[role="dialog"]');
        await expect(dialog).toBeVisible({ timeout: 5000 });

        // Check for remaining seats info in the dialog
        const dialogText = await dialog.innerText();
        const hasRemainingInfo =
          dialogText.includes("remaining") ||
          dialogText.includes("seats") ||
          dialogText.includes("miejsc") ||
          dialogText.includes("pozostał");
        expect(hasRemainingInfo).toBe(true);

        // Close dialog without sending
        await page.keyboard.press("Escape");
        await page.waitForTimeout(500);
      }
    }
  });
});
