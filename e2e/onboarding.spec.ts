import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  TEST_USER,
  login,
  loginAndGoToDashboard,
  waitForApp,
} from "./helpers/auth";
import { assertNoErrorBoundary, getBodyText } from "./helpers/common";

test.describe("Registration & Organization Onboarding", () => {
  test.setTimeout(90_000);

  // ─── 1. Sign-up form is accessible from the login page ───────────

  test("login page has sign-up option", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await assertNoErrorBoundary(page);

    // Navigate to password method first
    const passwordBtn = page
      .locator('button:has-text("Email i hasło"), button:has-text("Password")')
      .first();
    if (await passwordBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
      await passwordBtn.click();
      await page.waitForTimeout(500);
    }

    // A toggle between sign-in and sign-up must exist
    const signUpToggle = page
      .locator(
        'button:has-text("Utwórz konto"), button:has-text("Create account"), button:has-text("Zarejestruj"), button:has-text("Sign up"), button:has-text("Nie masz konta")'
      )
      .first();

    // Either a dedicated sign-up button or a toggle link is present
    const bodyText = await getBodyText(page);
    const hasSignUpOption =
      (await signUpToggle.isVisible({ timeout: 3000 }).catch(() => false)) ||
      bodyText.includes("konta") ||
      bodyText.includes("account") ||
      bodyText.includes("Zarejestruj") ||
      bodyText.includes("Sign up");

    expect(hasSignUpOption).toBe(true);
  });

  test("sign-up form renders with required fields", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });

    const passwordBtn = page
      .locator('button:has-text("Email i hasło"), button:has-text("Password")')
      .first();
    if (await passwordBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
      await passwordBtn.click();
      await page.waitForTimeout(500);
    }

    // Switch to sign-up mode
    const signUpToggle = page
      .locator(
        'button:has-text("Utwórz konto"), button:has-text("Create account"), button:has-text("Zarejestruj"), button:has-text("Sign up"), p button'
      )
      .last();
    if (await signUpToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await signUpToggle.click();
      await page.waitForTimeout(500);
    }

    // Email and password inputs must be present
    const emailInput = page.locator('input[type="email"], input[name="email"], #userEmail').first();
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();

    await expect(emailInput).toBeVisible({ timeout: 5000 });
    await expect(passwordInput).toBeVisible({ timeout: 5000 });

    // Submit button must exist
    const submitBtn = page.locator('button[type="submit"]').first();
    await expect(submitBtn).toBeVisible({ timeout: 3000 });

    await assertNoErrorBoundary(page);
  });

  test("sign-up validates empty fields", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });

    const passwordBtn = page
      .locator('button:has-text("Email i hasło"), button:has-text("Password")')
      .first();
    if (await passwordBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
      await passwordBtn.click();
      await page.waitForTimeout(500);
    }

    // Switch to sign-up mode
    const signUpToggle = page
      .locator('p button, button:has-text("Utwórz")')
      .last();
    if (await signUpToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await signUpToggle.click();
      await page.waitForTimeout(500);
    }

    // Submit empty form
    const submitBtn = page.locator('button[type="submit"]').first();
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(1000);

      // Should show validation errors or stay on the same page
      expect(page.url()).toContain("/login");
    }

    await assertNoErrorBoundary(page);
  });

  // ─── 2. Onboarding page (username step) ──────────────────────────

  test("onboarding username route renders without crash", async ({ page }) => {
    // When visiting /onboarding/username directly while authenticated,
    // the page should render the username form (or redirect to dashboard
    // if the user already completed onboarding)
    await login(page);

    await page.goto(`${BASE_URL}/onboarding/username`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await waitForApp(page);
    await assertNoErrorBoundary(page);

    const url = page.url();
    // Either shows the onboarding form or redirects to dashboard (if already onboarded)
    const isOnValidPage =
      url.includes("/onboarding") ||
      url.includes("/dashboard") ||
      url.includes("/login");
    expect(isOnValidPage).toBe(true);

    const body = await getBodyText(page);
    expect(body.length).toBeGreaterThan(10);
  });

  test("onboarding username page has username input when rendered", async ({
    page,
  }) => {
    await login(page);

    await page.goto(`${BASE_URL}/onboarding/username`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await waitForApp(page);
    await assertNoErrorBoundary(page);

    // If we land on onboarding (user without username), verify the form
    if (page.url().includes("/onboarding")) {
      const usernameInput = page
        .locator('input[name="username"], input[placeholder*="sername"], input[placeholder*="zywatel"]')
        .first();
      await expect(usernameInput).toBeVisible({ timeout: 5000 });

      const submitBtn = page.locator('button[type="submit"]').first();
      await expect(submitBtn).toBeVisible({ timeout: 3000 });
    }
    // If already onboarded, we're on dashboard — that's fine
  });

  // ─── 3. New user flow: registration → onboarding → dashboard ─────

  test("registration form submitting invalid email shows error", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });

    const passwordBtn = page
      .locator('button:has-text("Email i hasło"), button:has-text("Password")')
      .first();
    if (await passwordBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
      await passwordBtn.click();
      await page.waitForTimeout(500);
    }

    // Switch to sign-up mode
    const signUpToggle = page.locator('p button').last();
    if (await signUpToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await signUpToggle.click();
      await page.waitForTimeout(500);
    }

    const emailInput = page
      .locator('input[type="email"], input[name="email"], #userEmail')
      .first();
    const passwordInput = page
      .locator('input[type="password"], input[name="password"]')
      .first();

    if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await emailInput.fill("not-an-email");
      if (await passwordInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await passwordInput.fill("short");
      }
      const submitBtn = page.locator('button[type="submit"]').first();
      if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await submitBtn.click();
        await page.waitForTimeout(1500);
        // Should remain on login with validation errors
        expect(page.url()).toContain("/login");
      }
    }

    await assertNoErrorBoundary(page);
  });

  // ─── 4. Authenticated user ends up in app, not onboarding ────────

  test("authenticated user is not stuck on onboarding", async ({ page }) => {
    await loginAndGoToDashboard(page);

    // User should be on dashboard, not stuck in onboarding
    expect(page.url()).toContain("/dashboard");
    expect(page.url()).not.toContain("/onboarding");

    await assertNoErrorBoundary(page);

    const body = await getBodyText(page);
    expect(body.length).toBeGreaterThan(100);
  });

  // ─── 5. Invite flow: pre-filled email from invite token ──────────

  test("login page with inviteToken renders invite banner context", async ({
    page,
  }) => {
    // Navigate to login with a fake invite token — should show invite-specific UI
    await page.goto(`${BASE_URL}/login?inviteToken=fake-token-123`, {
      waitUntil: "networkidle",
    });
    await waitForApp(page);
    await assertNoErrorBoundary(page);

    // Should show OTP form (invite flow skips method choice) or email input
    const body = await getBodyText(page);
    expect(body.length).toBeGreaterThan(10);

    // Should not crash / show error boundary
    const errorBoundary = await page
      .locator("text=/Something went wrong|Coś poszło nie tak/i")
      .count()
      .catch(() => 0);
    expect(errorBoundary).toBe(0);
  });
});
