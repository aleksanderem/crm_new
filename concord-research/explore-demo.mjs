import { chromium } from "playwright";
import fs from "fs";

const BASE = "https://demo.concordcrm.com";
const SCREENSHOTS = "./concord-research/screenshots";

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  const notes = [];
  const log = (section, text) => {
    notes.push(`\n## ${section}\n${text}`);
    console.log(`[${section}] done`);
  };

  // --- LOGIN ---
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });

  await page.locator('input[name="email"]').fill("admin@test.com");
  await page.locator('input[name="password"]').fill("concord-demo");
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${SCREENSHOTS}/02-after-login.png`, fullPage: true });
  console.log(`After login URL: ${page.url()}`);

  if (page.url().includes("login")) {
    console.log("Login still failed!");
    await browser.close();
    return;
  }

  // --- DISCOVER NAVIGATION ---
  const navLinks = await page.evaluate(() => {
    const links = [...document.querySelectorAll("nav a, aside a, .sidebar a, [role='navigation'] a, .navbar a")];
    return links
      .map((l) => ({ text: l.textContent?.trim().replace(/\s+/g, " "), href: l.href }))
      .filter((l) => l.text && l.href && !l.href.includes("javascript:"));
  });
  log("Navigation", JSON.stringify(navLinks, null, 2));

  // Helper to collect detailed page info
  async function collectPageInfo(name, screenshotName) {
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${SCREENSHOTS}/${screenshotName}.png`, fullPage: true });

    const info = await page.evaluate(() => {
      const headings = [...document.querySelectorAll("h1, h2, h3, h4, h5")]
        .map((h) => `${h.tagName}: ${h.textContent?.trim().slice(0, 120)}`)
        .slice(0, 25);

      const buttons = [...document.querySelectorAll("button, [role='button'], a.btn")]
        .map((b) => b.textContent?.trim().replace(/\s+/g, " ").slice(0, 80))
        .filter((t) => t && t.length > 0)
        .slice(0, 40);

      const tables = [...document.querySelectorAll("table")].map((t) => {
        const headers = [...t.querySelectorAll("th")].map((th) =>
          th.textContent?.trim().slice(0, 50)
        );
        const rowCount = t.querySelectorAll("tbody tr").length;
        return { headers, rowCount };
      });

      const inputs = [...document.querySelectorAll("input, select, textarea")]
        .map((i) => ({
          tag: i.tagName.toLowerCase(),
          type: i.type || "",
          name: i.name || "",
          placeholder: i.placeholder || "",
          label:
            i.closest("label")?.textContent?.trim().slice(0, 50) ||
            document.querySelector(`label[for="${i.id}"]`)?.textContent?.trim().slice(0, 50) ||
            "",
        }))
        .filter((i) => i.type !== "hidden")
        .slice(0, 40);

      const tabs = [
        ...document.querySelectorAll(
          '[role="tab"], .nav-tab, [data-headlessui-state], .tab-item, a[class*="tab"], button[class*="tab"]'
        ),
      ]
        .map((t) => t.textContent?.trim().replace(/\s+/g, " ").slice(0, 50))
        .filter(Boolean);

      // Cards / widgets
      const cards = [...document.querySelectorAll(".card, [class*='card'], [class*='widget'], [class*='Card']")]
        .map((c) => {
          const title = c.querySelector("h2, h3, h4, .card-title, .card-header")?.textContent?.trim().slice(0, 80);
          return title;
        })
        .filter(Boolean)
        .slice(0, 20);

      // Dropdowns / selects
      const selects = [...document.querySelectorAll("select")]
        .map((s) => ({
          name: s.name,
          options: [...s.querySelectorAll("option")].map((o) => o.textContent?.trim()).slice(0, 10),
        }))
        .slice(0, 10);

      // Modals currently visible
      const modals = [...document.querySelectorAll('[role="dialog"], .modal.show, [class*="modal"][class*="open"]')]
        .map((m) => m.querySelector("h2, h3, .modal-title")?.textContent?.trim())
        .filter(Boolean);

      return { headings, buttons, tables, inputs, tabs, cards, selects, modals };
    });

    log(name, [
      `URL: ${page.url()}`,
      `Headings: ${JSON.stringify(info.headings)}`,
      `Buttons: ${JSON.stringify(info.buttons)}`,
      `Tables: ${JSON.stringify(info.tables)}`,
      `Inputs/Forms: ${JSON.stringify(info.inputs)}`,
      `Tabs: ${JSON.stringify(info.tabs)}`,
      `Cards/Widgets: ${JSON.stringify(info.cards)}`,
      `Selects: ${JSON.stringify(info.selects)}`,
      `Modals: ${JSON.stringify(info.modals)}`,
    ].join("\n"));

    return info;
  }

  // --- DASHBOARD ---
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 20000 });
  await collectPageInfo("Dashboard", "03-dashboard");

  // --- DEALS ---
  await page.goto(`${BASE}/deals`, { waitUntil: "networkidle", timeout: 20000 });
  await collectPageInfo("Deals (Board View)", "04-deals-board");

  // Try switching to table view
  const tableViewBtn = page.locator('button:has-text("Table"), [aria-label*="table"], [title*="Table"]').first();
  if (await tableViewBtn.count() > 0) {
    await tableViewBtn.click();
    await page.waitForTimeout(2000);
    await collectPageInfo("Deals (Table View)", "04b-deals-table");
  }

  // Click first deal for detail view
  try {
    const dealLink = page.locator("a[href*='/deals/']").first();
    if (await dealLink.count() > 0) {
      await dealLink.click();
      await page.waitForTimeout(3000);
      await collectPageInfo("Deal Detail", "05-deal-detail");

      // Scroll down for more sections
      await page.evaluate(() => window.scrollTo(0, 1000));
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${SCREENSHOTS}/05b-deal-detail-scrolled.png`, fullPage: true });
    }
  } catch (e) {
    log("Deal Detail", `ERROR: ${e.message}`);
  }

  // --- CONTACTS ---
  await page.goto(`${BASE}/contacts`, { waitUntil: "networkidle", timeout: 20000 });
  await collectPageInfo("Contacts List", "06-contacts");

  // Click first contact
  try {
    const contactLink = page.locator("a[href*='/contacts/']").first();
    if (await contactLink.count() > 0) {
      await contactLink.click();
      await page.waitForTimeout(3000);
      await collectPageInfo("Contact Detail", "07-contact-detail");
      await page.evaluate(() => window.scrollTo(0, 1000));
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${SCREENSHOTS}/07b-contact-detail-scrolled.png`, fullPage: true });
    }
  } catch (e) {
    log("Contact Detail", `ERROR: ${e.message}`);
  }

  // --- COMPANIES ---
  await page.goto(`${BASE}/companies`, { waitUntil: "networkidle", timeout: 20000 });
  await collectPageInfo("Companies List", "08-companies");

  try {
    const companyLink = page.locator("a[href*='/companies/']").first();
    if (await companyLink.count() > 0) {
      await companyLink.click();
      await page.waitForTimeout(3000);
      await collectPageInfo("Company Detail", "09-company-detail");
    }
  } catch (e) {
    log("Company Detail", `ERROR: ${e.message}`);
  }

  // --- INBOX ---
  await page.goto(`${BASE}/inbox`, { waitUntil: "networkidle", timeout: 20000 });
  await collectPageInfo("Inbox", "10-inbox");

  // --- CALENDAR ---
  await page.goto(`${BASE}/calendar`, { waitUntil: "networkidle", timeout: 20000 });
  await collectPageInfo("Calendar", "11-calendar");

  // --- DOCUMENTS ---
  await page.goto(`${BASE}/documents`, { waitUntil: "networkidle", timeout: 20000 });
  await collectPageInfo("Documents", "12-documents");

  // --- CALLS ---
  await page.goto(`${BASE}/calls`, { waitUntil: "networkidle", timeout: 20000 });
  await collectPageInfo("Calls", "13-calls");

  // --- ACTIVITIES ---
  await page.goto(`${BASE}/activities`, { waitUntil: "networkidle", timeout: 20000 });
  await collectPageInfo("Activities", "14-activities");

  // --- PRODUCTS ---
  try {
    await page.goto(`${BASE}/products`, { waitUntil: "networkidle", timeout: 20000 });
    await collectPageInfo("Products", "15-products");
  } catch (e) {
    log("Products", `ERROR: ${e.message}`);
  }

  // --- SETTINGS - Main ---
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle", timeout: 20000 });
  await collectPageInfo("Settings Main", "16-settings");

  // Discover settings subsections
  const settingsSubLinks = await page.evaluate(() => {
    const links = [...document.querySelectorAll("a[href*='/settings']")];
    return links
      .map((l) => ({ text: l.textContent?.trim().replace(/\s+/g, " "), href: l.href }))
      .filter((l) => l.text && l.href);
  });
  log("Settings Subsections", JSON.stringify(settingsSubLinks, null, 2));

  // Visit key settings subsections
  const settingSections = [
    "general", "deals", "contacts", "companies",
    "fields", "workflows", "mailboxes", "integrations",
    "roles", "users",
  ];
  for (const section of settingSections) {
    try {
      await page.goto(`${BASE}/settings/${section}`, { waitUntil: "networkidle", timeout: 15000 });
      if (!page.url().includes("login")) {
        await collectPageInfo(`Settings > ${section}`, `17-settings-${section}`);
      }
    } catch (e) {
      // ignore
    }
  }

  // --- EXPLORE CREATE/NEW MODALS ---
  // Try creating a new deal
  await page.goto(`${BASE}/deals`, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForTimeout(1500);
  const createDealBtn = page.locator('button:has-text("Create"), a:has-text("Create Deal"), button:has-text("New"), a:has-text("New Deal")').first();
  if (await createDealBtn.count() > 0) {
    await createDealBtn.click();
    await page.waitForTimeout(2000);
    await collectPageInfo("Create Deal Modal/Form", "18-create-deal");
  }

  // Try creating a new contact
  await page.goto(`${BASE}/contacts`, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForTimeout(1500);
  const createContactBtn = page.locator('button:has-text("Create"), a:has-text("Create Contact"), button:has-text("New")').first();
  if (await createContactBtn.count() > 0) {
    await createContactBtn.click();
    await page.waitForTimeout(2000);
    await collectPageInfo("Create Contact Modal/Form", "19-create-contact");
  }

  // --- WRITE FULL NOTES ---
  const output = `# Concord CRM Demo - Detailed Research Notes\nGenerated: ${new Date().toISOString()}\n${notes.join("\n")}`;
  fs.writeFileSync("./concord-research/notes.md", output, "utf-8");
  console.log("\nDone! Notes saved to concord-research/notes.md");
  console.log(`Screenshots: ${fs.readdirSync(SCREENSHOTS).length} files`);

  await browser.close();
}

run().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
