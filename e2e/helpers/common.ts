import { Page, expect } from "@playwright/test";
import { waitForApp } from "./auth";

/**
 * Navigate to a dashboard route and wait for it to load.
 */
export async function navigateTo(page: Page, path: string) {
  await page.goto(`http://localhost:5173${path}`, {
    waitUntil: "domcontentloaded",
    timeout: 10000,
  });
  await waitForApp(page);
}

/**
 * Open the SidePanel by clicking a create/add button in the main content area.
 * Returns true if the dialog opened.
 */
export async function openCreatePanel(
  page: Page,
  buttonTexts: string[]
): Promise<boolean> {
  for (const text of buttonTexts) {
    const btn = page.locator(`main button:has-text("${text}")`).first();
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(1000);
      const dialog = page.locator('[role="dialog"]');
      if (await dialog.isVisible({ timeout: 3000 }).catch(() => false)) {
        return true;
      }
    }
  }

  // Fallback: try any button with those texts (e.g. empty state)
  for (const text of buttonTexts) {
    const btn = page.locator(`button:has-text("${text}")`).last();
    if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(1000);
      const dialog = page.locator('[role="dialog"]');
      if (await dialog.isVisible({ timeout: 3000 }).catch(() => false)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Submit a form inside a [role="dialog"] and wait for it to close.
 */
export async function submitDialogForm(
  page: Page,
  submitTexts = ["Utwórz", "Create", "Zapisz", "Save"]
): Promise<boolean> {
  const dialog = page.locator('[role="dialog"]');
  for (const text of submitTexts) {
    const btn = dialog.locator(`button:has-text("${text}")`).first();
    if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(2000);
      await waitForApp(page);
      return true;
    }
  }
  return false;
}

/**
 * Close any open dialog via Escape key.
 */
export async function closeDialog(page: Page) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
}

/**
 * Check that a page loaded without error boundaries.
 */
export async function assertNoErrorBoundary(page: Page) {
  const errorBoundary = await page
    .locator("text=/Something went wrong|Coś poszło nie tak/i")
    .count()
    .catch(() => 0);
  expect(errorBoundary, "Error boundary should not be visible").toBe(0);
}

/**
 * Get all body text content for assertions.
 */
export async function getBodyText(page: Page): Promise<string> {
  return page.locator("body").innerText().catch(() => "");
}

/**
 * Generate a unique test identifier for entity names.
 */
export function testId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}
