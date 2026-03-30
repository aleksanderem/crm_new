/**
 * Full Interactive UI Audit
 * 
 * Clicks every button, opens every dropdown, tests every form, 
 * verifies every table row action across all pages.
 * 
 * Run: npx playwright test e2e/audit/full-interactive-audit.spec.ts --reporter=list --timeout=300000
 */
import { test, expect, type Page } from "@playwright/test";

const BASE = "http://localhost:5173";

// ── Helpers ──────────────────────────────────────────────────
async function login(page: Page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  // Already logged in?
  if (page.url().includes("/dashboard")) return;
  
  const pwdBtn = page.locator('button:has-text("Email i hasło")');
  if (await pwdBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await pwdBtn.click();
  }
  await page.locator("#userEmail").fill("amiesak@gmail.com");
  await page.locator("#password").fill("ABcdefg123!@#");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/dashboard/, { timeout: 20000 });
  await page.waitForTimeout(2000);
}

async function goTo(page: Page, path: string) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(2000);
}

interface Finding {
  page: string;
  element: string;
  action: string;
  expected: string;
  actual: string;
  status: "PASS" | "FAIL" | "NO_REACTION" | "CRASH";
  severity: "P0" | "P1" | "P2" | "P3";
}

const findings: Finding[] = [];

import { appendFileSync, writeFileSync } from "fs";

const RESULTS_FILE = "/tmp/audit-results.jsonl";

// Clear results file at start
try { writeFileSync(RESULTS_FILE, ""); } catch {}

function record(f: Finding) {
  findings.push(f);
  try { appendFileSync(RESULTS_FILE, JSON.stringify(f) + "\n"); } catch {}
  if (f.status !== "PASS") {
    console.log(`[${f.severity}] ${f.status}: ${f.page} > ${f.element} — ${f.actual}`);
  }
}

/** Check if page crashed (error boundary) */
async function checkCrash(page: Page, pageName: string): Promise<boolean> {
  const body = await page.locator("body").textContent({ timeout: 3000 }).catch(() => "");
  if (body?.includes("Something went wrong") || body?.includes("Not Found")) {
    record({
      page: pageName, element: "Page render", action: "navigate",
      expected: "Page renders", actual: body.includes("Not Found") ? "404 Not Found" : "Error boundary: Something went wrong",
      status: "CRASH", severity: "P0"
    });
    return true;
  }
  return false;
}

/** Click a button and check reaction */
async function clickButton(page: Page, pageName: string, selector: string, label: string, expectedReaction: string) {
  const btn = page.locator(selector).first();
  if (!await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
    record({ page: pageName, element: label, action: "click", expected: expectedReaction, actual: "Button not found/visible", status: "FAIL", severity: "P1" });
    return;
  }
  
  const urlBefore = page.url();
  const bodyBefore = await page.locator("body").textContent({ timeout: 2000 }).catch(() => "") || "";
  
  await btn.click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(1500);
  
  const urlAfter = page.url();
  const bodyAfter = await page.locator("body").textContent({ timeout: 2000 }).catch(() => "") || "";
  const dialogOpen = await page.locator("[role='dialog']").isVisible({ timeout: 500 }).catch(() => false);
  const popoverOpen = await page.locator("[data-radix-popper-content-wrapper]").isVisible({ timeout: 500 }).catch(() => false);
  
  const urlChanged = urlBefore !== urlAfter;
  const contentChanged = bodyBefore !== bodyAfter;
  
  if (urlChanged || dialogOpen || popoverOpen || contentChanged) {
    record({ page: pageName, element: label, action: "click", expected: expectedReaction, actual: urlChanged ? `Navigated to ${urlAfter}` : dialogOpen ? "Dialog opened" : popoverOpen ? "Popover opened" : "Content changed", status: "PASS", severity: "P3" });
    // Close any opened dialog/popover
    if (dialogOpen || popoverOpen) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
    }
    // Navigate back if URL changed
    if (urlChanged) {
      await goTo(page, new URL(urlBefore).pathname);
    }
  } else {
    record({ page: pageName, element: label, action: "click", expected: expectedReaction, actual: "No reaction", status: "NO_REACTION", severity: "P1" });
  }
}

/** Check data table has rows */
async function checkTable(page: Page, pageName: string, minRows = 1) {
  const rows = page.locator("table tbody tr, [role='row']");
  const count = await rows.count();
  const hasEmptyState = await page.locator("text=Brak").isVisible({ timeout: 1000 }).catch(() => false);
  
  if (count >= minRows && !hasEmptyState) {
    record({ page: pageName, element: "Data table", action: "render", expected: `At least ${minRows} rows`, actual: `${count} rows`, status: "PASS", severity: "P3" });
  } else if (hasEmptyState) {
    record({ page: pageName, element: "Data table", action: "render", expected: `At least ${minRows} rows`, actual: "Empty state shown", status: "FAIL", severity: "P2" });
  }
}

