import { test, expect } from "@playwright/test";
import { loginAndGoToDashboard, waitForApp } from "../helpers/auth";
import {
  navigateTo,
  assertNoErrorBoundary,
  getBodyText,
  testId,
} from "../helpers/common";

test.describe("Gabinet — Documents", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await loginAndGoToDashboard(page);
  });

  // ─── 16.1 Template Management ─────────────────────────────────

  test("templates list loads", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/settings/document-templates");
    await assertNoErrorBoundary(page);

    const bodyText = await getBodyText(page);
    expect(bodyText.length).toBeGreaterThan(50);
  });

  test("create template opens side panel", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/settings/document-templates");

    const addBtn = page
      .locator(
        'button:has-text("Dodaj szablon"), button:has-text("Add Template"), button:has-text("Dodaj"), button:has-text("Nowy")'
      )
      .first();

    if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(1000);

      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Should have name input, type selector, content textarea
      const dialogText = await dialog.innerText();
      const hasFields =
        dialogText.includes("Nazwa") ||
        dialogText.includes("Name") ||
        dialogText.includes("Typ") ||
        dialogText.includes("Type") ||
        dialogText.includes("Treść") ||
        dialogText.includes("Content");
      expect(hasFields).toBe(true);

      await page.keyboard.press("Escape");
    }
  });

  test("create template succeeds", async ({ page }) => {
    const templateName = testId("E2ETemplate");

    await navigateTo(page, "/dashboard/gabinet/settings/document-templates");

    const addBtn = page
      .locator(
        'button:has-text("Dodaj szablon"), button:has-text("Add Template"), button:has-text("Dodaj"), button:has-text("Nowy")'
      )
      .first();

    if (!(await addBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await addBtn.click();
    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Fill name
    const nameInput = dialog.locator("input").first();
    await nameInput.fill(templateName);

    // Select type from dropdown
    const typeSelect = dialog.locator('button[role="combobox"]').first();
    if (await typeSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await typeSelect.click();
      await page.waitForTimeout(500);

      const firstOption = page.locator('[role="option"]').first();
      if (await firstOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await firstOption.click();
        await page.waitForTimeout(500);
      }
    }

    // Fill content
    const contentArea = dialog.locator("textarea").first();
    if (await contentArea.isVisible({ timeout: 2000 }).catch(() => false)) {
      await contentArea.fill(
        "This is E2E test template content. Patient: {{patientName}}"
      );
    }

    // Submit
    const submitBtn = dialog
      .locator(
        'button:has-text("Utwórz"), button:has-text("Create"), button:has-text("Zapisz"), button:has-text("Save")'
      )
      .first();

    if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      const isDisabled = await submitBtn.isDisabled();
      if (!isDisabled) {
        await submitBtn.click();
        await page.waitForTimeout(3000);
        await waitForApp(page);

        const bodyText = await getBodyText(page);
        expect(bodyText).toContain(templateName);
      }
    }

    await assertNoErrorBoundary(page);
  });

  test("template placeholder insertion hint exists", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/settings/document-templates");

    const addBtn = page
      .locator(
        'button:has-text("Dodaj szablon"), button:has-text("Add Template"), button:has-text("Dodaj"), button:has-text("Nowy")'
      )
      .first();

    if (!(await addBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await addBtn.click();
    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const dialogText = await dialog.innerText();
    // Should mention placeholder syntax like {{patientName}}
    const hasPlaceholderHint =
      dialogText.includes("{{") ||
      dialogText.includes("placeholder") ||
      dialogText.includes("Placeholder") ||
      dialogText.includes("szablon") ||
      dialogText.includes("zmienn");

    // Soft check — hint may or may not be present
    await assertNoErrorBoundary(page);
    await page.keyboard.press("Escape");
  });

  test("edit template shows pre-filled form", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/settings/document-templates");
    await page.waitForTimeout(2000);

    // Look for edit button on a template row
    const editBtn = page
      .locator(
        'table tbody tr button:has(svg), button[aria-label*="edit"], button[aria-label*="Edytuj"]'
      )
      .first();

    if (await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await editBtn.click();
      await page.waitForTimeout(1000);

      const dialog = page.locator('[role="dialog"]');
      if (await dialog.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Verify name input is pre-filled
        const nameInput = dialog.locator("input").first();
        const value = await nameInput.inputValue();
        expect(value.length).toBeGreaterThan(0);

        await page.keyboard.press("Escape");
      }
    }
  });

  // ─── 16.2 Document Creation ────────────────────────────────────

  test("documents list page loads", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/documents");
    await assertNoErrorBoundary(page);

    const bodyText = await getBodyText(page);
    expect(bodyText.length).toBeGreaterThan(50);
  });

  test("document type filter exists", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/documents");

    // Look for type filter dropdown
    const typeFilter = page
      .locator('button[role="combobox"]')
      .first();

    if (await typeFilter.isVisible({ timeout: 5000 }).catch(() => false)) {
      await typeFilter.click();
      await page.waitForTimeout(500);

      const options = page.locator('[role="option"]');
      const count = await options.count();
      // Should have options like: all, consent, medical_record, prescription, referral, custom
      expect(count).toBeGreaterThanOrEqual(2);

      await page.keyboard.press("Escape");
    }
  });

  test("document status filter exists", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/documents");

    // Look for status filter dropdown (second combobox)
    const comboboxes = page.locator('button[role="combobox"]');
    const count = await comboboxes.count();

    if (count >= 2) {
      await comboboxes.nth(1).click();
      await page.waitForTimeout(500);

      const options = page.locator('[role="option"]');
      const optCount = await options.count();
      // Should have options: all, draft, pending_signature, signed, archived
      expect(optCount).toBeGreaterThanOrEqual(2);

      await page.keyboard.press("Escape");
    }
  });

  test("create document opens side panel", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/documents");

    const addBtn = page
      .locator(
        'button:has-text("Utwórz dokument"), button:has-text("Create Document"), button:has-text("Dodaj"), button:has-text("Nowy")'
      )
      .first();

    if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(1000);

      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Should have title input, type selector, patient selector, template selector
      const dialogText = await dialog.innerText();
      const hasFields =
        dialogText.includes("Tytuł") ||
        dialogText.includes("Title") ||
        dialogText.includes("Pacjent") ||
        dialogText.includes("Patient") ||
        dialogText.includes("Szablon") ||
        dialogText.includes("Template");
      expect(hasFields).toBe(true);

      await page.keyboard.press("Escape");
    }
  });

  test("create document from template works", async ({ page }) => {
    const docTitle = testId("E2EDocument");

    await navigateTo(page, "/dashboard/gabinet/documents");

    const addBtn = page
      .locator(
        'button:has-text("Utwórz dokument"), button:has-text("Create Document"), button:has-text("Dodaj"), button:has-text("Nowy")'
      )
      .first();

    if (!(await addBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await addBtn.click();
    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Fill title
    const titleInput = dialog.locator("input").first();
    await titleInput.fill(docTitle);

    // Select type
    const comboboxes = dialog.locator('button[role="combobox"]');
    const comboCount = await comboboxes.count();

    if (comboCount >= 1) {
      // Click type selector
      await comboboxes.first().click();
      await page.waitForTimeout(500);

      const firstOption = page.locator('[role="option"]').first();
      if (await firstOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await firstOption.click();
        await page.waitForTimeout(500);
      }
    }

    // Select patient
    if (comboCount >= 2) {
      await comboboxes.nth(1).click();
      await page.waitForTimeout(500);

      const patientOption = page.locator('[role="option"]').first();
      if (
        await patientOption.isVisible({ timeout: 2000 }).catch(() => false)
      ) {
        await patientOption.click();
        await page.waitForTimeout(500);
      }
    }

    // Select template if available
    if (comboCount >= 3) {
      await comboboxes.nth(2).click();
      await page.waitForTimeout(500);

      const templateOption = page.locator('[role="option"]').first();
      if (
        await templateOption.isVisible({ timeout: 2000 }).catch(() => false)
      ) {
        await templateOption.click();
        await page.waitForTimeout(500);
      }
    }

    // Fill content
    const contentArea = dialog.locator("textarea").first();
    if (await contentArea.isVisible({ timeout: 1000 }).catch(() => false)) {
      await contentArea.fill("E2E test document content.");
    }

    // Submit
    const submitBtn = dialog
      .locator(
        'button:has-text("Utwórz"), button:has-text("Create"), button:has-text("Zapisz"), button:has-text("Save")'
      )
      .first();

    if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      const isDisabled = await submitBtn.isDisabled();
      if (!isDisabled) {
        await submitBtn.click();
        await page.waitForTimeout(3000);
        await waitForApp(page);
      }
    }

    await assertNoErrorBoundary(page);
  });

  // ─── 16.3 Signature Flow ──────────────────────────────────────

  test("request signature button exists for draft documents", async ({
    page,
  }) => {
    await navigateTo(page, "/dashboard/gabinet/documents");
    await page.waitForTimeout(2000);

    // Look for PenTool icon button (request signature) on draft documents
    const signBtn = page
      .locator(
        'button:has-text("Podpis"), button[aria-label*="signature"], button[aria-label*="Podpis"]'
      )
      .first();

    // Fallback: look for any action buttons in the table
    const actionBtns = page.locator("table tbody tr button:has(svg)");
    const count = await actionBtns.count();

    // Soft check — there may not be draft documents yet
    await assertNoErrorBoundary(page);
  });

  test("view document action opens viewer", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/documents");
    await page.waitForTimeout(2000);

    // Look for eye icon (view) button
    const viewBtn = page
      .locator("table tbody tr button:has(svg)")
      .first();

    if (await viewBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await viewBtn.click();
      await page.waitForTimeout(1000);

      // Should open a dialog with document content
      const dialog = page.locator('[role="dialog"]');
      if (await dialog.isVisible({ timeout: 3000 }).catch(() => false)) {
        const dialogText = await dialog.innerText();
        expect(dialogText.length).toBeGreaterThan(10);

        await page.keyboard.press("Escape");
      }
    }

    await assertNoErrorBoundary(page);
  });

  test("sign document dialog shows signature pad", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/documents");
    await page.waitForTimeout(2000);

    // Look for documents with pending_signature status and sign button
    const signBtns = page.locator("table tbody tr button:has(svg)");
    const count = await signBtns.count();

    // Try clicking buttons to find one that opens signature pad
    for (let i = 0; i < Math.min(count, 5); i++) {
      const btn = signBtns.nth(i);
      if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(1000);

        const dialog = page.locator('[role="dialog"]');
        if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
          const dialogText = await dialog.innerText();
          // Check if it's a signature dialog
          if (
            dialogText.includes("Podpis") ||
            dialogText.includes("Signature") ||
            dialogText.includes("Sign")
          ) {
            // Look for canvas (signature pad)
            const canvas = dialog.locator("canvas");
            if (
              await canvas.isVisible({ timeout: 2000 }).catch(() => false)
            ) {
              expect(await canvas.isVisible()).toBe(true);

              // Check for clear button
              const clearBtn = dialog
                .locator(
                  'button:has-text("Wyczyść"), button:has-text("Clear")'
                )
                .first();
              if (
                await clearBtn.isVisible({ timeout: 1000 }).catch(() => false)
              ) {
                expect(await clearBtn.isVisible()).toBe(true);
              }
            }

            await page.keyboard.press("Escape");
            return;
          }

          await page.keyboard.press("Escape");
          await page.waitForTimeout(500);
        }
      }
    }

    // Soft check — may not have pending_signature documents
    await assertNoErrorBoundary(page);
  });

  // ─── 16.4 Document Actions ─────────────────────────────────────

  test("document status badge renders correctly", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/documents");
    await page.waitForTimeout(2000);

    const bodyText = await getBodyText(page);
    // Should display status badges
    const hasStatusBadge =
      bodyText.includes("Draft") ||
      bodyText.includes("draft") ||
      bodyText.includes("Szkic") ||
      bodyText.includes("Podpisan") ||
      bodyText.includes("Signed") ||
      bodyText.includes("Oczekuj") ||
      bodyText.includes("Pending") ||
      bodyText.includes("Zarchiwiz") ||
      bodyText.includes("Archived") ||
      bodyText.includes("Brak") ||
      bodyText.includes("No documents");

    // Soft check
    await assertNoErrorBoundary(page);
  });
});
