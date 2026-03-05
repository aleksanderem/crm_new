import { test, expect, Page } from "@playwright/test";

/**
 * Ralph Gate — Blast-radius E2E validation
 *
 * Single test that logs in once, then validates all pages render without
 * error boundaries or critical console errors. Serves as the quality gate
 * for Ralph loop iterations.
 *
 * Fails hard if any page is broken → blocks the loop from proceeding.
 */

const BASE = "http://localhost:5173";
const CREDS = { email: "amiesak@gmail.com", password: "ABcdefg123!@#" };

async function waitForApp(page: Page, timeout = 8000) {
  await page.waitForLoadState("networkidle", { timeout }).catch(() => {});
  await page.waitForTimeout(500);
}

test.describe("Ralph Gate", () => {
  test.setTimeout(120_000);

  test("Blast-radius validation: login + all pages healthy", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(`PAGE_ERROR: ${err.message}`));

    // ── Login ──────────────────────────────────────────────────
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 15000 });

    const passwordBtn = page.locator(
      'button:has-text("Email i hasło"), button:has-text("Email"), button:has-text("Password")'
    ).first();
    if (await passwordBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await passwordBtn.click();
      await page.waitForTimeout(500);
    }

    await page.fill('input[type="email"], input[name="email"]', CREDS.email);
    await page.fill('input[type="password"], input[name="password"]', CREDS.password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    await waitForApp(page);

    const postLoginUrl = page.url();
    expect(postLoginUrl, "Login failed — not on dashboard").toMatch(/dashboard|onboarding/);

    // ── CRM Core Pages ────────────────────────────────────────
    const crmPages = [
      { path: "/dashboard", name: "Dashboard" },
      { path: "/dashboard/contacts", name: "Contacts" },
      { path: "/dashboard/companies", name: "Companies" },
      { path: "/dashboard/leads", name: "Leads" },
      { path: "/dashboard/activities", name: "Activities" },
      { path: "/dashboard/documents", name: "Documents" },
      { path: "/dashboard/calendar", name: "Calendar" },
    ];

    const failures: string[] = [];

    for (const { path, name } of crmPages) {
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 10000 });
      await waitForApp(page);

      const errorBoundary = await page
        .locator("text=/Something went wrong|Coś poszło nie tak/i")
        .count()
        .catch(() => 0);
      if (errorBoundary > 0) failures.push(`${name}: error boundary`);

      const bodyText = await page.locator("body").innerText().catch(() => "");
      if (bodyText.length < 50) failures.push(`${name}: blank page`);
    }

    // ── Gabinet Pages (skip if routes not present) ────────────
    const gabinetPages = [
      { path: "/dashboard/gabinet/patients", name: "Gabinet Patients" },
      { path: "/dashboard/gabinet/treatments", name: "Gabinet Treatments" },
    ];

    for (const { path, name } of gabinetPages) {
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 10000 }).catch(() => null);
      await waitForApp(page);

      const currentUrl = page.url();
      if (!currentUrl.includes("/gabinet/")) continue; // route doesn't exist yet

      const errorBoundary = await page
        .locator("text=/Something went wrong|Coś poszło nie tak/i")
        .count()
        .catch(() => 0);
      if (errorBoundary > 0) failures.push(`${name}: error boundary`);

      const bodyText = await page.locator("body").innerText().catch(() => "");
      if (bodyText.length < 50) failures.push(`${name}: blank page`);
    }

    // ── Quick-Create Modal ────────────────────────────────────
    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
    await waitForApp(page);

    const qcTrigger = page.locator('[data-testid="quick-create-trigger"]');
    if (await qcTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
      await qcTrigger.click();
      await page.waitForTimeout(1000);

      const dialog = page.locator('[role="dialog"]');
      const dialogVisible = await dialog.isVisible({ timeout: 3000 }).catch(() => false);
      if (!dialogVisible) failures.push("QuickCreate: dialog did not open");

      if (dialogVisible) {
        // Verify CRM tab has entities
        const dialogText = await dialog.innerText().catch(() => "");
        if (!["Kontakt", "Firma", "Transakcj", "Contact", "Company", "Deal"].some(e => dialogText.includes(e))) {
          failures.push("QuickCreate: CRM tab entities missing");
        }

        // Verify Gabinet tab
        const gabinetTab = dialog.locator('button:has-text("Gabinet")').first();
        if (await gabinetTab.isVisible({ timeout: 2000 }).catch(() => false)) {
          await gabinetTab.click();
          await page.waitForTimeout(500);
          const gText = await dialog.innerText().catch(() => "");
          if (!["Pacjent", "Wizyt", "Zabieg", "Patient", "Appointment", "Treatment"].some(e => gText.includes(e))) {
            failures.push("QuickCreate: Gabinet tab entities missing");
          }
        }

        // Verify System tab
        const systemTab = dialog.locator('button:has-text("System")').first();
        if (await systemTab.isVisible({ timeout: 2000 }).catch(() => false)) {
          await systemTab.click();
          await page.waitForTimeout(500);
          const sText = await dialog.innerText().catch(() => "");
          if (!["Użytkowni", "User", "Zaproś"].some(e => sText.includes(e))) {
            failures.push("QuickCreate: System tab entities missing");
          }
        }

        // Test Product form renders
        const crmTab = dialog.locator('button:has-text("CRM")').first();
        if (await crmTab.isVisible().catch(() => false)) {
          await crmTab.click();
          await page.waitForTimeout(500);
        }
        const productBtn = dialog.locator('button:has-text("Produkt"), button:has-text("Product")').first();
        if (await productBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await productBtn.click();
          await page.waitForTimeout(1000);
          const form = dialog.locator('form');
          if (!(await form.isVisible({ timeout: 3000 }).catch(() => false))) {
            failures.push("QuickCreate: Product form did not render");
          } else {
            // Submit the product form
            const nameInput = form.locator('input').first();
            await nameInput.fill(`E2E-Product-${Date.now()}`);
            const skuInput = form.locator('input').nth(1);
            if (await skuInput.isVisible().catch(() => false)) {
              await skuInput.fill(`SKU-${Date.now()}`);
            }
            const submitBtn = dialog.locator('button[type="submit"]').first();
            if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
              await submitBtn.click();
              await page.waitForTimeout(3000);
              const stillOpen = await dialog.isVisible({ timeout: 1000 }).catch(() => false);
              if (stillOpen) {
                failures.push("QuickCreate: Product form submit did not close dialog");
              }
            }
          }
        }

        // Test Call form
        if (await qcTrigger.isVisible({ timeout: 2000 }).catch(() => false)) {
          await qcTrigger.click();
          await page.waitForTimeout(1000);
          const callBtn = dialog.locator('button:has-text("Połączeni"), button:has-text("Call")').first();
          if (await callBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await callBtn.click();
            await page.waitForTimeout(1000);
            const callForm = dialog.locator('form');
            if (!(await callForm.isVisible({ timeout: 3000 }).catch(() => false))) {
              failures.push("QuickCreate: Call form did not render");
            } else {
              const submitBtn = dialog.locator('button[type="submit"]').first();
              if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                await submitBtn.click();
                await page.waitForTimeout(3000);
                const stillOpen = await dialog.isVisible({ timeout: 1000 }).catch(() => false);
                if (stillOpen) {
                  failures.push("QuickCreate: Call form submit did not close dialog");
                }
              }
            }
          }
        }

        // Test Document form
        if (await qcTrigger.isVisible({ timeout: 2000 }).catch(() => false)) {
          await qcTrigger.click();
          await page.waitForTimeout(1000);
          const docBtn = dialog.locator('button:has-text("Dokument"), button:has-text("Document")').first();
          if (await docBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await docBtn.click();
            await page.waitForTimeout(1000);
            const docForm = dialog.locator('form');
            if (!(await docForm.isVisible({ timeout: 3000 }).catch(() => false))) {
              failures.push("QuickCreate: Document form did not render");
            } else {
              const nameInput = docForm.locator('input').first();
              await nameInput.fill(`E2E-Doc-${Date.now()}`);
              const submitBtn = dialog.locator('button[type="submit"]').first();
              if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                await submitBtn.click();
                await page.waitForTimeout(3000);
                const stillOpen = await dialog.isVisible({ timeout: 1000 }).catch(() => false);
                if (stillOpen) {
                  failures.push("QuickCreate: Document form submit did not close dialog");
                }
              }
            }
          }
        }
      }
    } else {
      failures.push("QuickCreate: trigger button not found");
    }

    // ── Console Errors Check ──────────────────────────────────
    const critical = consoleErrors.filter(
      (e) =>
        (e.includes("PAGE_ERROR") || e.includes("Uncaught") || e.includes("TypeError")) &&
        !e.includes("DevTools") &&
        !e.includes("favicon") &&
        !e.includes("Failed to fetch") &&
        !e.includes("net::ERR") &&
        !e.includes("ResizeObserver")
    );
    if (critical.length > 0) {
      failures.push(`Console errors (${critical.length}): ${critical.slice(0, 3).join("; ").substring(0, 200)}`);
    }

    // ── Final verdict ─────────────────────────────────────────
    expect(failures, `Gate failures:\n${failures.join("\n")}`).toHaveLength(0);
  });
});