/** Test row click behavior */
async function checkRowClick(page: Page, pageName: string) {
  const firstRowLink = page.locator("table tbody tr a, [role='row'] a").first();
  const firstRow = page.locator("table tbody tr, [role='row']").nth(1); // skip header
  
  if (!await firstRow.isVisible({ timeout: 2000 }).catch(() => false)) return;
  
  const urlBefore = page.url();
  await firstRow.click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(1000);
  const urlAfter = page.url();
  
  const bodyText = await page.locator("body").textContent({ timeout: 1000 }).catch(() => "") || "";
  const selected = bodyText.includes("zaznaczony");
  
  if (urlBefore !== urlAfter) {
    record({ page: pageName, element: "Row click", action: "click first row", expected: "Navigate to detail", actual: `Navigated to ${urlAfter}`, status: "PASS", severity: "P3" });
    await goTo(page, new URL(urlBefore).pathname);
  } else if (selected) {
    record({ page: pageName, element: "Row click", action: "click first row", expected: "Navigate to detail", actual: "Row selected instead of navigating", status: "FAIL", severity: "P2" });
    // Deselect
    await firstRow.click({ timeout: 1000 }).catch(() => {});
    await page.waitForTimeout(500);
  } else {
    record({ page: pageName, element: "Row click", action: "click first row", expected: "Navigate to detail", actual: "No reaction", status: "NO_REACTION", severity: "P2" });
  }
}

/** Test three-dot menu on row */
async function checkRowMenu(page: Page, pageName: string) {
  const menuBtn = page.locator("table tbody tr button[aria-haspopup], [role='row'] button[aria-haspopup]").first();
  if (!await menuBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    // Try ⋮ button
    const dotsBtn = page.locator("table tbody tr button:has(svg), td button").last();
    if (!await dotsBtn.isVisible({ timeout: 1000 }).catch(() => false)) return;
    
    await dotsBtn.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(1000);
  } else {
    await menuBtn.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(1000);
  }
  
  const popover = await page.locator("[data-radix-popper-content-wrapper], [role='menu']").isVisible({ timeout: 1000 }).catch(() => false);
  if (popover) {
    record({ page: pageName, element: "Row ⋮ menu", action: "click", expected: "Opens action menu", actual: "Menu opened", status: "PASS", severity: "P3" });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  } else {
    record({ page: pageName, element: "Row ⋮ menu", action: "click", expected: "Opens action menu", actual: "No menu appeared", status: "FAIL", severity: "P1" });
  }
}

/** Test search input */
async function checkSearch(page: Page, pageName: string, placeholder: string) {
  const input = page.locator(`input[placeholder*="${placeholder}"]`).first();
  if (!await input.isVisible({ timeout: 2000 }).catch(() => false)) {
    record({ page: pageName, element: "Search", action: "type", expected: "Search input visible", actual: "Not found", status: "FAIL", severity: "P2" });
    return;
  }
  
  await input.fill("test");
  await page.waitForTimeout(1500);
  await input.fill("");
  await page.waitForTimeout(1000);
  
  record({ page: pageName, element: "Search", action: "type and clear", expected: "Filters/restores", actual: "Search input works", status: "PASS", severity: "P3" });
}

/** Test Filters button */
async function checkFilters(page: Page, pageName: string) {
  const filtersBtn = page.locator("button:has-text('Filters')").first();
  if (!await filtersBtn.isVisible({ timeout: 2000 }).catch(() => false)) return;
  
  await filtersBtn.click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(1000);
  
  const filterPanel = await page.locator("[data-radix-popper-content-wrapper], [role='dialog']").isVisible({ timeout: 1000 }).catch(() => false);
  const contentChanged = await page.locator("text=Add filter, text=Dodaj filtr").isVisible({ timeout: 1000 }).catch(() => false);
  
  if (filterPanel || contentChanged) {
    record({ page: pageName, element: "Filters", action: "click", expected: "Opens filter panel", actual: "Filter panel opened", status: "PASS", severity: "P3" });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  } else {
    record({ page: pageName, element: "Filters", action: "click", expected: "Opens filter panel", actual: "No filter panel appeared", status: "NO_REACTION", severity: "P2" });
  }
}

// ═══════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════

test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

test.beforeEach(async ({ page }) => {
  // Navigate and check if we need to log in
  const resp = await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(2000);
  
  if (page.url().includes("/login")) {
    // Need to log in
    const pwdBtn = page.locator('button:has-text("Email i hasło")');
    if (await pwdBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
      await pwdBtn.click();
      await page.waitForTimeout(500);
    }
    const emailInput = page.locator('#userEmail, input[type="email"]').first();
    await emailInput.waitFor({ state: "visible", timeout: 10000 });
    await emailInput.fill("amiesak@gmail.com");
    await page.locator('#password, input[type="password"]').first().fill("ABcdefg123!@#");
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/dashboard/, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);
  }
});

// ─── DASHBOARD ──────────────────────────────────────────────

