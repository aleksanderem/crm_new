import { Page } from "@playwright/test";

export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";
export const TEST_USER = {
  email: process.env.PLAYWRIGHT_TEST_EMAIL ?? "amiesak@gmail.com",
  password: process.env.PLAYWRIGHT_TEST_PASSWORD ?? "ABcdefg123!@#",
};

export async function resetStoredBrowserState(page: Page) {
  await page.goto(BASE_URL, {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  });
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}

export async function waitForAuthSession(page: Page, timeout = 10000) {
  return page
    .waitForFunction(
      () => Object.keys(window.localStorage).some((key) => key.startsWith("__convexAuthJWT_")),
      undefined,
      { timeout },
    )
    .then(() => true)
    .catch(() => false);
}

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
    waitUntil: "domcontentloaded",
    timeout: 20000,
  });
  await waitForApp(page, 5000);

  if (page.url().includes("/dashboard") || page.url().includes("/onboarding")) {
    return;
  }

  const passwordBtn = page
    .locator(
      'button:has-text("Email i hasło"), button:has-text("Password")'
    )
    .first();
  if (await passwordBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
    await passwordBtn.click();
  }

  const emailInput = page
    .locator('input[type="email"], input[name="email"], #userEmail')
    .first();
  await emailInput.waitFor({ state: "visible", timeout: 15000 });
  await emailInput.fill(creds.email);

  const passwordInput = page
    .locator('input[type="password"], input[name="password"], #password')
    .first();
  await passwordInput.waitFor({ state: "visible", timeout: 15000 });
  await passwordInput.fill(creds.password);

  const submitButton = page
    .locator('button[type="submit"], button:has-text("Zaloguj się"), button:has-text("Sign in")')
    .first();
  await submitButton.click();

  const landedOnApp = await page
    .waitForURL(/\/(dashboard|onboarding)/, {
      timeout: 20000,
      waitUntil: "commit",
    })
    .then(() => true)
    .catch(() => false);
  await waitForApp(page, 8000);
  const hasAuthSession = await waitForAuthSession(page, 12000);

  if (landedOnApp || hasAuthSession) {
    if (!page.url().includes("/dashboard") && !page.url().includes("/onboarding")) {
      await page.goto(`${BASE_URL}/dashboard`, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });
      await waitForApp(page, 8000);
    }
  }

  if (!(page.url().includes("/dashboard") || page.url().includes("/onboarding"))) {
    throw new Error(`Login failed, current URL: ${page.url()}`);
  }
}

/**
 * Login and ensure we land on the dashboard.
 */
export async function loginAndGoToDashboard(page: Page) {
  await login(page);

  if (!page.url().includes("/dashboard")) {
    await page.goto(`${BASE_URL}/dashboard`, {
      waitUntil: "domcontentloaded",
      timeout: 10000,
    });
    await waitForApp(page);
  }

  if (page.url().includes("/login")) {
    await login(page);
  }

  await waitForAuthSession(page);

  if (!page.url().includes("/dashboard")) {
    throw new Error(`Dashboard navigation failed, current URL: ${page.url()}`);
  }
}
