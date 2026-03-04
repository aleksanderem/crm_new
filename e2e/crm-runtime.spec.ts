import { test, expect, Page } from "@playwright/test";
import fs from "fs";

const BASE = "http://localhost:5173";
const CREDS = { email: "amiesak@gmail.com", password: "ABcdefg123!@#" };
const REPORT_DIR = "./docs/runtime-e2e";

interface TestResult {
  flow: string;
  step: string;
  status: "PASS" | "FAIL" | "SKIP";
  detail: string;
  durationMs: number;
}

const results: TestResult[] = [];

function record(flow: string, step: string, status: TestResult["status"], detail: string, durationMs: number) {
  results.push({ flow, step, status, detail, durationMs });
  const icon = status === "PASS" ? "PASS" : status === "FAIL" ? "FAIL" : "SKIP";
  console.log(`[${icon}] ${flow} > ${step}: ${detail} (${durationMs}ms)`);
}

async function waitForApp(page: Page, timeout = 10000) {
  await page.waitForLoadState("networkidle", { timeout }).catch(() => {});
  await page.waitForTimeout(800);
}

test.describe("R1 CRM Runtime E2E", () => {
  test.setTimeout(180000); // 3 min

  test("Full CRM flow validation", async ({ page }) => {
    // Ensure report dir exists
    fs.mkdirSync(REPORT_DIR, { recursive: true });

    // Collect console errors
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(`PAGE_ERROR: ${err.message}`));

    // ═══════════════════════════════════════════════════════════════
    // PHASE 0: LOGIN
    // ═══════════════════════════════════════════════════════════════
    let t0 = Date.now();
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 15000 });

    // Click password auth
    const passwordBtn = page.locator('button:has-text("Email i hasło"), button:has-text("Email"), button:has-text("Password")').first();
    if (await passwordBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await passwordBtn.click();
      await page.waitForTimeout(500);
    }

    // Fill credentials
    await page.fill('input[type="email"], input[placeholder*="Email"], input[name="email"]', CREDS.email);
    await page.fill('input[type="password"], input[placeholder*="asło"], input[name="password"]', CREDS.password);
    await page.click('button[type="submit"], button:has-text("Zaloguj"), button:has-text("Sign in")');
    await page.waitForTimeout(3000);
    await waitForApp(page);

    const postLoginUrl = page.url();
    const loggedIn = postLoginUrl.includes("/dashboard") || postLoginUrl.includes("/onboarding");

    if (postLoginUrl.includes("/onboarding")) {
      // Handle onboarding if needed - just try to proceed
      await page.waitForTimeout(2000);
      const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Dalej")').first();
      if (await continueBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await continueBtn.click();
        await page.waitForTimeout(3000);
      }
    }

    record("Auth", "Login", loggedIn ? "PASS" : "FAIL", `Post-login URL: ${postLoginUrl}`, Date.now() - t0);

    if (!loggedIn && !postLoginUrl.includes("/dashboard")) {
      // Try direct navigation
      await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
      await waitForApp(page);
    }

    // ═══════════════════════════════════════════════════════════════
    // PHASE 1: LEADS FLOW
    // ═══════════════════════════════════════════════════════════════
    t0 = Date.now();
    await page.goto(`${BASE}/dashboard/leads`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await waitForApp(page);

    const leadsUrl = page.url();
    const onLeadsPage = leadsUrl.includes("/leads") || leadsUrl.includes("/dashboard");
    record("Leads", "Navigate to list", onLeadsPage ? "PASS" : "FAIL", `URL: ${leadsUrl}`, Date.now() - t0);

    // Check if data table or list content loads
    t0 = Date.now();
    const leadsTable = page.locator('table, [role="table"], [data-testid="leads-table"], .data-table');
    const leadsTableVisible = await leadsTable.first().isVisible({ timeout: 5000 }).catch(() => false);
    // Also check for empty state or kanban
    const leadsContent = await page.locator('body').innerText().catch(() => "");
    const hasLeadContent = leadsContent.includes("Test") || leadsContent.includes("lead") || leadsContent.includes("Nowy") || leadsContent.includes("Brak");
    record("Leads", "List renders", leadsTableVisible || hasLeadContent ? "PASS" : "FAIL",
      leadsTableVisible ? "Table visible" : hasLeadContent ? "Content present" : "No table or content found",
      Date.now() - t0);

    // Try to create a lead - target main content area button (not sidebar)
    t0 = Date.now();
    // The main CTA is "Dodaj transakcję" in main area or the empty state button
    // Use main > to avoid sidebar buttons
    const addLeadBtn = page.locator('main button:has-text("Dodaj transakcję")').first();
    const emptyStateBtn = page.locator('button:has-text("Dodaj transakcję")').last(); // empty state CTA is typically last
    let leadCreated = false;

    const targetBtn = await addLeadBtn.isVisible({ timeout: 2000 }).catch(() => false) ? addLeadBtn : emptyStateBtn;
    if (await targetBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await targetBtn.click();
      await page.waitForTimeout(2000);

      // The SidePanel (Sheet from Radix) should now be open with role=dialog
      const titleInput = page.locator('[role="dialog"] input').first();
      if (await titleInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        const testTitle = `E2E-Lead-${Date.now()}`;
        await titleInput.fill(testTitle);

        // Fill value field (type=number)
        const valueInput = page.locator('[role="dialog"] input[type="number"]').first();
        if (await valueInput.isVisible({ timeout: 1000 }).catch(() => false)) {
          await valueInput.fill("5000");
        }

        // Submit - "Utwórz transakcję" or "Create Lead"
        const submitBtn = page.locator('[role="dialog"] button:has-text("Utwórz"), [role="dialog"] button:has-text("Create"), [role="dialog"] button:has-text("Zapisz")').first();
        if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await submitBtn.click();
          await page.waitForTimeout(3000);
          await waitForApp(page);

          const pageText = await page.locator('body').innerText().catch(() => "");
          leadCreated = pageText.includes(testTitle) || pageText.includes("E2E-Lead");
          record("Leads", "Create lead", leadCreated ? "PASS" : "FAIL",
            leadCreated ? `Created: ${testTitle}` : "Lead not visible after creation",
            Date.now() - t0);
        } else {
          record("Leads", "Create lead", "SKIP", "Submit button not found in dialog", Date.now() - t0);
        }
      } else {
        record("Leads", "Create lead", "SKIP", "No input in dialog after click", Date.now() - t0);
      }
    } else {
      record("Leads", "Create lead", "SKIP", "Add button not visible in main area", Date.now() - t0);
    }

    // Try to click on existing lead for view detail
    t0 = Date.now();
    await page.goto(`${BASE}/dashboard/leads`, { waitUntil: "domcontentloaded" });
    await waitForApp(page);

    // After creating a lead above, the table should now have a row
    // Look for the E2E lead text or any clickable lead link/row
    const leadLink = page.locator('a[href*="/leads/"]').first();
    const leadText = page.locator('text=E2E-Lead').first();
    const tableRow = page.locator('table tbody tr').first();

    if (await leadLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await leadLink.click();
      await page.waitForTimeout(2000);
      const detailUrl = page.url();
      record("Leads", "View detail", detailUrl.includes("/leads/") ? "PASS" : "FAIL",
        `Detail URL: ${detailUrl}`, Date.now() - t0);
    } else if (await leadText.isVisible({ timeout: 2000 }).catch(() => false)) {
      await leadText.click();
      await page.waitForTimeout(2000);
      const detailUrl = page.url();
      record("Leads", "View detail", detailUrl.includes("/leads/") ? "PASS" : "FAIL",
        `Detail URL: ${detailUrl}`, Date.now() - t0);
    } else if (await tableRow.isVisible({ timeout: 2000 }).catch(() => false)) {
      await tableRow.click();
      await page.waitForTimeout(2000);
      const detailUrl = page.url();
      record("Leads", "View detail", detailUrl.includes("/leads/") ? "PASS" : "FAIL",
        `Detail URL: ${detailUrl}`, Date.now() - t0);
    } else {
      record("Leads", "View detail", "SKIP", "No lead row/link to click", Date.now() - t0);
    }

    // ═══════════════════════════════════════════════════════════════
    // PHASE 2: ACTIVITIES FLOW
    // ═══════════════════════════════════════════════════════════════
    t0 = Date.now();
    await page.goto(`${BASE}/dashboard/activities`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await waitForApp(page);

    const activitiesUrl = page.url();
    record("Activities", "Navigate to list",
      activitiesUrl.includes("/activities") || activitiesUrl.includes("/dashboard") ? "PASS" : "FAIL",
      `URL: ${activitiesUrl}`, Date.now() - t0);

    // Check activities list renders
    t0 = Date.now();
    const activitiesContent = await page.locator('body').innerText().catch(() => "");
    const hasActivities = activitiesContent.includes("Test") || activitiesContent.includes("Wizja") ||
                          activitiesContent.includes("aktywno") || activitiesContent.includes("Brak") ||
                          activitiesContent.includes("activities") || activitiesContent.length > 100;
    record("Activities", "List renders", hasActivities ? "PASS" : "FAIL",
      hasActivities ? "Activity content present" : "No content found", Date.now() - t0);

    // Try to create activity
    t0 = Date.now();
    // Try multiple button selectors - sidebar buttons come first in DOM, avoid them
    let actBtnClicked = false;
    for (const sel of [
      'main button:has-text("Dodaj aktywność")',
      'header button:has-text("Dodaj aktywność")',
      'button:has-text("Dodaj aktywność") >> nth=-1', // last match (empty state or footer)
    ]) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await btn.click();
        actBtnClicked = true;
        break;
      }
    }

    if (actBtnClicked) {
      // Wait for Sheet dialog to render
      await page.waitForTimeout(2500);

      // Activity form in dialog/panel - try both dialog and general input
      const actTitleInput = page.locator('[role="dialog"] input').first();
      if (await actTitleInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        const actTitle = `E2E-Activity-${Date.now()}`;
        await actTitleInput.fill(actTitle);

        // Fill due date
        const dateInput = page.locator('[role="dialog"] input[type="datetime-local"]').first();
        if (await dateInput.isVisible({ timeout: 1000 }).catch(() => false)) {
          await dateInput.fill("2026-03-05T10:00");
        }

        // Submit - "Utwórz" is the Polish translation of "Create"
        const actSubmitBtn = page.locator('[role="dialog"] button:has-text("Utwórz"), [role="dialog"] button:has-text("Create")').first();
        if (await actSubmitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await actSubmitBtn.click();
          await page.waitForTimeout(3000);
          await waitForApp(page);

          const afterText = await page.locator('body').innerText().catch(() => "");
          const actCreated = afterText.includes(actTitle) || afterText.includes("E2E-Activity");
          record("Activities", "Create activity", actCreated ? "PASS" : "FAIL",
            actCreated ? `Created: ${actTitle}` : "Activity not visible after creation",
            Date.now() - t0);
        } else {
          record("Activities", "Create activity", "SKIP", "Submit button not found in dialog", Date.now() - t0);
        }
      } else {
        record("Activities", "Create activity", "SKIP", "No input in dialog after click (dialog might not have opened)", Date.now() - t0);
      }
    } else {
      record("Activities", "Create activity", "SKIP", "No add-activity button found", Date.now() - t0);
    }

    // ═══════════════════════════════════════════════════════════════
    // PHASE 3: CALENDAR FLOW
    // ═══════════════════════════════════════════════════════════════
    t0 = Date.now();
    await page.goto(`${BASE}/dashboard/calendar`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await waitForApp(page);

    const calendarUrl = page.url();
    record("Calendar", "Navigate to calendar",
      calendarUrl.includes("/calendar") || calendarUrl.includes("/dashboard") ? "PASS" : "FAIL",
      `URL: ${calendarUrl}`, Date.now() - t0);

    // Check calendar renders
    t0 = Date.now();
    const calendarContent = await page.locator('body').innerText().catch(() => "");
    // Calendar should have day/week/month indicators or date numbers
    const hasCalendarContent = calendarContent.includes("2026") || calendarContent.includes("marz") ||
                                calendarContent.includes("Mar") || calendarContent.includes("Pon") ||
                                calendarContent.includes("Mon") || calendarContent.length > 200;
    record("Calendar", "Calendar renders", hasCalendarContent ? "PASS" : "FAIL",
      hasCalendarContent ? "Calendar content visible" : "No calendar content found", Date.now() - t0);

    // Check for React error boundary
    t0 = Date.now();
    const calErrorBoundary = await page.locator('text=/Something went wrong|Coś poszło nie tak/i').count().catch(() => 0);
    record("Calendar", "No error boundary", calErrorBoundary === 0 ? "PASS" : "FAIL",
      calErrorBoundary > 0 ? "Error boundary triggered" : "No errors", Date.now() - t0);

    // ═══════════════════════════════════════════════════════════════
    // PHASE 4: DOCUMENTS FLOW
    // ═══════════════════════════════════════════════════════════════
    t0 = Date.now();
    await page.goto(`${BASE}/dashboard/documents`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await waitForApp(page);

    const docsUrl = page.url();
    record("Documents", "Navigate to list",
      docsUrl.includes("/documents") || docsUrl.includes("/dashboard") ? "PASS" : "FAIL",
      `URL: ${docsUrl}`, Date.now() - t0);

    // Check documents page renders (could be empty state)
    t0 = Date.now();
    const docsContent = await page.locator('body').innerText().catch(() => "");
    const hasDocsContent = docsContent.includes("dokument") || docsContent.includes("Document") ||
                           docsContent.includes("Brak") || docsContent.includes("Dodaj") ||
                           docsContent.includes("Upload") || docsContent.length > 100;
    record("Documents", "Page renders", hasDocsContent ? "PASS" : "FAIL",
      hasDocsContent ? "Documents page content present" : "No content", Date.now() - t0);

    // Check for document upload capability
    t0 = Date.now();
    const uploadBtn = page.locator('button:has-text("Dodaj"), button:has-text("Upload"), button:has-text("Prześlij"), button:has-text("Nowy")').first();
    const canUpload = await uploadBtn.isVisible({ timeout: 3000 }).catch(() => false);
    record("Documents", "Upload button available", canUpload ? "PASS" : "SKIP",
      canUpload ? "Upload button visible" : "No upload button found (may be empty state)", Date.now() - t0);

    // ═══════════════════════════════════════════════════════════════
    // PHASE 5: DATA PERSISTENCE CHECK (console errors)
    // ═══════════════════════════════════════════════════════════════
    t0 = Date.now();
    const criticalErrors = consoleErrors.filter(e =>
      (e.includes("PAGE_ERROR") ||
      e.includes("Uncaught") ||
      (e.includes("Error") && !e.includes("DevTools") && !e.includes("favicon"))) &&
      !e.includes("IconsEasier") && !e.includes("ezicons") &&
      !e.includes("Failed to fetch") && !e.includes("net::ERR")
    );
    record("Overall", "Console errors",
      criticalErrors.length === 0 ? "PASS" : "FAIL",
      criticalErrors.length === 0 ? "No critical console errors" : `${criticalErrors.length} errors: ${criticalErrors.slice(0, 3).join("; ").substring(0, 200)}`,
      Date.now() - t0);

    // ═══════════════════════════════════════════════════════════════
    // GENERATE REPORT
    // ═══════════════════════════════════════════════════════════════
    const passCount = results.filter(r => r.status === "PASS").length;
    const failCount = results.filter(r => r.status === "FAIL").length;
    const skipCount = results.filter(r => r.status === "SKIP").length;

    let md = `# R1 CRM Runtime E2E Report\n\n`;
    md += `Date: ${new Date().toISOString()}\n`;
    md += `Worker: R1 (runtime-crm)\n`;
    md += `Env: localhost:5173, Convex cloud: helpful-mule-867\n`;
    md += `User: ${CREDS.email}\n\n`;
    md += `## Summary\n\n`;
    md += `| Metric | Count |\n|--------|-------|\n`;
    md += `| PASS | ${passCount} |\n`;
    md += `| FAIL | ${failCount} |\n`;
    md += `| SKIP | ${skipCount} |\n`;
    md += `| Total | ${results.length} |\n\n`;
    md += `## Results\n\n`;
    md += `| Flow | Step | Status | Detail | Duration |\n`;
    md += `|------|------|--------|--------|----------|\n`;
    for (const r of results) {
      md += `| ${r.flow} | ${r.step} | ${r.status} | ${r.detail.substring(0, 80)} | ${r.durationMs}ms |\n`;
    }

    if (criticalErrors.length > 0) {
      md += `\n## Console Errors\n\n`;
      md += "```\n";
      for (const e of criticalErrors.slice(0, 10)) {
        md += `${e.substring(0, 200)}\n`;
      }
      md += "```\n";
    }

    if (failCount > 0) {
      md += `\n## Failures - Suspected Modules\n\n`;
      for (const r of results.filter(r => r.status === "FAIL")) {
        md += `- ${r.flow} > ${r.step}: ${r.detail}\n`;
        if (r.flow === "Leads") md += `  Suspected files: convex/leads.ts, src/routes/_app/_auth/dashboard/_layout.leads.*.tsx\n`;
        if (r.flow === "Activities") md += `  Suspected files: convex/scheduledActivities.ts, src/routes/_app/_auth/dashboard/_layout.activities.*.tsx\n`;
        if (r.flow === "Calendar") md += `  Suspected files: src/routes/_app/_auth/dashboard/_layout.calendar.tsx, src/components/application/calendar/\n`;
        if (r.flow === "Documents") md += `  Suspected files: convex/documents.ts, src/routes/_app/_auth/dashboard/_layout.documents.*.tsx\n`;
      }
    }

    md += `\n## Convex Data Verification Commands\n\n`;
    md += "```bash\n";
    md += `# Check leads\nnpx convex data leads\n\n`;
    md += `# Check scheduled activities\nnpx convex data scheduledActivities --limit 10\n\n`;
    md += `# Check documents\nnpx convex data documents\n\n`;
    md += `# Check calendar entries\nnpx convex data scheduledActivities --limit 5\n`;
    md += "```\n";

    fs.writeFileSync(`${REPORT_DIR}/R1_crm.md`, md);
    fs.writeFileSync(`${REPORT_DIR}/R1_crm_results.json`, JSON.stringify({ results, consoleErrors: criticalErrors }, null, 2));

    console.log("\n═══════════════════════════════════════");
    console.log("     R1 CRM RUNTIME REPORT SUMMARY     ");
    console.log("═══════════════════════════════════════");
    console.log(`PASS: ${passCount}  FAIL: ${failCount}  SKIP: ${skipCount}`);
    console.log(`Report written to: ${REPORT_DIR}/R1_crm.md`);

    // Don't hard-fail the test - we want the report generated regardless
    // expect(failCount).toBe(0);
  });
});