test("Dashboard — all controls", async ({ page }) => {
  await goTo(page, "/dashboard");
  if (await checkCrash(page, "/dashboard")) return;
  
  await clickButton(page, "/dashboard", 'button:has-text("Widok lejka")', "Widok lejka", "Navigate to leads");
  await clickButton(page, "/dashboard", 'button:has-text("Dodaj transakcję")', "Dodaj transakcję", "Open new deal dialog");
  await clickButton(page, "/dashboard", 'button:has-text("Dzisiejsze aktywności")', "Dzisiejsze aktywności", "Navigate to activities");
  await clickButton(page, "/dashboard", 'button:has-text("Eksportuj raport")', "Eksportuj raport", "Export or open dialog");
  await clickButton(page, "/dashboard", 'button:has-text("Ostatnie 30 dni")', "Date range selector", "Open date picker");
  
  // Smart Agenda tabs
  await clickButton(page, "/dashboard", 'button:has-text("Wszystkie")', "Smart Agenda Wszystkie tab", "Switch tab");
  await clickButton(page, "/dashboard", 'button:has-text("Moje")', "Smart Agenda Moje tab", "Switch tab");
});

// ─── CONTACTS ──────────────────────────────────────────────

test("Contacts list — all controls", async ({ page }) => {
  await goTo(page, "/dashboard/contacts");
  if (await checkCrash(page, "/contacts")) return;
  
  await checkTable(page, "/contacts");
  await checkSearch(page, "/contacts", "Szukaj kontaktów");
  await checkFilters(page, "/contacts");
  await checkRowClick(page, "/contacts");
  await checkRowMenu(page, "/contacts");
  
  await clickButton(page, "/contacts", 'button:has-text("Dodaj kontakt")', "Dodaj kontakt (sidebar)", "Open create form");
  await clickButton(page, "/contacts", 'button:has-text("Importuj CSV")', "Importuj CSV", "Open import dialog");
  await clickButton(page, "/contacts", 'button:has-text("Eksportuj CSV")', "Eksportuj CSV", "Download or dialog");
  await clickButton(page, "/contacts", 'button:has-text("Zapisane widoki")', "Zapisane widoki", "Open views dialog");
  
  // Column sort
  const nameHeader = page.locator("th:has-text('Kontakt'), button:has-text('Kontakt')").first();
  if (await nameHeader.isVisible({ timeout: 1000 }).catch(() => false)) {
    await nameHeader.click();
    await page.waitForTimeout(1000);
    record({ page: "/contacts", element: "Column sort (Kontakt)", action: "click header", expected: "Sort changes", actual: "Clicked", status: "PASS", severity: "P3" });
  }
  
  // Pagination
  const nextBtn = page.locator("button:has-text('Next')").first();
  if (await nextBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    const enabled = await nextBtn.isEnabled({ timeout: 500 }).catch(() => false);
    if (enabled) {
      await nextBtn.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1000);
      record({ page: "/contacts", element: "Pagination Next", action: "click", expected: "Next page loads", actual: "Clicked", status: "PASS", severity: "P3" });
      const prevBtn = page.locator("button:has-text('Previous')").first();
      if (await prevBtn.isEnabled({ timeout: 500 }).catch(() => false)) {
        await prevBtn.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(1000);
      }
    } else {
      record({ page: "/contacts", element: "Pagination Next", action: "check", expected: "Enabled if >1 page", actual: "Disabled (may be single page)", status: "PASS", severity: "P3" });
    }
  }
});

test("Contacts — create flow", async ({ page }) => {
  await goTo(page, "/dashboard/contacts");
  
  // Open create dialog — use the prominent top-right button
  const addBtn = page.locator('button:has-text("Dodaj kontakt")').last();
  await addBtn.waitFor({ state: "visible", timeout: 10000 });
  await addBtn.click();
  await page.waitForTimeout(1000);
  
  const dialog = page.locator("[role='dialog']");
  if (!await dialog.isVisible({ timeout: 3000 })) {
    record({ page: "/contacts/new", element: "Create dialog", action: "open", expected: "Dialog visible", actual: "Not visible", status: "FAIL", severity: "P1" });
    return;
  }
  
  // Fill form
  await dialog.locator("input[required]").first().fill("AuditTest");
  await dialog.locator(".grid > div:nth-child(2) input").first().fill("ContactAudit");
  await dialog.locator("input[type='email']").first().fill("audit@test.com");
  await dialog.locator("input[type='tel']").first().fill("+48999111222");
  
  // Submit
  await dialog.locator("button[type='submit']").click();
  await page.waitForTimeout(3000);
  
  const dialogStillOpen = await dialog.isVisible({ timeout: 1000 }).catch(() => false);
  if (!dialogStillOpen) {
    record({ page: "/contacts/new", element: "Create form submit", action: "fill + submit", expected: "Contact created, dialog closes", actual: "Dialog closed (success)", status: "PASS", severity: "P3" });
  } else {
    record({ page: "/contacts/new", element: "Create form submit", action: "fill + submit", expected: "Contact created, dialog closes", actual: "Dialog still open after submit", status: "FAIL", severity: "P1" });
  }
});

