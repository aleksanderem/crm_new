import { test, expect } from "@playwright/test";
import { BASE_URL, TEST_USER, login, waitForApp } from "./helpers/auth";

test.describe("Auth", () => {
  test.setTimeout(60_000);

  // ─── 1.1 Login Flow ───────────────────────────────────────────

  test("email + password login succeeds", async ({ page }) => {
    await login(page);
    const url = page.url();
    expect(
      url.includes("/dashboard") || url.includes("/onboarding")
    ).toBe(true);
  });

  test("invalid password shows error", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });

    const passwordBtn = page
      .locator('button:has-text("Email i hasło")')
      .first();
    if (await passwordBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await passwordBtn.click();
      await page.waitForTimeout(500);
    }

    await page.fill('input[type="email"], input[name="email"]', TEST_USER.email);
    await page.fill(
      'input[type="password"], input[name="password"]',
      "wrongpassword123"
    );
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    // Should still be on login page with an error
    expect(page.url()).toContain("/login");
    const bodyText = await page.locator("body").innerText();
    const hasError =
      bodyText.includes("Nieprawidłow") ||
      bodyText.includes("Invalid") ||
      bodyText.includes("error") ||
      bodyText.includes("błąd") ||
      bodyText.includes("incorrect") ||
      bodyText.includes("nie powiod");
    expect(hasError).toBe(true);
  });

  test("login redirects to dashboard or onboarding", async ({ page }) => {
    await login(page);
    const url = page.url();
    // Must land on dashboard or onboarding, not stay on login
    expect(url).not.toContain("/login");
    expect(
      url.includes("/dashboard") || url.includes("/onboarding")
    ).toBe(true);
  });

  // ─── 1.2 Session Management ───────────────────────────────────

  test("refresh preserves session", async ({ page }) => {
    await login(page);
    const urlBefore = page.url();
    expect(
      urlBefore.includes("/dashboard") || urlBefore.includes("/onboarding")
    ).toBe(true);

    // Reload the page
    await page.reload({ waitUntil: "networkidle" });
    await waitForApp(page);

    // Should still be authenticated (not redirected to login)
    const urlAfter = page.url();
    expect(urlAfter).not.toContain("/login");
  });

  test("protected route redirects to login when not authenticated", async ({
    page,
  }) => {
    // Go directly to dashboard without logging in
    await page.goto(`${BASE_URL}/dashboard`, {
      waitUntil: "domcontentloaded",
      timeout: 10000,
    });
    await waitForApp(page);

    // Should be redirected to login
    expect(page.url()).toContain("/login");
  });

  test("non-existent user shows error", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });

    const passwordBtn = page
      .locator('button:has-text("Email i hasło")')
      .first();
    if (await passwordBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await passwordBtn.click();
      await page.waitForTimeout(500);
    }

    await page.fill(
      'input[type="email"], input[name="email"]',
      "totally-nonexistent-user-99999@fake-domain-xyz.com"
    );
    await page.fill(
      'input[type="password"], input[name="password"]',
      "SomePassword123!"
    );
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    // Should still be on login page
    expect(page.url()).toContain("/login");
  });

  test("logout clears session", async ({ page }) => {
    await login(page);
    const url = page.url();
    expect(
      url.includes("/dashboard") || url.includes("/onboarding")
    ).toBe(true);

    // Look for user menu / avatar button in header
    const userMenu = page
      .locator(
        'button[aria-haspopup="menu"]:has(img), button[aria-haspopup="menu"]:has(span.relative), header button:has(svg.lucide-user), [data-testid="user-menu"]'
      )
      .first();

    if (await userMenu.isVisible({ timeout: 5000 }).catch(() => false)) {
      await userMenu.click();
      await page.waitForTimeout(500);

      const logoutOption = page
        .locator(
          '[role="menuitem"]:has-text("Wyloguj"), [role="menuitem"]:has-text("Log out"), [role="menuitem"]:has-text("Logout"), button:has-text("Wyloguj"), button:has-text("Log out")'
        )
        .first();

      if (
        await logoutOption.isVisible({ timeout: 2000 }).catch(() => false)
      ) {
        await logoutOption.click();
        await page.waitForTimeout(3000);
        await waitForApp(page);

        // Should be redirected to login
        expect(page.url()).toContain("/login");
      }
    }
  });
});
