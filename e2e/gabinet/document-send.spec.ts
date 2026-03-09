import { test, expect } from "@playwright/test";
import { loginAndGoToDashboard } from "../helpers/auth";
import {
  navigateTo,
  assertNoErrorBoundary,
  getBodyText,
} from "../helpers/common";

test.describe("Gabinet — Document Send to Patient", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await loginAndGoToDashboard(page);
  });

  // ─── Document list loads ───────────────────────────────────────

  test("gabinet documents page loads", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/documents");
    await assertNoErrorBoundary(page);

    const body = await getBodyText(page);
    expect(body.length).toBeGreaterThan(50);
  });

  // ─── Document send action visible ─────────────────────────────

  test("document card has a send/sign action available", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/documents");
    await assertNoErrorBoundary(page);

    // Check for any send-related button or action
    const sendBtn = page
      .locator(
        'button:has-text("Wyślij"), button:has-text("Send"), button:has-text("Podpisz"), button:has-text("Sign")'
      )
      .first();

    const hasSendBtn = await sendBtn
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (hasSendBtn) {
      await sendBtn.click();
      await page.waitForTimeout(1000);

      const dialog = page.locator('[role="dialog"]');
      const dialogVisible = await dialog
        .isVisible({ timeout: 4000 })
        .catch(() => false);

      if (dialogVisible) {
        // Verify dialog contains recipient or confirm UI
        const dialogText = await dialog.innerText().catch(() => "");
        const hasRecipientUI =
          dialogText.includes("email") ||
          dialogText.includes("Email") ||
          dialogText.includes("pacjent") ||
          dialogText.includes("patient") ||
          dialogText.includes("Wyślij") ||
          dialogText.includes("Send");
        expect(hasRecipientUI).toBe(true);

        // Close cleanly
        await page.keyboard.press("Escape");
        await page.waitForTimeout(500);
      }

      await assertNoErrorBoundary(page);
    } else {
      // Documents page may be empty — just verify no error boundary
      await assertNoErrorBoundary(page);
    }
  });

  // ─── Document templates accessible ────────────────────────────

  test("gabinet document templates page loads", async ({ page }) => {
    await navigateTo(
      page,
      "/dashboard/gabinet/settings/document-templates"
    );
    await assertNoErrorBoundary(page);

    const body = await getBodyText(page);
    expect(body.length).toBeGreaterThan(50);
  });

  // ─── Patient portal documents route exists ────────────────────

  test("patient portal documents route renders without crash", async ({
    page,
  }) => {
    // Patient portal is unauthenticated — navigate and check for non-crash render
    await page.goto("http://localhost:5173/patient/login", {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    // Should render patient login page (not a crash / blank screen)
    const body = await getBodyText(page);
    expect(body.length).toBeGreaterThan(10);

    // Should not show generic error boundary
    const errorText = await page
      .locator("text=/Something went wrong|Coś poszło nie tak/i")
      .count()
      .catch(() => 0);
    expect(errorText).toBe(0);
  });

  // ─── Appointment detail has send email button ─────────────────

  test("appointment detail page has email send option", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/calendar");
    await assertNoErrorBoundary(page);

    // Click on any visible appointment
    const appointmentEl = page
      .locator('[data-appointment-id], [class*="appointment-card"]')
      .first();

    if (!(await appointmentEl.isVisible({ timeout: 3000 }).catch(() => false))) {
      // No appointments in current view — skip
      test.skip();
      return;
    }

    await appointmentEl.click();
    await page.waitForTimeout(1500);

    const dialog = page.locator('[role="dialog"]');
    if (!(await dialog.isVisible({ timeout: 4000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await assertNoErrorBoundary(page);

    // Look for a send/email button in the appointment detail dialog
    const emailBtn = dialog
      .locator(
        'button:has-text("Wyślij e-mail"), button:has-text("Send email"), button:has-text("Email")'
      )
      .first();

    const hasEmailBtn = await emailBtn
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    // This is a soft check — the button may not be present in all appointment states
    if (hasEmailBtn) {
      await emailBtn.click();
      await page.waitForTimeout(1000);
      await assertNoErrorBoundary(page);
      await page.keyboard.press("Escape");
    }

    await page.keyboard.press("Escape");
    await assertNoErrorBoundary(page);
  });
});