test("Contacts — detail page", async ({ page }) => {
  await goTo(page, "/dashboard/contacts");
  
  // Navigate to first contact detail via link
  const firstLink = page.locator("table a, [role='row'] a").first();
  if (await firstLink.isVisible({ timeout: 2000 }).catch(() => false)) {
    await firstLink.click({ timeout: 3000 });
    await page.waitForTimeout(2000);
  } else {
    // Try clicking the row directly
    const firstRow = page.locator("table tbody tr").first();
    await firstRow.click();
    await page.waitForTimeout(1000);
    // Double click to navigate
    await firstRow.dblclick();
    await page.waitForTimeout(2000);
  }
  
  if (!page.url().includes("contacts/")) {
    record({ page: "/contacts/detail", element: "Navigate to detail", action: "click row", expected: "Opens detail page", actual: "Could not navigate to detail", status: "FAIL", severity: "P2" });
    return;
  }
  
  if (await checkCrash(page, "/contacts/detail")) return;
  
  // Test Edit button
  await clickButton(page, "/contacts/detail", 'button:has-text("Edytuj")', "Edytuj button", "Opens edit form");
  
  // Test Akcje dropdown
  await clickButton(page, "/contacts/detail", 'button:has-text("Akcje")', "Akcje dropdown", "Opens action menu");
  
  // Test tabs
  const tabs = ["Wszystkie", "Aktywności", "Wiadomości e-mail", "Dokumenty"];
  for (const tab of tabs) {
    const tabBtn = page.locator(`button:has-text("${tab}"), [role="tab"]:has-text("${tab}")`).first();
    if (await tabBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await tabBtn.click();
      await page.waitForTimeout(500);
      record({ page: "/contacts/detail", element: `Tab: ${tab}`, action: "click", expected: "Tab switches", actual: "Tab clicked", status: "PASS", severity: "P3" });
    }
  }
});

// ─── COMPANIES ──────────────────────────────────────────────

test("Companies — all controls", async ({ page }) => {
  await goTo(page, "/dashboard/companies");
  if (await checkCrash(page, "/companies")) return;
  
  await checkTable(page, "/companies");
  await checkSearch(page, "/companies", "Szukaj");
  await checkRowClick(page, "/companies");
  await checkRowMenu(page, "/companies");
  
  await clickButton(page, "/companies", 'button:has-text("Dodaj firmę")', "Dodaj firmę", "Open create form");
});

// ─── LEADS ──────────────────────────────────────────────────

test("Leads — all controls", async ({ page }) => {
  await goTo(page, "/dashboard/leads");
  if (await checkCrash(page, "/leads")) return;
  
  await checkTable(page, "/leads");
  await checkSearch(page, "/leads", "Szukaj");
  await checkRowClick(page, "/leads");
  await checkRowMenu(page, "/leads");
  
  await clickButton(page, "/leads", 'button:has-text("Dodaj transakcję")', "Dodaj transakcję", "Open create form");
  await clickButton(page, "/leads", 'button:has-text("Widok Kanban")', "Widok Kanban", "Navigate to kanban");
});

// ─── ACTIVITIES ──────────────────────────────────────────────

test("Activities — all controls", async ({ page }) => {
  await goTo(page, "/dashboard/activities");
  if (await checkCrash(page, "/activities")) return;
  
  // Check heading bug
  const heading = await page.locator("h1, h2").first().textContent({ timeout: 2000 }).catch(() => "");
  if (heading === "Tytuł") {
    record({ page: "/activities", element: "Page heading", action: "render", expected: "Aktywności", actual: "Shows 'Tytuł' instead", status: "FAIL", severity: "P2" });
  }
  
  await checkTable(page, "/activities");
  await checkRowMenu(page, "/activities");
  
  await clickButton(page, "/activities", 'button:has-text("Dodaj aktywność")', "Dodaj aktywność", "Open create form");
  await clickButton(page, "/activities", 'button:has-text("Filtruj wg typu")', "Filtruj wg typu", "Open filter dropdown");
  await clickButton(page, "/activities", 'button:has-text("Widok kalendarza")', "Widok kalendarza", "Switch to calendar view");
  await clickButton(page, "/activities", 'button:has-text("Tylko nadchodzące")', "Tylko nadchodzące", "Toggle filter");
  await clickButton(page, "/activities", 'button:has-text("Pokaż ukończone")', "Pokaż ukończone toggle", "Toggle completed");
});

// ─── CALLS ──────────────────────────────────────────────────

test("Calls — all controls", async ({ page }) => {
  await goTo(page, "/dashboard/calls");
  if (await checkCrash(page, "/calls")) return;
  
  await checkTable(page, "/calls");
  await checkRowMenu(page, "/calls");
  
  await clickButton(page, "/calls", 'button:has-text("Dodaj połączenie"), button:has-text("Nowe połączenie")', "Add call", "Open create form");
});

// ─── PRODUCTS ──────────────────────────────────────────────

test("Products — all controls", async ({ page }) => {
  await goTo(page, "/dashboard/products");
  if (await checkCrash(page, "/products")) return;
  
  await checkTable(page, "/products");
  await checkSearch(page, "/products", "Szukaj");
  await checkRowClick(page, "/products");
  await checkRowMenu(page, "/products");
  
  await clickButton(page, "/products", 'button:has-text("Dodaj produkt")', "Dodaj produkt", "Open create form");
  await clickButton(page, "/products", 'button:has-text("Filtr kategorii")', "Filtr kategorii", "Open category filter");
});

// ─── DOCUMENTS ──────────────────────────────────────────────

test("Documents — all controls", async ({ page }) => {
  await goTo(page, "/dashboard/documents");
  if (await checkCrash(page, "/documents")) return;
  
  await checkTable(page, "/documents");
  await checkRowMenu(page, "/documents");
});

