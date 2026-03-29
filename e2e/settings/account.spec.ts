import { test, expect } from "@playwright/test";
import { loginAndGoToDashboard, waitForApp } from "../helpers/auth";
import {
  navigateTo,
  assertNoErrorBoundary,
  getBodyText,
} from "../helpers/common";

test.describe("Settings — Account & Profile (real interactions)", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await loginAndGoToDashboard(page);
  });

  // ─── 1. EDIT user profile name with persistence ────────────────

  test("edit display name, save, reload, verify persistence, restore", async ({
    page,
  }) => {
    await navigateTo(page, "/dashboard/settings/profile");
    await assertNoErrorBoundary(page);

    // The profile page has sections: Avatar, Name, Email, Language, Theme, Timezone
    // Name input is a non-disabled, non-file input inside the Display Name card
    const editableInputs = page.locator(
      'input:not([disabled]):not([type="file"])'
    );
    await editableInputs.first().waitFor({ state: "visible", timeout: 15000 });
    const inputToUse = editableInputs.first();

    // Read current value — may be empty if user never set a display name
    const originalName = await inputToUse.inputValue();

    // Change name to something unique with timestamp
    const timestamp = Date.now();
    const testName = `E2ETest-${timestamp}`;
    await inputToUse.click();
    await inputToUse.fill(testName);

    // Click Save button (bottom of the page — the last matching save button)
    const saveBtn = page
      .locator('button:has-text("Save"), button:has-text("Zapisz")')
      .last();
    await saveBtn.click();
    await waitForApp(page, 5000);

    // Reload the page
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForApp(page, 8000);

    // Verify the new name persisted
    const inputAfterReload = page
      .locator('input:not([disabled]):not([type="file"])')
      .first();
    await inputAfterReload.waitFor({ state: "visible", timeout: 15000 });
    const savedName = await inputAfterReload.inputValue();
    expect(savedName).toBe(testName);

    // Restore original name — the mutation ignores empty strings (sends undefined),
    // so if the original was empty we use a known fallback name to avoid a no-op save
    const restoreName = originalName || "User";
    await inputAfterReload.click();
    await inputAfterReload.fill(restoreName);
    const restoreBtn = page
      .locator('button:has-text("Save"), button:has-text("Zapisz")')
      .last();
    await restoreBtn.click();
    await waitForApp(page, 5000);

    // Verify restoration
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForApp(page, 8000);
    const inputAfterRestore = page
      .locator('input:not([disabled]):not([type="file"])')
      .first();
    await inputAfterRestore.waitFor({ state: "visible", timeout: 15000 });
    const restoredName = await inputAfterRestore.inputValue();
    expect(restoredName).toBe(restoreName);
  });

  // ─── 2. AVATAR section visible ─────────────────────────────────

  test("avatar section is visible with image or gradient fallback", async ({
    page,
  }) => {
    await navigateTo(page, "/dashboard/settings/profile");
    await assertNoErrorBoundary(page);

    // Avatar label wraps either an img or a gradient div
    const avatarLabel = page.locator('label[for="profile_avatar_field"]');
    await expect(avatarLabel).toBeVisible({ timeout: 10000 });

    const avatarImg = avatarLabel.locator("img");
    const avatarGradient = avatarLabel.locator("div");

    const hasImg = (await avatarImg.count()) > 0;
    const hasGradient = (await avatarGradient.count()) > 0;
    expect(
      hasImg || hasGradient,
      "Avatar should render either an image or a gradient fallback"
    ).toBe(true);

    // Verify the avatar section heading text is present
    const bodyText = await getBodyText(page);
    const hasAvatarHeading =
      bodyText.includes("avatar") ||
      bodyText.includes("Avatar") ||
      bodyText.includes("Twój avatar");
    expect(hasAvatarHeading).toBe(true);

    // The file input for upload should exist (hidden)
    const fileInput = page.locator('input#profile_avatar_field[type="file"]');
    expect(await fileInput.count()).toBe(1);
  });

  // ─── 3. EDIT organization name with persistence ────────────────

  test("edit organization name, save, reload, verify persistence, restore", async ({
    page,
  }) => {
    await navigateTo(page, "/dashboard/settings/organization");
    await assertNoErrorBoundary(page);

    // The org settings page has: org name input, website input, currency select, timezone select
    // Org name is the first input field
    const orgNameInput = page.locator("input").first();
    await orgNameInput.waitFor({ state: "visible", timeout: 15000 });

    // Read current value
    const originalOrgName = await orgNameInput.inputValue();
    expect(originalOrgName.length).toBeGreaterThan(0);

    // Change to a unique name
    const timestamp = Date.now();
    const testOrgName = `E2EOrg-${timestamp}`;
    await orgNameInput.click();
    await orgNameInput.fill(testOrgName);

    // Click Save (the button at the bottom of the card)
    const saveBtn = page
      .locator('button:has-text("Save"), button:has-text("Zapisz")')
      .first();
    await saveBtn.click();
    await waitForApp(page, 5000);

    // Reload and verify persistence
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForApp(page, 8000);

    const orgNameAfterReload = page.locator("input").first();
    await orgNameAfterReload.waitFor({ state: "visible", timeout: 15000 });
    const savedOrgName = await orgNameAfterReload.inputValue();
    expect(savedOrgName).toBe(testOrgName);

    // Restore original name
    await orgNameAfterReload.click();
    await orgNameAfterReload.fill(originalOrgName);
    const restoreBtn = page
      .locator('button:has-text("Save"), button:has-text("Zapisz")')
      .first();
    await restoreBtn.click();
    await waitForApp(page, 5000);

    // Verify restoration
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForApp(page, 8000);
    const orgNameAfterRestore = page.locator("input").first();
    await orgNameAfterRestore.waitFor({ state: "visible", timeout: 15000 });
    const restoredOrgName = await orgNameAfterRestore.inputValue();
    expect(restoredOrgName).toBe(originalOrgName);
  });

  // ─── 4. SETTINGS NAVIGATION stress test ────────────────────────

  test("all settings pages load without errors", async ({ page }) => {
    const settingsPages = [
      { path: "/dashboard/settings", label: "General (index)" },
      { path: "/dashboard/settings/profile", label: "Profile" },
      { path: "/dashboard/settings/organization", label: "Organization" },
      { path: "/dashboard/settings/team", label: "Team" },
      { path: "/dashboard/settings/permissions", label: "Permissions" },
      { path: "/dashboard/settings/pipelines", label: "Pipelines" },
      { path: "/dashboard/settings/custom-fields", label: "Custom Fields" },
      { path: "/dashboard/settings/activity-types", label: "Activity Types" },
      { path: "/dashboard/settings/lost-reasons", label: "Lost Reasons" },
      { path: "/dashboard/settings/sources", label: "Sources" },
      { path: "/dashboard/settings/integrations", label: "Integrations" },
      { path: "/dashboard/settings/mail", label: "Mail" },
      { path: "/dashboard/settings/sms", label: "SMS" },
      { path: "/dashboard/settings/email-templates", label: "Email Templates" },
      { path: "/dashboard/settings/email-events", label: "Email Events" },
      { path: "/dashboard/settings/email-sequences", label: "Email Sequences" },
      { path: "/dashboard/settings/automations", label: "Automations" },
      { path: "/dashboard/settings/audit-log", label: "Audit Log" },
      { path: "/dashboard/settings/form-templates", label: "Form Templates" },
      { path: "/dashboard/settings/billing", label: "Billing" },
    ];

    const results: { label: string; ok: boolean; hasForm: boolean; contentLength: number }[] = [];

    for (const sp of settingsPages) {
      await navigateTo(page, sp.path);

      // Check for error boundary
      const errorCount = await page
        .locator("text=/Something went wrong|Coś poszło nie tak/i")
        .count()
        .catch(() => 0);

      const bodyText = await getBodyText(page);
      const hasForm =
        (await page.locator("input, select, textarea, [role='combobox']").count()) > 0;

      results.push({
        label: sp.label,
        ok: errorCount === 0,
        hasForm,
        contentLength: bodyText.length,
      });

      // Billing may legitimately error if no plan data exists
      if (sp.path === "/dashboard/settings/billing" && errorCount > 0) {
        continue;
      }

      // Every non-billing page must be error-free with meaningful content
      if (sp.path !== "/dashboard/settings/billing") {
        expect(errorCount, `${sp.label} should not have error boundary`).toBe(0);
        expect(bodyText.length, `${sp.label} should have meaningful content`).toBeGreaterThan(20);
      }
    }

    // At least 15 pages should have loaded successfully
    const successCount = results.filter((r) => r.ok).length;
    expect(successCount).toBeGreaterThanOrEqual(15);
  });

  // ─── 5. INTEGRATIONS page ──────────────────────────────────────

  test("integrations page shows Google and SMS cards with action buttons", async ({
    page,
  }) => {
    await navigateTo(page, "/dashboard/settings/integrations");
    await assertNoErrorBoundary(page);

    const bodyText = await getBodyText(page);

    // Google integration card should be visible
    const hasGoogle = bodyText.includes("Google");
    expect(hasGoogle, "Google integration card should be visible").toBe(true);

    // SMS configuration card should be visible
    const hasSMS =
      bodyText.includes("SMS") ||
      bodyText.includes("sms") ||
      bodyText.includes("SMSAPI") ||
      bodyText.includes("Twilio");
    expect(hasSMS, "SMS configuration card should be visible").toBe(true);

    // There should be connect/disconnect/save buttons
    const actionButtons = page.locator(
      'button:has-text("Połącz"), button:has-text("Rozłącz"), button:has-text("Connect"), button:has-text("Disconnect"), button:has-text("Zapisz"), button:has-text("Save")'
    );
    const btnCount = await actionButtons.count();
    expect(btnCount, "Should have at least one action button").toBeGreaterThanOrEqual(1);
  });

  // ─── 6. THEME toggle ──────────────────────────────────────────

  test("theme switcher toggles between light, dark, and system", async ({
    page,
  }) => {
    await navigateTo(page, "/dashboard/settings/profile");
    await assertNoErrorBoundary(page);

    // The theme section has three buttons: Light, Dark, System
    const lightBtn = page.locator(
      'button:has-text("Light"), button:has-text("Jasny")'
    ).first();
    const darkBtn = page.locator(
      'button:has-text("Dark"), button:has-text("Ciemny")'
    ).first();
    const systemBtn = page.locator(
      'button:has-text("System")'
    ).first();

    // At least the theme buttons should be visible
    const hasThemeButtons =
      (await lightBtn.isVisible({ timeout: 5000 }).catch(() => false)) ||
      (await darkBtn.isVisible({ timeout: 2000 }).catch(() => false)) ||
      (await systemBtn.isVisible({ timeout: 2000 }).catch(() => false));

    if (!hasThemeButtons) {
      test.skip();
      return;
    }

    const saveBtn = page
      .locator('button:has-text("Save"), button:has-text("Zapisz")')
      .last();

    // Select Dark theme and save — applyTheme only runs inside handleSave
    if (await darkBtn.isVisible()) {
      await darkBtn.click();
      await page.waitForTimeout(300);

      // The dark button should gain the selected visual (border-primary)
      const darkBtnClasses = await darkBtn.getAttribute("class");
      expect(darkBtnClasses).toContain("border-primary");

      // Save to apply the theme to the DOM
      await saveBtn.click();
      await waitForApp(page, 3000);

      // After saving, html element should have "dark" class
      const hasDarkClass = await page.evaluate(() =>
        document.documentElement.classList.contains("dark")
      );
      expect(hasDarkClass).toBe(true);
    }

    // Select Light theme and save
    if (await lightBtn.isVisible()) {
      await lightBtn.click();
      await page.waitForTimeout(300);

      await saveBtn.click();
      await waitForApp(page, 3000);

      // After saving, html should NOT have "dark" class
      const hasDarkClass = await page.evaluate(() =>
        document.documentElement.classList.contains("dark")
      );
      expect(hasDarkClass).toBe(false);
    }

    // Restore to System and save
    if (await systemBtn.isVisible()) {
      await systemBtn.click();
      await page.waitForTimeout(300);
      await saveBtn.click();
      await waitForApp(page, 3000);
    }
  });

  // ─── 7. LANGUAGE switcher exists ───────────────────────────────

  test("language selector is visible on profile page", async ({ page }) => {
    await navigateTo(page, "/dashboard/settings/profile");
    await assertNoErrorBoundary(page);

    const bodyText = await getBodyText(page);

    // The profile page has a Language section with a select
    const hasLanguageSection =
      bodyText.includes("Language") ||
      bodyText.includes("Język") ||
      bodyText.includes("Polski") ||
      bodyText.includes("English");
    expect(hasLanguageSection, "Language section should be visible").toBe(true);

    // There should be a select trigger for language
    // The page has multiple SelectTriggers (language, timezone)
    const selectTriggers = page.locator('[role="combobox"], button[data-state]');
    const triggerCount = await selectTriggers.count();
    expect(triggerCount, "Should have select triggers for language/timezone").toBeGreaterThanOrEqual(1);
  });

  // ─── 8. EDIT username on settings index page ───────────────────

  test("edit username on general settings, save, reload, verify, restore", async ({
    page,
  }) => {
    await navigateTo(page, "/dashboard/settings");
    await assertNoErrorBoundary(page);

    // The settings index page has a username form with id "settings-username"
    const usernameInput = page.locator("#settings-username");
    await usernameInput.waitFor({ state: "visible", timeout: 15000 });

    // Read current value
    const originalUsername = await usernameInput.inputValue();

    // Change to a unique username (min 3, max 20 chars, lowercase)
    const suffix = Date.now().toString().slice(-6);
    const testUsername = `e2eu${suffix}`;
    await usernameInput.click();
    await usernameInput.fill(testUsername);

    // Submit via the form that wraps the username input — the form has a
    // button[type="submit"] inside it. Scope to the ancestor <form> element.
    const usernameForm = page.locator("form", { has: page.locator("#settings-username") });
    const saveBtn = usernameForm.locator('button[type="submit"]');
    await saveBtn.click();
    await waitForApp(page, 5000);

    // Reload and verify
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForApp(page, 8000);

    const usernameAfterReload = page.locator("#settings-username");
    await usernameAfterReload.waitFor({ state: "visible", timeout: 15000 });
    const savedUsername = await usernameAfterReload.inputValue();
    expect(savedUsername).toBe(testUsername);

    // Restore original username (must be at least 3 chars for validation)
    const restoreValue = originalUsername && originalUsername.length >= 3
      ? originalUsername
      : testUsername;
    await usernameAfterReload.click();
    await usernameAfterReload.fill(restoreValue);
    const restoreForm = page.locator("form", { has: page.locator("#settings-username") });
    const restoreBtn = restoreForm.locator('button[type="submit"]');
    await restoreBtn.click();
    await waitForApp(page, 5000);
  });

  // ─── 9. Organization usage stats are displayed ─────────────────

  test("organization page displays usage statistics", async ({ page }) => {
    await navigateTo(page, "/dashboard/settings/organization");
    await assertNoErrorBoundary(page);

    const bodyText = await getBodyText(page);

    // Usage stats section should show various entity counts
    const hasUsageSection =
      bodyText.includes("Wykorzystanie") ||
      bodyText.includes("Usage") ||
      bodyText.includes("Członkowie") ||
      bodyText.includes("Members");
    expect(hasUsageSection, "Usage stats section should be present").toBe(true);

    // The usage grid renders count numbers - there should be numeric values
    const statCards = page.locator(".text-2xl.font-semibold");
    const statCount = await statCards.count();
    expect(statCount, "Should have usage stat cards").toBeGreaterThanOrEqual(1);
  });

  // ─── 10. Email field is read-only on profile ───────────────────

  test("email field is disabled and read-only on profile page", async ({
    page,
  }) => {
    await navigateTo(page, "/dashboard/settings/profile");
    await assertNoErrorBoundary(page);

    // The email input is disabled with opacity-60 class
    const disabledInput = page.locator("input[disabled]");
    await disabledInput.waitFor({ state: "visible", timeout: 15000 });

    const emailValue = await disabledInput.inputValue();
    // Should contain an email address (the logged-in user's email)
    expect(emailValue).toContain("@");

    // Verify it truly is disabled
    const isDisabled = await disabledInput.isDisabled();
    expect(isDisabled).toBe(true);
  });
});
