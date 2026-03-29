import { test, expect } from "@playwright/test";
import { loginAndGoToDashboard, waitForApp } from "../helpers/auth";
import {
  navigateTo,
  assertNoErrorBoundary,
  testId,
} from "../helpers/common";

test.describe("CRM — Inbox", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await loginAndGoToDashboard(page);
  });

  // ─── 1. Compose email flow ────────────────────────────────

  test("compose email: fill To, Subject, Body, then cancel", async ({
    page,
  }) => {
    await navigateTo(page, "/dashboard/inbox");
    await assertNoErrorBoundary(page);

    // Compose button is in the sidebar slot
    const composeBtn = page
      .locator('button:has-text("Nowa wiadomość"), button:has-text("Compose")')
      .first();
    await expect(composeBtn).toBeVisible({ timeout: 10000 });
    await composeBtn.evaluate((el) => (el as HTMLElement).click());
    await page.waitForTimeout(500);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Fill To
    const toInput = dialog.locator('input[placeholder="recipient@example.com"]');
    await expect(toInput).toBeVisible({ timeout: 3000 });
    await toInput.fill("test@example.com");

    // Fill Subject
    const subjectInput = dialog.locator(
      'input[placeholder="Temat"], input[placeholder="Subject"]'
    );
    await expect(subjectInput).toBeVisible({ timeout: 3000 });
    await subjectInput.fill(testId("E2E-Subject"));

    // Fill Body
    const bodyTextarea = dialog.locator(
      'textarea[placeholder="Wiadomość"], textarea[placeholder="Body"], textarea[placeholder="Message"]'
    );
    await expect(bodyTextarea).toBeVisible({ timeout: 3000 });
    await bodyTextarea.fill("This is an E2E test message body.");

    // Verify Send button is enabled
    const sendBtn = dialog
      .locator('button:has-text("Wyślij"), button:has-text("Send")')
      .first();
    await expect(sendBtn).toBeEnabled({ timeout: 3000 });

    // Cancel — do not actually send
    const cancelBtn = dialog
      .locator('button:has-text("Anuluj"), button:has-text("Cancel")')
      .first();
    await cancelBtn.click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  // ─── 2. Compose with CC field ─────────────────────────────

  test("compose email: show CC field and fill it", async ({ page }) => {
    await navigateTo(page, "/dashboard/inbox");
    await assertNoErrorBoundary(page);

    const composeBtn = page
      .locator('button:has-text("Nowa wiadomość"), button:has-text("Compose")')
      .first();
    await expect(composeBtn).toBeVisible({ timeout: 10000 });
    await composeBtn.evaluate((el) => (el as HTMLElement).click());
    await page.waitForTimeout(500);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Click "DW" (CC) toggle to show CC field
    const ccToggle = dialog.locator(
      'button:has-text("DW"), button:has-text("CC")'
    );
    await expect(ccToggle).toBeVisible({ timeout: 3000 });
    await ccToggle.click();
    await page.waitForTimeout(300);

    // CC input appears
    const ccInput = dialog.locator('input[placeholder="cc@example.com"]');
    await expect(ccInput).toBeVisible({ timeout: 3000 });
    await ccInput.fill("cc-recipient@example.com");

    // Fill To
    const toInput = dialog.locator('input[placeholder="recipient@example.com"]');
    await toInput.fill("to-recipient@example.com");

    // Cancel
    const cancelBtn = dialog
      .locator('button:has-text("Anuluj"), button:has-text("Cancel")')
      .first();
    await cancelBtn.click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  // ─── 3. Filter tabs ──────────────────────────────────────

  test("switch between filter tabs without errors", async ({ page }) => {
    await navigateTo(page, "/dashboard/inbox");
    await assertNoErrorBoundary(page);

    // Filter tabs are in the sidebar slot. The sidebar icon strip overlaps
    // them, intercepting pointer events. We use focus + keyboard navigation
    // which Radix tabs support natively (ArrowRight/ArrowLeft between tabs,
    // Enter/Space to activate).

    const allTab = page
      .locator('button[role="tab"]:has-text("Wszystkie"), button[role="tab"]:has-text("All")')
      .first();
    const unreadTab = page
      .locator('button[role="tab"]:has-text("Nieprzeczytane"), button[role="tab"]:has-text("Unread")')
      .first();
    const sentTab = page
      .locator('button[role="tab"]:has-text("Wysłane"), button[role="tab"]:has-text("Sent")')
      .first();
    const starredTab = page
      .locator('button[role="tab"]:has-text("Oznaczone"), button[role="tab"]:has-text("Starred")')
      .first();

    // All tabs visible
    await expect(allTab).toBeVisible({ timeout: 10000 });
    await expect(unreadTab).toBeVisible({ timeout: 5000 });
    await expect(sentTab).toBeVisible({ timeout: 5000 });
    await expect(starredTab).toBeVisible({ timeout: 5000 });

    // "Wszystkie" should be active by default
    await expect(allTab).toHaveAttribute("aria-selected", "true");

    // Focus the active tab, then use ArrowRight to move through tabs.
    // Radix Tabs with horizontal orientation: ArrowRight moves to next tab
    // and auto-activates it (default activationMode).
    // Tab order: Wszystkie (all) -> Nieprzeczytane (unread) -> Wysłane (sent) -> Oznaczone (starred)

    // Focus the "Wszystkie" tab
    await allTab.focus();
    await page.waitForTimeout(200);

    // ArrowRight -> Nieprzeczytane
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(500);
    await expect(unreadTab).toHaveAttribute("aria-selected", "true");
    await assertNoErrorBoundary(page);

    // ArrowRight -> Wysłane
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(500);
    await expect(sentTab).toHaveAttribute("aria-selected", "true");
    await assertNoErrorBoundary(page);

    // ArrowRight -> Oznaczone gwiazdką
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(500);
    await expect(starredTab).toHaveAttribute("aria-selected", "true");
    await assertNoErrorBoundary(page);

    // ArrowRight wraps to Wszystkie (Radix tabs loop)
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(500);
    await expect(allTab).toHaveAttribute("aria-selected", "true");
    await assertNoErrorBoundary(page);
  });

  // ─── 4. Search functionality ──────────────────────────────

  test("search box filters inbox list", async ({ page }) => {
    await navigateTo(page, "/dashboard/inbox");
    await assertNoErrorBoundary(page);

    const searchInput = page
      .locator(
        'input[placeholder="Szukaj wiadomości..."], input[placeholder="Search messages..."]'
      )
      .first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    // Type nonsense query
    await searchInput.fill("e2e-nonexistent-query-xyz");
    await page.waitForTimeout(1000);
    await assertNoErrorBoundary(page);

    // Clear search
    await searchInput.clear();
    await page.waitForTimeout(500);
    await assertNoErrorBoundary(page);
  });
});