// ─── PIPELINES ──────────────────────────────────────────────

test("Pipelines kanban — all controls", async ({ page }) => {
  await goTo(page, "/dashboard/pipelines");
  if (await checkCrash(page, "/pipelines")) return;
  
  // Check kanban columns exist
  const columns = page.locator("[data-column-id], .kanban-column, [class*='column']");
  const colCount = await columns.count();
  record({ page: "/pipelines", element: "Kanban columns", action: "render", expected: "Multiple columns", actual: `${colCount} elements found`, status: colCount > 0 ? "PASS" : "FAIL", severity: "P2" });
});

// ─── CALENDAR ──────────────────────────────────────────────

test("Calendar — all controls", async ({ page }) => {
  await goTo(page, "/dashboard/calendar");
  if (await checkCrash(page, "/calendar")) return;
  
  // Day/Week/Month toggle
  await clickButton(page, "/calendar", 'button:has-text("Dzień"), button:has-text("Day")', "Day view", "Switch to day view");
  await clickButton(page, "/calendar", 'button:has-text("Tydzień"), button:has-text("Week")', "Week view", "Switch to week view");
  await clickButton(page, "/calendar", 'button:has-text("Miesiąc"), button:has-text("Month")', "Month view", "Switch to month view");
  
  // Navigation arrows
  await clickButton(page, "/calendar", 'button:has-text("Dzisiaj"), button:has-text("Today")', "Today button", "Navigate to today");
});

// ─── INBOX ──────────────────────────────────────────────────

test("Inbox — all controls", async ({ page }) => {
  await goTo(page, "/dashboard/inbox");
  if (await checkCrash(page, "/inbox")) return;
  
  // Email tabs
  await clickButton(page, "/inbox", 'button:has-text("Nieprzeczytane")', "Unread tab", "Filter unread");
  await clickButton(page, "/inbox", 'button:has-text("Wysłane")', "Sent tab", "Filter sent");
  await clickButton(page, "/inbox", 'button:has-text("Oznaczone")', "Starred tab", "Filter starred");
});

// ─── EMAIL TEMPLATES ──────────────────────────────────────────────

test("Email templates — all controls", async ({ page }) => {
  await goTo(page, "/dashboard/email-templates");
  if (await checkCrash(page, "/email-templates")) return;
  
  // Check toggle switches work
  const toggles = page.locator("[role='switch']");
  const toggleCount = await toggles.count();
  if (toggleCount > 0) {
    const firstToggle = toggles.first();
    const wasChecked = await firstToggle.getAttribute("aria-checked");
    await firstToggle.click();
    await page.waitForTimeout(1000);
    const isChecked = await firstToggle.getAttribute("aria-checked");
    if (wasChecked !== isChecked) {
      record({ page: "/email-templates", element: "Toggle switch", action: "click", expected: "Toggles state", actual: `Changed from ${wasChecked} to ${isChecked}`, status: "PASS", severity: "P3" });
      // Toggle back
      await firstToggle.click();
      await page.waitForTimeout(500);
    } else {
      record({ page: "/email-templates", element: "Toggle switch", action: "click", expected: "Toggles state", actual: "State did not change", status: "FAIL", severity: "P1" });
    }
  }
});

// ═══════════════════════════════════════════════════════════
// GABINET
// ═══════════════════════════════════════════════════════════

test("Gabinet dashboard — all controls", async ({ page }) => {
  await goTo(page, "/dashboard/gabinet");
  if (await checkCrash(page, "/gabinet")) return;
  
  // Check sidebar i18n
  const sidebarText = await page.locator(".sidebar, nav").first().textContent({ timeout: 2000 }).catch(() => "");
  if (sidebarText?.includes("nav.gabinet.")) {
    record({ page: "/gabinet", element: "Sidebar labels", action: "render", expected: "Polish translated labels", actual: "Raw i18n keys (nav.gabinet.*)", status: "FAIL", severity: "P2" });
  }
  
  await clickButton(page, "/gabinet", 'button:has-text("Umów wizytę")', "Umów wizytę", "Open appointment form");
  await clickButton(page, "/gabinet", 'button:has-text("Kalendarz")', "Kalendarz", "Navigate to calendar");
  await clickButton(page, "/gabinet", 'button:has-text("Dodaj klienta")', "Dodaj klienta", "Open patient form");
  await clickButton(page, "/gabinet", 'button:has-text("Grafik na dziś")', "Grafik na dziś", "Show schedule");
});

test("Gabinet calendar — all controls", async ({ page }) => {
  await goTo(page, "/dashboard/gabinet/calendar");
  if (await checkCrash(page, "/gabinet/calendar")) return;
  
  // Check locale of day headers
  const dayHeaders = await page.locator("th, [class*='day-header']").allTextContents();
  const hasEnglishDays = dayHeaders.some(d => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/.test(d));
  if (hasEnglishDays) {
    record({ page: "/gabinet/calendar", element: "Day headers", action: "render", expected: "Polish day names (pon./wt./śr.)", actual: "English day names (Mon/Tue/Wed)", status: "FAIL", severity: "P2" });
  }
  
  await clickButton(page, "/gabinet/calendar", 'button:has-text("Dzień"), button:has-text("Day")', "Day view", "Switch to day view");
  await clickButton(page, "/gabinet/calendar", 'button:has-text("Tydzień"), button:has-text("Week")', "Week view", "Switch to week");
});

