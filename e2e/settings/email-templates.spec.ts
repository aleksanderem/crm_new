import { test, expect } from "@playwright/test";
import { loginAndGoToDashboard, waitForApp } from "../helpers/auth";
import {
  navigateTo,
  assertNoErrorBoundary,
  testId,
} from "../helpers/common";

/**
 * Full CRUD E2E tests for Email Templates settings page.
 *
 * Each test is self-contained: it creates its own data, interacts, and
 * cleans up. This avoids cross-test ordering dependencies.
 *
 * Polish i18n is active by default:
 *   "Dodaj szablon"   = Add template button
 *   "Utwórz szablon"  = Create template (dialog title)
 *   "Edytuj szablon"  = Edit template (dialog title)
 *   "Utwórz"          = Create (submit button)
 *   "Zapisz"          = Save (submit button on edit)
 *   "Usuń"            = Delete (confirm button)
 *   "Anuluj"          = Cancel
 */

const TEMPLATES_PATH = "/dashboard/settings/email-templates";

// ── Helpers ────────────────────────────────────────────────────────

/** Open the create dialog and fill name + subject, returning the dialog locator. */
async function createTemplate(
  page: import("@playwright/test").Page,
  name: string,
  subject: string,
  opts?: { category?: string },
) {
  const addBtn = page
    .locator('button:has-text("Dodaj szablon"), button:has-text("Add template")')
    .first();
  await expect(addBtn).toBeVisible({ timeout: 10000 });
  await addBtn.click();

  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible({ timeout: 5000 });

  // Name (1st input)
  await dialog.locator("input").first().fill(name);
  // Category (2nd input)
  if (opts?.category) {
    await dialog.locator("input").nth(1).fill(opts.category);
  }
  // Subject (3rd input)
  await dialog.locator("input").nth(2).fill(subject);

  // Submit
  const submitBtn = dialog
    .locator('button:has-text("Utwórz"), button:has-text("Create")')
    .first();
  await expect(submitBtn).toBeEnabled({ timeout: 3000 });
  await submitBtn.click();

  await expect(dialog).not.toBeVisible({ timeout: 10000 });
  await waitForApp(page);

  // Verify it appeared
  await expect(page.locator(`text="${name}"`).first()).toBeVisible({
    timeout: 10000,
  });
}

/** Find the template card, then click the Nth icon button (0 = edit, last = delete). */
async function clickCardAction(
  page: import("@playwright/test").Page,
  templateName: string,
  position: "edit" | "delete",
) {
  const card = page
    .locator('[class*="card"]')
    .filter({ hasText: templateName })
    .first();
  await expect(card).toBeVisible({ timeout: 5000 });

  // Icon buttons inside the card (the ones with h-8 w-8 class)
  const iconBtns = card.locator('button[class*="h-8"]');
  const count = await iconBtns.count();
  if (position === "edit") {
    await iconBtns.first().click();
  } else {
    await iconBtns.nth(count - 1).click();
  }
}

/** Delete a template by name via the UI (card trash button + alert confirm). */
async function deleteTemplate(
  page: import("@playwright/test").Page,
  templateName: string,
) {
  await clickCardAction(page, templateName, "delete");

  const alertDialog = page.locator('[role="alertdialog"]');
  await expect(alertDialog).toBeVisible({ timeout: 5000 });

  const deleteBtn = alertDialog
    .locator('button:has-text("Usuń"), button:has-text("Delete")')
    .first();
  await deleteBtn.click();

  await expect(alertDialog).not.toBeVisible({ timeout: 10000 });
  await waitForApp(page);
}

// ── Tests ──────────────────────────────────────────────────────────

