import { Page } from "@playwright/test";

export const BASE_URL = "http://localhost:5173";
export const TEST_USER = {
  email: "amiesak@gmail.com",
  password: "ABcdefg123!@#",
};

/**
 * Wait for the app to settle after navigation or action.
 */
export async function waitForApp(page: Page, timeout = 8000) {
  await page.waitForLoadState("networkidle", { timeout }).catch(() => {});
  await page.waitForTimeout(500);
}

/**
 * Login with email+password flow. Assumes the app is running at BASE_URL.
 * After login, the user should be on /dashboard or /onboarding.
 */
export async function login(page: Page, creds = TEST_USER) {
  await page.goto(`${BASE_URL}/login`, {
    waitUntil: "networkidle",
    timeout: 15000,
  });

  // Click "Email i hasło" to switch to password form
  const passwordBtn = page
    .locator(
      'button:has-text("Email i hasło"), button:has-text("Password")'
    )
    .first();
  if (await passwordBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await passwordBtn.click();
    await page.waitForTimeout(500);
  }

  await page.fill(
    'input[type="email"], input[name="email"]',
    creds.email
  );
  await page.fill(
    'input[type="password"], input[name="password"]',
    creds.password
  );
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  await waitForApp(page);
}

/**
 * Login and ensure we land on the dashboard.
 */
export async function loginAndGoToDashboard(page: Page) {
  await login(page);

  const url = page.url();
  if (!url.includes("/dashboard")) {
    await page.goto(`${BASE_URL}/dashboard`, {
      waitUntil: "domcontentloaded",
      timeout: 10000,
    });
    await waitForApp(page);
  }
}