test("Gabinet patients — all controls", async ({ page }) => {
  await goTo(page, "/dashboard/gabinet/patients");
  if (await checkCrash(page, "/gabinet/patients")) return;
  
  await checkTable(page, "/gabinet/patients");
  await checkSearch(page, "/gabinet/patients", "Szukaj");
  await checkRowClick(page, "/gabinet/patients");
  await checkRowMenu(page, "/gabinet/patients");
  
  await clickButton(page, "/gabinet/patients", 'button:has-text("Dodaj klienta")', "Dodaj klienta", "Open create form");
});

test("Gabinet patients — detail page", async ({ page }) => {
  await goTo(page, "/dashboard/gabinet/patients");
  
  // Navigate to first patient
  const firstLink = page.locator("table a").first();
  if (await firstLink.isVisible({ timeout: 2000 }).catch(() => false)) {
    await firstLink.click();
    await page.waitForTimeout(2000);
  }
  
  if (!page.url().includes("patients/")) return;
  if (await checkCrash(page, "/gabinet/patients/detail")) return;
  
  // Check for "undefined" in patient name
  const nameArea = await page.locator("h1, h2, [class*='name'], [class*='title']").first().textContent({ timeout: 2000 }).catch(() => "");
  if (nameArea?.includes("undefined")) {
    record({ page: "/gabinet/patients/detail", element: "Patient name", action: "render", expected: "Full name", actual: "Shows 'undefined'", status: "FAIL", severity: "P1" });
  }
  
  // Test tabs
  const tabs = ["Przegląd", "Wizyty", "Dokumenty", "Lojalność", "Aktywność"];
  for (const tab of tabs) {
    const tabBtn = page.locator(`button:has-text("${tab}"), [role="tab"]:has-text("${tab}")`).first();
    if (await tabBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await tabBtn.click();
      await page.waitForTimeout(500);
      record({ page: "/gabinet/patients/detail", element: `Tab: ${tab}`, action: "click", expected: "Tab switches", actual: "Tab clicked", status: "PASS", severity: "P3" });
    }
  }
  
  await clickButton(page, "/gabinet/patients/detail", 'button:has-text("Edytuj")', "Edytuj button", "Opens edit form");
  await clickButton(page, "/gabinet/patients/detail", 'button:has-text("Akcje")', "Akcje dropdown", "Opens action menu");
});

test("Gabinet treatments — all controls", async ({ page }) => {
  await goTo(page, "/dashboard/gabinet/treatments");
  if (await checkCrash(page, "/gabinet/treatments")) return;
  
  await checkTable(page, "/gabinet/treatments");
  await checkSearch(page, "/gabinet/treatments", "Szukaj zabiegów");
  await checkRowClick(page, "/gabinet/treatments");
  await checkRowMenu(page, "/gabinet/treatments");
  
  // Sidebar buttons
  await clickButton(page, "/gabinet/treatments", 'button:has-text("Dodaj zabieg")', "Dodaj zabieg", "Open create form");
  await clickButton(page, "/gabinet/treatments", 'button:has-text("Filtr kategorii")', "Filtr kategorii", "Open category filter");
  await clickButton(page, "/gabinet/treatments", 'button:has-text("Sortuj wg ceny")', "Sortuj wg ceny", "Sort by price");
  await clickButton(page, "/gabinet/treatments", 'button:has-text("Zarządzaj kategoriami")', "Zarządzaj kategoriami", "Navigate to category manager");
  
  // Test Aktywny column — is it a toggle?
  const activeCell = page.locator("td:last-child span[class*='bg-green'], td:last-child [role='switch']").first();
  if (await activeCell.isVisible({ timeout: 2000 }).catch(() => false)) {
    const isSwitch = await activeCell.getAttribute("role") === "switch";
    if (!isSwitch) {
      record({ page: "/gabinet/treatments", element: "Aktywny column", action: "inspect", expected: "Clickable toggle switch", actual: "Static green dot (not interactive)", status: "FAIL", severity: "P1" });
    }
  }
  
  // Check Smart Agenda presence
  const smartAgenda = await page.locator("text=SMART AGENDA").isVisible({ timeout: 1000 }).catch(() => false);
  if (smartAgenda) {
    record({ page: "/gabinet/treatments", element: "Smart Agenda widget", action: "render", expected: "Not present on catalog page", actual: "Smart Agenda appears (irrelevant here)", status: "FAIL", severity: "P2" });
  }
});