test.describe("Settings — Email Templates CRUD", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await loginAndGoToDashboard(page);
  });

  // ──────────────────────────────────────────────────────────────────
  // 1. CREATE a new template with all fields
  // ──────────────────────────────────────────────────────────────────

  test("1 — create a new email template with all fields", async ({ page }) => {
    await navigateTo(page, TEMPLATES_PATH);
    await assertNoErrorBoundary(page);

    const name = testId("create-tmpl");
    const subject = `Subject for ${name}`;
    const category = "E2E-Test";
    const bodyText = `Body content for ${name}`;

    // Click "Dodaj szablon"
    const addBtn = page
      .locator('button:has-text("Dodaj szablon"), button:has-text("Add template")')
      .first();
    await expect(addBtn).toBeVisible({ timeout: 10000 });
    await addBtn.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Verify dialog title
    await expect(
      dialog.locator('text="Utwórz szablon"').or(dialog.locator('text="Create template"')),
    ).toBeVisible({ timeout: 3000 });

    // Fill name
    await dialog.locator("input").first().fill(name);

    // Fill category
    await dialog.locator("input").nth(1).fill(category);

    // Fill subject
    await dialog.locator("input").nth(2).fill(subject);

    // Type into TipTap editor
    const editor = dialog
      .locator('.tiptap, .ProseMirror, [contenteditable="true"]')
      .first();
    if (await editor.isVisible({ timeout: 5000 }).catch(() => false)) {
      await editor.click();
      await page.keyboard.type(bodyText, { delay: 5 });
    }

    // Submit
    const submitBtn = dialog
      .locator('button:has-text("Utwórz"), button:has-text("Create")')
      .first();
    await expect(submitBtn).toBeEnabled({ timeout: 3000 });
    await submitBtn.click();

    await expect(dialog).not.toBeVisible({ timeout: 10000 });
    await waitForApp(page);

    // Verify the template appears in the list
    await expect(page.locator(`text="${name}"`).first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator(`text="${subject}"`).first()).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator(`text="${category}"`).first()).toBeVisible({
      timeout: 5000,
    });

    // Clean up
    await deleteTemplate(page, name);
  });

  // ──────────────────────────────────────────────────────────────────
  // 2. EDIT an existing template
  // ──────────────────────────────────────────────────────────────────

  test("2 — edit template name and subject", async ({ page }) => {
    await navigateTo(page, TEMPLATES_PATH);
    await assertNoErrorBoundary(page);

    const origName = testId("edit-tmpl");
    const origSubject = `Subject for ${origName}`;
    const editedName = `${origName} - edited`;
    const editedSubject = `${origSubject} - updated`;

    // Create a template first
    await createTemplate(page, origName, origSubject);

    // Open edit dialog
    await clickCardAction(page, origName, "edit");

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Verify dialog title says edit
    await expect(
      dialog.locator('text="Edytuj szablon"').or(dialog.locator('text="Edit template"')),
    ).toBeVisible({ timeout: 3000 });

    // Verify name is pre-filled
    const nameInput = dialog.locator("input").first();
    await expect(nameInput).toHaveValue(origName, { timeout: 3000 });

    // Change name
    await nameInput.clear();
    await nameInput.fill(editedName);

    // Verify subject is pre-filled, then change it
    const subjectInput = dialog.locator("input").nth(2);
    await expect(subjectInput).toHaveValue(origSubject, { timeout: 3000 });
    await subjectInput.clear();
    await subjectInput.fill(editedSubject);

    // Save
    const saveBtn = dialog
      .locator('button:has-text("Zapisz"), button:has-text("Save")')
      .first();
    await expect(saveBtn).toBeEnabled({ timeout: 3000 });
    await saveBtn.click();

    await expect(dialog).not.toBeVisible({ timeout: 10000 });
    await waitForApp(page);

    // Verify updated values in the list
    await expect(page.locator(`text="${editedName}"`).first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator(`text="${editedSubject}"`).first()).toBeVisible({
      timeout: 5000,
    });

    // Verify old name is gone
    await expect(page.locator(`text="${origName}"`)).not.toBeVisible({
      timeout: 3000,
    });

    // Clean up
    await deleteTemplate(page, editedName);
  });

  // ──────────────────────────────────────────────────────────────────
  // 3. VIEW template verifies editor content
  // ──────────────────────────────────────────────────────────────────

  test("3 — view template loads editor with correct content", async ({ page }) => {
    await navigateTo(page, TEMPLATES_PATH);
    await assertNoErrorBoundary(page);

    const name = testId("view-tmpl");
    const subject = `Subject for ${name}`;
    const category = "ViewTest";

    // Create template
    await createTemplate(page, name, subject, { category });

    // Open edit dialog to view content
    await clickCardAction(page, name, "edit");

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Verify name is populated
    await expect(dialog.locator("input").first()).toHaveValue(name, {
      timeout: 3000,
    });

    // Verify category is populated
    await expect(dialog.locator("input").nth(1)).toHaveValue(category, {
      timeout: 3000,
    });

    // Verify subject is populated
    await expect(dialog.locator("input").nth(2)).toHaveValue(subject, {
      timeout: 3000,
    });

    // Verify TipTap editor is visible
    const editor = dialog
      .locator('.tiptap, .ProseMirror, [contenteditable="true"]')
      .first();
    await expect(editor).toBeVisible({ timeout: 5000 });

    // Close dialog
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible({ timeout: 5000 });

    // Clean up
    await deleteTemplate(page, name);
  });

  // ──────────────────────────────────────────────────────────────────
  // 4. TOGGLE active/inactive status
  // ──────────────────────────────────────────────────────────────────

  test("4 — toggle template active/inactive status", async ({ page }) => {
    await navigateTo(page, TEMPLATES_PATH);
    await assertNoErrorBoundary(page);

    const name = testId("toggle-tmpl");
    const subject = `Subject for ${name}`;

    // Create template (defaults to active)
    await createTemplate(page, name, subject);

    const card = page
      .locator('[class*="card"]')
      .filter({ hasText: name })
      .first();
    await expect(card).toBeVisible({ timeout: 5000 });

    // Find the Switch toggle
    const toggle = card.locator('button[role="switch"]');
    await expect(toggle).toBeVisible({ timeout: 5000 });

    // Should be checked (active) initially
    const initialState = await toggle.getAttribute("data-state");
    expect(initialState).toBe("checked");

    // Toggle OFF
    await toggle.click();
    await waitForApp(page);

    // Verify inactive badge appears
    const inactiveBadge = card
      .locator('text="Nieaktywny"')
      .or(card.locator('text="Inactive"'));
    await expect(inactiveBadge).toBeVisible({ timeout: 5000 });

    // Switch should be unchecked
    await expect(toggle).toHaveAttribute("data-state", "unchecked", {
      timeout: 3000,
    });

    // Toggle back ON
    await toggle.click();
    await waitForApp(page);

    // Inactive badge should disappear
    await expect(inactiveBadge).not.toBeVisible({ timeout: 5000 });
    await expect(toggle).toHaveAttribute("data-state", "checked", {
      timeout: 3000,
    });

    // Clean up
    await deleteTemplate(page, name);
  });

  // ──────────────────────────────────────────────────────────────────
  // 5. DELETE with confirmation dialog
  // ──────────────────────────────────────────────────────────────────

  test("5 — delete template with confirmation dialog", async ({ page }) => {
    await navigateTo(page, TEMPLATES_PATH);
    await assertNoErrorBoundary(page);

    const name = testId("delete-tmpl");
    const subject = `Subject for ${name}`;

    // Create template
    await createTemplate(page, name, subject);

    // Click delete icon
    await clickCardAction(page, name, "delete");

    // Verify AlertDialog appears with confirmation text
    const alertDialog = page.locator('[role="alertdialog"]');
    await expect(alertDialog).toBeVisible({ timeout: 5000 });

    const dialogText = await alertDialog.innerText();
    expect(
      dialogText.includes("usunąć") ||
        dialogText.includes("delete") ||
        dialogText.includes("Usuń"),
    ).toBe(true);

    // Cancel first — template should remain
    const cancelBtn = alertDialog
      .locator('button:has-text("Anuluj"), button:has-text("Cancel")')
      .first();
    await cancelBtn.click();
    await expect(alertDialog).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator(`text="${name}"`).first()).toBeVisible({
      timeout: 5000,
    });

    // Now actually delete
    await clickCardAction(page, name, "delete");
    await expect(alertDialog).toBeVisible({ timeout: 5000 });

    const deleteBtn = alertDialog
      .locator('button:has-text("Usuń"), button:has-text("Delete")')
      .first();
    await deleteBtn.click();

    await expect(alertDialog).not.toBeVisible({ timeout: 10000 });
    await waitForApp(page);

    // Verify the template is removed
    await expect(page.locator(`text="${name}"`)).not.toBeVisible({
      timeout: 10000,
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // 6. Full lifecycle in a single test
  // ──────────────────────────────────────────────────────────────────

  test("6 — full lifecycle: create, edit, verify, delete", async ({ page }) => {
    await navigateTo(page, TEMPLATES_PATH);
    await assertNoErrorBoundary(page);

    const name = testId("lifecycle-tmpl");
    const subject = `Subject ${name}`;
    const editedName = `${name} v2`;
    const editedSubject = `${subject} v2`;

    // --- CREATE ---
    await createTemplate(page, name, subject);

    // --- EDIT ---
    await clickCardAction(page, name, "edit");
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const nameInput = dialog.locator("input").first();
    await nameInput.clear();
    await nameInput.fill(editedName);

    const subjectInput = dialog.locator("input").nth(2);
    await subjectInput.clear();
    await subjectInput.fill(editedSubject);

    const saveBtn = dialog
      .locator('button:has-text("Zapisz"), button:has-text("Save")')
      .first();
    await saveBtn.click();
    await expect(dialog).not.toBeVisible({ timeout: 10000 });
    await waitForApp(page);

    // Verify edit
    await expect(page.locator(`text="${editedName}"`).first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator(`text="${editedSubject}"`).first()).toBeVisible({
      timeout: 5000,
    });

    // --- DELETE ---
    await deleteTemplate(page, editedName);
    await expect(page.locator(`text="${editedName}"`)).not.toBeVisible({
      timeout: 10000,
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // 7. Submit button validation
  // ──────────────────────────────────────────────────────────────────

  test("7 — create button disabled when name or subject empty", async ({ page }) => {
    await navigateTo(page, TEMPLATES_PATH);
    await assertNoErrorBoundary(page);

    const addBtn = page
      .locator('button:has-text("Dodaj szablon"), button:has-text("Add template")')
      .first();
    await expect(addBtn).toBeVisible({ timeout: 10000 });
    await addBtn.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const submitBtn = dialog
      .locator('button:has-text("Utwórz"), button:has-text("Create")')
      .first();

    // Both empty — disabled
    await expect(submitBtn).toBeDisabled({ timeout: 3000 });

    // Name only — still disabled
    const nameInput = dialog.locator("input").first();
    await nameInput.fill("Test name");
    await expect(submitBtn).toBeDisabled({ timeout: 2000 });

    // Name + subject — enabled
    const subjectInput = dialog.locator("input").nth(2);
    await subjectInput.fill("Test subject");
    await expect(submitBtn).toBeEnabled({ timeout: 2000 });

    // Clear name — disabled again
    await nameInput.clear();
    await expect(submitBtn).toBeDisabled({ timeout: 2000 });

    await page.keyboard.press("Escape");
  });
});
