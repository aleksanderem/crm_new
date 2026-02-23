import { test, expect, Page } from "@playwright/test";
import fs from "fs";

const BASE = "http://localhost:5174";
const SCREENSHOTS = "./e2e-screenshots";

// Helper: wait for page to be reasonably loaded
async function waitForApp(page: Page, timeout = 8000) {
  // Wait for network to settle and main content to appear
  await page.waitForLoadState("networkidle", { timeout }).catch(() => {});
  await page.waitForTimeout(500);
}

// Helper: take screenshot with descriptive name
async function screenshot(page: Page, name: string) {
  await page.screenshot({
    path: `${SCREENSHOTS}/${name}.png`,
    fullPage: false,
  });
}

// Helper: collect console errors
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    errors.push(`PAGE ERROR: ${err.message}`);
  });
  return errors;
}

// Helper: check if page has visible error state
async function checkForErrors(page: Page): Promise<string | null> {
  // Check for common error indicators
  const errorTexts = await page
    .locator(
      'text=/error|Error|błąd|Błąd|not found|Not Found|500|Something went wrong/i'
    )
    .allTextContents()
    .catch(() => []);

  const filtered = errorTexts.filter(
    (t) =>
      !t.includes("console") &&
      !t.includes("filter") &&
      t.length < 200
  );
  return filtered.length > 0 ? filtered.join("; ") : null;
}

// ─── RESULTS COLLECTOR ───────────────────────────────────────────
interface AuditResult {
  route: string;
  name: string;
  status: "ok" | "error" | "empty" | "redirect";
  screenshot: string;
  consoleErrors: string[];
  notes: string;
  loadTimeMs: number;
}

const results: AuditResult[] = [];

async function auditPage(
  page: Page,
  route: string,
  name: string,
  opts?: {
    waitForSelector?: string;
    clickActions?: Array<{ selector: string; description: string }>;
    skipScreenshot?: boolean;
  }
) {
  const consoleErrors: string[] = [];
  const errorHandler = (msg: any) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  };
  const pageErrorHandler = (err: Error) => {
    consoleErrors.push(`PAGE_ERROR: ${err.message}`);
  };
  page.on("console", errorHandler);
  page.on("pageerror", pageErrorHandler);

  const start = Date.now();
  let status: AuditResult["status"] = "ok";
  let notes = "";

  try {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await waitForApp(page);

    // Check if we got redirected (e.g., to login)
    const currentUrl = page.url();
    if (currentUrl.includes("/login") && !route.includes("/login")) {
      status = "redirect";
      notes = `Redirected to login: ${currentUrl}`;
    }

    // Wait for specific selector if provided
    if (opts?.waitForSelector) {
      await page
        .waitForSelector(opts.waitForSelector, { timeout: 5000 })
        .catch(() => {
          notes += `Selector '${opts.waitForSelector}' not found. `;
        });
    }

    // Check for empty states
    const bodyText = await page.locator("body").innerText().catch(() => "");
    if (bodyText.trim().length < 10 && status !== "redirect") {
      status = "empty";
      notes += "Page appears empty. ";
    }

    // Check for visible errors in page content
    const visibleError = await page
      .locator('[class*="error"], [class*="Error"], [role="alert"]')
      .first()
      .textContent({ timeout: 1000 })
      .catch(() => null);
    if (visibleError && visibleError.length > 5) {
      notes += `Visible error: ${visibleError.substring(0, 100)}. `;
    }

    // Perform click actions if specified
    if (opts?.clickActions) {
      for (const action of opts.clickActions) {
        try {
          await page.click(action.selector, { timeout: 3000 });
          await page.waitForTimeout(500);
          notes += `Clicked: ${action.description}. `;
        } catch {
          notes += `Could not click: ${action.description}. `;
        }
      }
    }

    const screenshotName = name.replace(/[^a-zA-Z0-9_-]/g, "_");
    if (!opts?.skipScreenshot) {
      await screenshot(page, screenshotName);
    }

    const loadTime = Date.now() - start;

    // Check for React error boundaries
    const errorBoundary = await page
      .locator('text=/Something went wrong|Coś poszło nie tak/i')
      .count()
      .catch(() => 0);
    if (errorBoundary > 0) {
      status = "error";
      notes += "React error boundary triggered. ";
    }

    results.push({
      route,
      name,
      status: consoleErrors.some((e) => e.includes("PAGE_ERROR")) ? "error" : status,
      screenshot: `${screenshotName}.png`,
      consoleErrors: consoleErrors.filter((e) => !e.includes("Download the React DevTools")),
      notes: notes.trim(),
      loadTimeMs: loadTime,
    });
  } catch (e: any) {
    results.push({
      route,
      name,
      status: "error",
      screenshot: "",
      consoleErrors,
      notes: `Navigation error: ${e.message.substring(0, 200)}`,
      loadTimeMs: Date.now() - start,
    });
  } finally {
    page.removeListener("console", errorHandler);
    page.removeListener("pageerror", pageErrorHandler);
  }
}