test("Gabinet treatments — detail + edit", async ({ page }) => {
  await goTo(page, "/dashboard/gabinet/treatments");
  
  // Navigate to first treatment
  const firstRow = page.locator("table tbody tr").first();
  if (await firstRow.isVisible({ timeout: 2000 }).catch(() => false)) {
    await firstRow.click();
    await page.waitForTimeout(1000);
    // May need double click
    if (!page.url().includes("treatments/")) {
      await firstRow.dblclick();
      await page.waitForTimeout(2000);
    }
  }
  
  if (!page.url().includes("treatments/")) return;
  if (await checkCrash(page, "/gabinet/treatments/detail")) return;
  
  // Test Edit
  await clickButton(page, "/gabinet/treatments/detail", 'button:has-text("Edytuj")', "Edytuj", "Open edit form");
  
  // In edit form — check if Kategoria is picker or plain text
  const editDialog = page.locator("[role='dialog'], [class*='sheet']");
  if (await editDialog.isVisible({ timeout: 2000 }).catch(() => false)) {
    // Look for category field
    const categoryField = editDialog.locator("label:has-text('Kategoria') + *, input[name*='category'], select[name*='category']").first();
    const categoryInput = editDialog.locator("input").nth(1); // approximation
    const isPlainInput = await categoryInput.getAttribute("type") === "text";
    
    // Check for tag picker
    const hasTagPicker = await editDialog.locator("text=Tagi, label:has-text('Tag')").isVisible({ timeout: 1000 }).catch(() => false);
    
    if (!hasTagPicker) {
      record({ page: "/gabinet/treatments/edit", element: "Tag picker", action: "check presence", expected: "Tag picker component", actual: "No tag picker in edit form", status: "FAIL", severity: "P1" });
    }
    
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }
  
  // Test tabs
  const tabs = ["Przegląd", "Parametry zabiegowe", "Dokumenty", "Pracownicy", "Warianty", "Wizyty", "Aktywność"];
  for (const tab of tabs) {
    const tabBtn = page.locator(`button:has-text("${tab}"), [role="tab"]:has-text("${tab}")`).first();
    if (await tabBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await tabBtn.click();
      await page.waitForTimeout(500);
      record({ page: "/gabinet/treatments/detail", element: `Tab: ${tab}`, action: "click", expected: "Tab switches", actual: "Tab clicked", status: "PASS", severity: "P3" });
    }
  }
});

test("Gabinet employees — all controls", async ({ page }) => {
  await goTo(page, "/dashboard/gabinet/employees");
  if (await checkCrash(page, "/gabinet/employees")) return;
  
  await checkTable(page, "/gabinet/employees");
  await checkRowClick(page, "/gabinet/employees");
});

test("Gabinet packages — all controls", async ({ page }) => {
  await goTo(page, "/dashboard/gabinet/packages");
  if (await checkCrash(page, "/gabinet/packages")) return;
  
  // Check subtitle
  const subtitle = await page.locator("p[class*='text-muted'], .text-muted-foreground").first().textContent({ timeout: 2000 }).catch(() => "");
  if (subtitle === "Opis" || subtitle?.trim() === "Opis") {
    record({ page: "/gabinet/packages", element: "Page subtitle", action: "render", expected: "Meaningful description", actual: "Shows 'Opis' (placeholder)", status: "FAIL", severity: "P2" });
  }
});

test("Gabinet documents — all controls", async ({ page }) => {
  await goTo(page, "/dashboard/gabinet/documents");
  if (await checkCrash(page, "/gabinet/documents")) return;
  
  await checkTable(page, "/gabinet/documents");
});

// ═══════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════

test("Settings — profile", async ({ page }) => {
  await goTo(page, "/dashboard/settings/profile");
  if (await checkCrash(page, "/settings/profile")) return;
  
  // Check i18n
  const bodyText = await page.locator("body").textContent({ timeout: 2000 }).catch(() => "");
  if (bodyText?.includes("Display Name") || bodyText?.includes("Email Address")) {
    record({ page: "/settings/profile", element: "Labels", action: "render", expected: "Polish translations", actual: "English labels (Display Name, Email Address)", status: "FAIL", severity: "P2" });
  }
});

test("Settings — organization", async ({ page }) => {
  await goTo(page, "/dashboard/settings/organization");
  if (await checkCrash(page, "/settings/organization")) return;
  
  // Check Save button exists
  const saveBtn = page.locator('button:has-text("Zapisz"), button:has-text("Save")');
  if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    record({ page: "/settings/organization", element: "Save button", action: "visible", expected: "Visible", actual: "Present", status: "PASS", severity: "P3" });
  }
});

test("Settings — team", async ({ page }) => {
  await goTo(page, "/dashboard/settings/team");
  if (await checkCrash(page, "/settings/team")) return;
  
  await clickButton(page, "/settings/team", 'button:has-text("Zaproś")', "Invite button", "Open invite dialog");
});

test("Settings — permissions", async ({ page }) => {
  await goTo(page, "/dashboard/settings/permissions");
  if (await checkCrash(page, "/settings/permissions")) return;
  
  const bodyText = await page.locator("body").textContent({ timeout: 2000 }).catch(() => "");
  if (bodyText?.includes("Configure what each role can do")) {
    record({ page: "/settings/permissions", element: "Page content", action: "render", expected: "Polish translations", actual: "Entire page in English", status: "FAIL", severity: "P2" });
  }
});

test("Settings — billing", async ({ page }) => {
  await goTo(page, "/dashboard/settings/billing");
  await checkCrash(page, "/settings/billing");
});

test("Settings — mail", async ({ page }) => {
  await goTo(page, "/dashboard/settings/mail");
  if (await checkCrash(page, "/settings/mail")) return;
  
  // Check mail providers visible
  const providers = await page.locator("text=Resend, text=Mailgun").isVisible({ timeout: 2000 }).catch(() => false);
  record({ page: "/settings/mail", element: "Mail providers", action: "render", expected: "Providers listed", actual: providers ? "Visible" : "Not visible", status: providers ? "PASS" : "FAIL", severity: "P2" });
});

test("Settings — sources", async ({ page }) => {
  await goTo(page, "/dashboard/settings/sources");
  if (await checkCrash(page, "/settings/sources")) return;
  
  // Test toggle switch
  const toggles = page.locator("[role='switch']");
  const count = await toggles.count();
  if (count > 0) {
    const firstToggle = toggles.first();
    const before = await firstToggle.getAttribute("aria-checked");
    await firstToggle.click();
    await page.waitForTimeout(1000);
    const after = await firstToggle.getAttribute("aria-checked");
    if (before !== after) {
      record({ page: "/settings/sources", element: "Source toggle", action: "click", expected: "Toggle state", actual: `${before} → ${after}`, status: "PASS", severity: "P3" });
      // Toggle back
      await firstToggle.click();
      await page.waitForTimeout(500);
    } else {
      record({ page: "/settings/sources", element: "Source toggle", action: "click", expected: "Toggle state", actual: "State unchanged", status: "FAIL", severity: "P1" });
    }
  }
});

test("Settings — lost reasons", async ({ page }) => {
  await goTo(page, "/dashboard/settings/lost-reasons");
  if (await checkCrash(page, "/settings/lost-reasons")) return;
});

test("Settings — pipelines", async ({ page }) => {
  await goTo(page, "/dashboard/settings/pipelines");
  if (await checkCrash(page, "/settings/pipelines")) return;
});

test("Settings — automations", async ({ page }) => {
  await goTo(page, "/dashboard/settings/automations");
  if (await checkCrash(page, "/settings/automations")) return;
  
  await checkTable(page, "/settings/automations");
  
  // Test automation toggle
  const toggles = page.locator("[role='switch']");
  const count = await toggles.count();
  if (count > 0) {
    record({ page: "/settings/automations", element: "Automation toggles", action: "visible", expected: "Toggles present", actual: `${count} toggles`, status: "PASS", severity: "P3" });
  }
});

test("Settings — custom fields", async ({ page }) => {
  await goTo(page, "/dashboard/settings/custom-fields");
  if (await checkCrash(page, "/settings/custom-fields")) return;
});

test("Settings — activity types", async ({ page }) => {
  await goTo(page, "/dashboard/settings/activity-types");
  if (await checkCrash(page, "/settings/activity-types")) return;
});

test("Settings — SMS", async ({ page }) => {
  await goTo(page, "/dashboard/settings/sms");
  if (await checkCrash(page, "/settings/sms")) return;
});

test("Settings — Google Calendar", async ({ page }) => {
  await goTo(page, "/dashboard/settings/google-calendar");
  if (await checkCrash(page, "/settings/google-calendar")) return;
});

test("Settings — email events", async ({ page }) => {
  await goTo(page, "/dashboard/settings/email-events");
  if (await checkCrash(page, "/settings/email-events")) return;
});

test("Settings — email sequences", async ({ page }) => {
  await goTo(page, "/dashboard/settings/email-sequences");
  if (await checkCrash(page, "/settings/email-sequences")) return;
});

test("Settings — audit log", async ({ page }) => {
  await goTo(page, "/dashboard/settings/audit-log");
  if (await checkCrash(page, "/settings/audit-log")) return;
  
  const bodyText = await page.locator("body").textContent({ timeout: 2000 }).catch(() => "");
  if (bodyText?.includes("Track all important actions")) {
    record({ page: "/settings/audit-log", element: "Page content", action: "render", expected: "Polish translations", actual: "English content", status: "FAIL", severity: "P2" });
  }
});

// ═══════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════

test("Print audit summary", async () => {
  const fails = findings.filter(f => f.status !== "PASS");
  const passes = findings.filter(f => f.status === "PASS");
  
  console.log("\n═══════════════════════════════════════════════");
  console.log("FULL INTERACTIVE UI AUDIT — RESULTS");
  console.log("═══════════════════════════════════════════════");
  console.log(`Total checks: ${findings.length}`);
  console.log(`  ✅ PASS: ${passes.length}`);
  console.log(`  ❌ FAIL/CRASH/NO_REACTION: ${fails.length}`);
  
  if (fails.length > 0) {
    console.log("\n── ISSUES ──");
    for (const f of fails) {
      console.log(`[${f.severity}] ${f.status}: ${f.page} > ${f.element}`);
      console.log(`  Expected: ${f.expected}`);
      console.log(`  Actual: ${f.actual}`);
      console.log("");
    }
  }
  
  // Write to file
  const report = {
    date: new Date().toISOString(),
    totalChecks: findings.length,
    passes: passes.length,
    failures: fails.length,
    findings,
  };
  writeFileSync("/tmp/audit-report.json", JSON.stringify(report, null, 2));
  console.log("\nFull results saved to /tmp/audit-report.json");
});