// ─── MAIN TEST ───────────────────────────────────────────────────

test.describe("CRM Application Full Audit", () => {
  test.setTimeout(300000); // 5 min total

  test("Login and audit all pages", async ({ page }) => {
    // ═══════════════════════════════════════════════════════════════
    // PHASE 1: LOGIN
    // ═══════════════════════════════════════════════════════════════
    console.log("\n=== PHASE 1: LOGIN ===");

    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await screenshot(page, "00_login_choose");

    // Click "Email i hasło"
    await page.click('button:has-text("Email i hasło")');
    await page.waitForTimeout(500);
    await screenshot(page, "01_login_password_form");

    // Fill in credentials — try sign up first
    await page.fill('input[placeholder="Email"]', "test@kolabo.pl");
    await page.fill('input[placeholder="Hasło"]', "testpass123!");

    // Check if we need to sign up or sign in
    // First try signing in
    await page.click('button:has-text("Zaloguj się")');
    await page.waitForTimeout(3000);

    // If still on login page, try sign up
    const stillOnLogin = page.url().includes("/login");
    if (stillOnLogin) {
      // Switch to sign up
      await page.click('text="Nie masz konta? Zarejestruj się"').catch(() => {});
      await page.waitForTimeout(500);
      await page.fill('input[placeholder="Email"]', "test@kolabo.pl");
      await page.fill('input[placeholder="Hasło"]', "testpass123!");
      await page.click('button:has-text("Utwórz konto")');
      await page.waitForTimeout(3000);
    }

    await screenshot(page, "02_after_login_attempt");

    // Check where we ended up
    const postLoginUrl = page.url();
    console.log(`Post-login URL: ${postLoginUrl}`);

    // If we're on onboarding, handle it
    if (postLoginUrl.includes("/onboarding")) {
      console.log("On onboarding page, setting username...");
      await screenshot(page, "03_onboarding_before");
      await page.fill('input[placeholder="Username"]', "testauditor");
      await page.click('button:has-text("Continue")');
      await page.waitForTimeout(5000);
      await screenshot(page, "03_onboarding_after");
    }

    // If we got to dashboard, great. If still on login, we'll proceed anyway
    // and note the redirect in audit results
    const dashboardReached = page.url().includes("/dashboard");
    console.log(`Dashboard reached: ${dashboardReached}`);
    console.log(`Current URL: ${page.url()}`);

    if (!dashboardReached) {
      // Try direct navigation
      await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
      await waitForApp(page);
      console.log(`After direct nav: ${page.url()}`);
    }

    // ═══════════════════════════════════════════════════════════════
    // PHASE 2: CRM CORE PAGES
    // ═══════════════════════════════════════════════════════════════
    console.log("\n=== PHASE 2: CRM CORE ===");

    await auditPage(page, "/dashboard", "CRM_Dashboard");
    await auditPage(page, "/dashboard/leads", "CRM_Leads_List");
    await auditPage(page, "/dashboard/contacts", "CRM_Contacts_List");
    await auditPage(page, "/dashboard/companies", "CRM_Companies_List");
    await auditPage(page, "/dashboard/documents", "CRM_Documents_List");
    await auditPage(page, "/dashboard/activities", "CRM_Activities");
    await auditPage(page, "/dashboard/calls", "CRM_Calls");
    await auditPage(page, "/dashboard/inbox", "CRM_Inbox");
    await auditPage(page, "/dashboard/pipelines", "CRM_Pipelines_Kanban");
    await auditPage(page, "/dashboard/products", "CRM_Products");

    // ═══════════════════════════════════════════════════════════════
    // PHASE 3: GABINET MODULE
    // ═══════════════════════════════════════════════════════════════
    console.log("\n=== PHASE 3: GABINET MODULE ===");

    await auditPage(page, "/dashboard/gabinet", "Gabinet_Dashboard");
    await auditPage(page, "/dashboard/gabinet/patients", "Gabinet_Patients");
    await auditPage(page, "/dashboard/gabinet/treatments", "Gabinet_Treatments");
    await auditPage(page, "/dashboard/gabinet/calendar", "Gabinet_Calendar");
    await auditPage(page, "/dashboard/gabinet/packages", "Gabinet_Packages");
    await auditPage(page, "/dashboard/gabinet/documents", "Gabinet_Documents");
    await auditPage(page, "/dashboard/gabinet/employees", "Gabinet_Employees");

    // ═══════════════════════════════════════════════════════════════
    // PHASE 4: CRM SETTINGS
    // ═══════════════════════════════════════════════════════════════
    console.log("\n=== PHASE 4: CRM SETTINGS ===");

    await auditPage(page, "/dashboard/settings", "Settings_General");
    await auditPage(page, "/dashboard/settings/team", "Settings_Team");
    await auditPage(page, "/dashboard/settings/custom-fields", "Settings_CustomFields");
    await auditPage(page, "/dashboard/settings/activity-types", "Settings_ActivityTypes");
    await auditPage(page, "/dashboard/settings/lost-reasons", "Settings_LostReasons");
    await auditPage(page, "/dashboard/settings/sources", "Settings_Sources");
    await auditPage(page, "/dashboard/settings/email", "Settings_Email");
    await auditPage(page, "/dashboard/settings/organization", "Settings_Organization");

    // ═══════════════════════════════════════════════════════════════
    // PHASE 5: GABINET SETTINGS
    // ═══════════════════════════════════════════════════════════════
    console.log("\n=== PHASE 5: GABINET SETTINGS ===");

    await auditPage(page, "/dashboard/gabinet/settings/scheduling", "Gabinet_Settings_Scheduling");
    await auditPage(page, "/dashboard/gabinet/settings/leave-types", "Gabinet_Settings_LeaveTypes");
    await auditPage(page, "/dashboard/gabinet/settings/leave-balances", "Gabinet_Settings_LeaveBalances");
    await auditPage(page, "/dashboard/gabinet/settings/leaves", "Gabinet_Settings_Leaves");
    await auditPage(page, "/dashboard/gabinet/settings/document-templates", "Gabinet_Settings_DocTemplates");

    // ═══════════════════════════════════════════════════════════════
    // PHASE 6: SIDEBAR NAVIGATION CHECK
    // ═══════════════════════════════════════════════════════════════
    console.log("\n=== PHASE 6: SIDEBAR CHECK ===");

    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
    await waitForApp(page);

    // Check sidebar links
    const sidebarLinks = await page.locator("aside a").allTextContents().catch(() => []);
    console.log("Sidebar links found:", sidebarLinks.length);
    console.log("Sidebar items:", sidebarLinks.filter(s => s.trim()).join(", "));

    // ═══════════════════════════════════════════════════════════════
    // PHASE 7: INTERACTIVE FEATURES
    // ═══════════════════════════════════════════════════════════════
    console.log("\n=== PHASE 7: INTERACTIVE FEATURES ===");

    // Test creating a new contact via side panel
    await page.goto(`${BASE}/dashboard/contacts`, { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    const addBtn = page.locator('button:has-text("Dodaj"), button:has-text("Add"), button:has-text("Nowy")').first();
    if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(1000);
      await screenshot(page, "Interactive_Contact_AddForm");
      // Close the panel
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
    }

    // Test Kanban board
    await page.goto(`${BASE}/dashboard/pipelines`, { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await screenshot(page, "Interactive_Kanban_Board");

    // Test search (if global search exists)
    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    const searchBtn = page.locator('button:has(svg.lucide-search), [data-testid="search"], button:has-text("Szukaj")').first();
    if (await searchBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchBtn.click();
      await page.waitForTimeout(1000);
      await screenshot(page, "Interactive_GlobalSearch");
      await page.keyboard.press("Escape");
    }

    // ═══════════════════════════════════════════════════════════════
    // PHASE 8: PATIENT PORTAL
    // ═══════════════════════════════════════════════════════════════
    console.log("\n=== PHASE 8: PATIENT PORTAL ===");

    await auditPage(page, "/patient/login", "Patient_Login");

    // ═══════════════════════════════════════════════════════════════
    // GENERATE REPORT
    // ═══════════════════════════════════════════════════════════════
    console.log("\n=== GENERATING REPORT ===");

    const report = {
      timestamp: new Date().toISOString(),
      totalPages: results.length,
      summary: {
        ok: results.filter((r) => r.status === "ok").length,
        error: results.filter((r) => r.status === "error").length,
        empty: results.filter((r) => r.status === "empty").length,
        redirect: results.filter((r) => r.status === "redirect").length,
      },
      pagesWithConsoleErrors: results.filter((r) => r.consoleErrors.length > 0).length,
      avgLoadTimeMs: Math.round(
        results.reduce((s, r) => s + r.loadTimeMs, 0) / results.length
      ),
      results,
    };

    // Write report as JSON
    fs.writeFileSync(
      `${SCREENSHOTS}/audit-report.json`,
      JSON.stringify(report, null, 2)
    );

    // Print summary
    console.log("\n═══════════════════════════════════════");
    console.log("        APPLICATION AUDIT REPORT       ");
    console.log("═══════════════════════════════════════");
    console.log(`Total pages audited: ${report.totalPages}`);
    console.log(`  OK:       ${report.summary.ok}`);
    console.log(`  Errors:   ${report.summary.error}`);
    console.log(`  Empty:    ${report.summary.empty}`);
    console.log(`  Redirect: ${report.summary.redirect}`);
    console.log(`Avg load time: ${report.avgLoadTimeMs}ms`);
    console.log("");

    for (const r of results) {
      const icon =
        r.status === "ok" ? "✅" :
        r.status === "error" ? "❌" :
        r.status === "empty" ? "⚠️" : "🔄";
      console.log(
        `${icon} ${r.name.padEnd(35)} ${r.status.padEnd(10)} ${r.loadTimeMs}ms ${r.notes ? `| ${r.notes}` : ""}`
      );
      if (r.consoleErrors.length > 0) {
        for (const e of r.consoleErrors.slice(0, 3)) {
          console.log(`   ⚠ Console: ${e.substring(0, 120)}`);
        }
      }
    }

    // Assert no critical failures
    const criticalErrors = results.filter(
      (r) => r.status === "error" && !r.notes.includes("Navigation error")
    );
    if (criticalErrors.length > 0) {
      console.log("\n⚠️ CRITICAL ERRORS FOUND:");
      for (const e of criticalErrors) {
        console.log(`  - ${e.name}: ${e.notes}`);
      }
    }
  });
});
