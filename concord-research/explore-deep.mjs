import { chromium } from "playwright";
import fs from "fs";

const BASE = "https://demo.concordcrm.com";
const SS = "./concord-research/screenshots";

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const notes = [];
  const log = (s, t) => { notes.push(`\n## ${s}\n${t}`); console.log(`[${s}] done`); };

  // Login
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator('input[name="email"]').fill("admin@test.com");
  await page.locator('input[name="password"]').fill("concord-demo");
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(5000);

  // =============================================
  // 1. DEALS KANBAN / BOARD VIEW
  // =============================================
  await page.goto(`${BASE}/deals`, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForTimeout(2000);

  // Look for board/kanban view toggle
  const viewToggles = await page.evaluate(() => {
    // Find any buttons/icons that might switch views
    const btns = [...document.querySelectorAll('button, a, [role="tab"]')];
    return btns
      .filter(b => {
        const text = (b.textContent || '').toLowerCase();
        const title = (b.getAttribute('title') || '').toLowerCase();
        const ariaLabel = (b.getAttribute('aria-label') || '').toLowerCase();
        const classList = (typeof b.className === 'string' ? b.className : '').toLowerCase();
        return text.includes('board') || text.includes('kanban') || title.includes('board') ||
               ariaLabel.includes('board') || classList.includes('board') ||
               title.includes('kanban') || ariaLabel.includes('kanban');
      })
      .map(b => ({
        tag: b.tagName,
        text: b.textContent?.trim().slice(0, 60),
        title: b.getAttribute('title'),
        ariaLabel: b.getAttribute('aria-label'),
        class: b.className?.toString().slice(0, 100),
      }));
  });
  log("Board View Toggles", JSON.stringify(viewToggles, null, 2));

  // Try clicking on any icon that looks like a board/grid icon in the deals toolbar
  // Look for SVG icons or icon buttons near the top
  const toolbarBtns = await page.evaluate(() => {
    const toolbar = document.querySelector('.toolbar, [class*="toolbar"], [class*="header"]');
    const allBtns = [...document.querySelectorAll('button')];
    return allBtns.slice(0, 30).map(b => ({
      text: b.textContent?.trim().slice(0, 40),
      title: b.getAttribute('title') || '',
      ariaLabel: b.getAttribute('aria-label') || '',
      class: (typeof b.className === 'string' ? b.className : '').slice(0, 80),
      hasIcon: b.querySelector('svg') !== null,
    }));
  });
  log("All Toolbar Buttons", JSON.stringify(toolbarBtns, null, 2));

  // Try navigating to deals with board parameter
  await page.goto(`${BASE}/deals/board`, { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SS}/deep-01-deals-board-url.png`, fullPage: true });
  log("Deals /board URL", `URL: ${page.url()}`);

  // Try ?view=board parameter
  await page.goto(`${BASE}/deals?board`, { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SS}/deep-02-deals-board-param.png`, fullPage: true });

  // Check if there's a Kanban view in deals page by looking at the actual page
  await page.goto(`${BASE}/deals`, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForTimeout(2000);

  // Look for any toggle switches or view options
  const viewOptions = await page.evaluate(() => {
    // Check all clickable elements
    const elements = [...document.querySelectorAll('[class*="view"], [class*="toggle"], [class*="switch"], [data-view], [class*="board"], [class*="kanban"], [class*="pipeline"]')];
    return elements.map(e => ({
      tag: e.tagName,
      text: e.textContent?.trim().slice(0, 60),
      class: e.className?.toString().slice(0, 100),
      id: e.id,
    })).slice(0, 20);
  });
  log("View Options Elements", JSON.stringify(viewOptions, null, 2));

  // Take a full page screenshot of the deals page to look for the view toggle
  await page.screenshot({ path: `${SS}/deep-03-deals-full.png`, fullPage: false });

  // =============================================
  // 2. CLICK INTO A DEAL ROW - SLIDEOVER/DRAWER
  // =============================================
  await page.goto(`${BASE}/deals`, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForTimeout(2000);

  // Click on a deal name in the table (not the hidden /deals/create link)
  const dealClicked = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('table tbody tr')];
    if (rows.length > 0) {
      const firstRow = rows[0];
      const nameLink = firstRow.querySelector('a[href*="/deals/"]');
      const nameCell = firstRow.querySelector('td');
      return {
        nameLink: nameLink ? { href: nameLink.href, text: nameLink.textContent?.trim() } : null,
        nameCell: nameCell?.textContent?.trim().slice(0, 60),
        allLinks: [...firstRow.querySelectorAll('a')].map(a => ({ href: a.href, text: a.textContent?.trim().slice(0, 40) })),
      };
    }
    return null;
  });
  log("Deal Row Info", JSON.stringify(dealClicked, null, 2));

  // Click on the first deal row name cell
  try {
    // Try clicking on td text that looks like a deal name
    const firstDealRow = page.locator('table tbody tr').first();
    await firstDealRow.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SS}/deep-04-deal-row-click.png`, fullPage: true });

    // Check for drawer/slideover/modal
    const overlays = await page.evaluate(() => {
      const panels = [...document.querySelectorAll('[class*="drawer"], [class*="slide"], [class*="panel"], [class*="modal"], [class*="overlay"], [role="dialog"], [class*="sidebar"][class*="right"], [class*="offcanvas"]')];
      return panels.map(p => ({
        tag: p.tagName,
        class: p.className?.toString().slice(0, 150),
        role: p.getAttribute('role'),
        visible: p.offsetParent !== null || p.style.display !== 'none',
        width: p.offsetWidth,
        height: p.offsetHeight,
        headings: [...p.querySelectorAll('h1,h2,h3,h4')].map(h => h.textContent?.trim().slice(0, 60)),
      }));
    });
    log("After Deal Row Click - Overlays", JSON.stringify(overlays, null, 2));

    // Also check the URL changed
    log("After Deal Click URL", page.url());
  } catch (e) {
    log("Deal Row Click", `ERROR: ${e.message}`);
  }

  // Try navigating directly to a deal detail page
  await page.goto(`${BASE}/deals/1`, { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SS}/deep-05-deal-detail-page.png`, fullPage: true });

  const dealDetailInfo = await page.evaluate(() => {
    const headings = [...document.querySelectorAll('h1,h2,h3,h4')]
      .map(h => `${h.tagName}: ${h.textContent?.trim().slice(0, 100)}`).slice(0, 20);
    const tabs = [...document.querySelectorAll('[role="tab"], [class*="tab-"]')]
      .map(t => t.textContent?.trim().slice(0, 50)).filter(Boolean);
    const sections = [...document.querySelectorAll('section, [class*="section"], [class*="card"], .panel')]
      .map(s => {
        const title = s.querySelector('h2,h3,h4,.title')?.textContent?.trim().slice(0, 60);
        return title;
      }).filter(Boolean).slice(0, 20);
    const sidebarFields = [...document.querySelectorAll('label, dt, .field-label, [class*="label"]')]
      .map(l => l.textContent?.trim().slice(0, 50)).filter(Boolean).slice(0, 30);
    return { headings, tabs, sections, sidebarFields };
  });
  log("Deal Detail Page", JSON.stringify(dealDetailInfo, null, 2));

  // Scroll down to see more
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SS}/deep-05b-deal-detail-scrolled.png`, fullPage: true });

  // =============================================
  // 3. CONTACT DETAIL - SLIDEOVER/ASSOCIATIONS
  // =============================================
  await page.goto(`${BASE}/contacts/1`, { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SS}/deep-06-contact-detail.png`, fullPage: true });

  const contactDetailInfo = await page.evaluate(() => {
    const headings = [...document.querySelectorAll('h1,h2,h3,h4')]
      .map(h => `${h.tagName}: ${h.textContent?.trim().slice(0, 100)}`).slice(0, 20);
    const tabs = [...document.querySelectorAll('[role="tab"], [class*="tab"]')]
      .map(t => t.textContent?.trim().replace(/\s+/g, ' ').slice(0, 50)).filter(Boolean);
    const sidebarLabels = [...document.querySelectorAll('label, dt, [class*="field-label"], [class*="label"]')]
      .map(l => l.textContent?.trim().slice(0, 50)).filter(t => t && t.length > 1).slice(0, 40);
    const buttons = [...document.querySelectorAll('button')]
      .map(b => b.textContent?.trim().replace(/\s+/g, ' ').slice(0, 50)).filter(Boolean).slice(0, 30);
    return { headings, tabs, sidebarLabels, buttons };
  });
  log("Contact Detail Page", JSON.stringify(contactDetailInfo, null, 2));

  // Scroll to see associations section
  await page.evaluate(() => window.scrollTo(0, 800));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SS}/deep-06b-contact-detail-scrolled.png`, fullPage: true });

  // =============================================
  // 4. COMPANY DETAIL
  // =============================================
  await page.goto(`${BASE}/companies/1`, { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SS}/deep-07-company-detail.png`, fullPage: true });

  const companyDetailInfo = await page.evaluate(() => {
    const headings = [...document.querySelectorAll('h1,h2,h3,h4')]
      .map(h => `${h.tagName}: ${h.textContent?.trim().slice(0, 100)}`).slice(0, 20);
    const tabs = [...document.querySelectorAll('[role="tab"], [class*="tab"]')]
      .map(t => t.textContent?.trim().replace(/\s+/g, ' ').slice(0, 50)).filter(Boolean);
    return { headings, tabs };
  });
  log("Company Detail Page", JSON.stringify(companyDetailInfo, null, 2));

  // =============================================
  // 5. DATATABLE FEATURES - Column config, sorting, actions
  // =============================================
  await page.goto(`${BASE}/contacts`, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForTimeout(2000);

  // Click the gear/settings icon on the table
  const gearBtn = page.locator('table th button, table [class*="settings"], table [class*="gear"], table [class*="cog"]').last();
  if (await gearBtn.count() > 0) {
    await gearBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SS}/deep-08-column-config.png`, fullPage: true });

    const columnConfig = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"], [class*="popover"], [class*="dropdown-menu"]');
      if (!dialog) return "No dialog found";
      return {
        text: dialog.textContent?.trim().slice(0, 500),
        inputs: [...dialog.querySelectorAll('input, [role="checkbox"]')].map(i => ({
          type: i.type || i.getAttribute('role'),
          label: i.closest('label')?.textContent?.trim().slice(0, 40) || '',
          checked: i.checked ?? i.getAttribute('aria-checked'),
        })),
      };
    });
    log("Column Config Dialog", JSON.stringify(columnConfig, null, 2));
  }

  // Try the "..." action menu on a row
  await page.goto(`${BASE}/contacts`, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForTimeout(2000);
  const actionBtn = page.locator('table tbody tr:first-child [class*="action"], table tbody tr:first-child button:last-child, table tbody tr:first-child [class*="dots"], table tbody tr:first-child [class*="more"]').first();
  if (await actionBtn.count() > 0) {
    await actionBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SS}/deep-09-row-actions.png`, fullPage: true });

    const rowActions = await page.evaluate(() => {
      const menu = document.querySelector('[role="menu"], [class*="dropdown-menu"]:not([style*="display: none"]), [class*="popover"]');
      if (!menu) return "No menu found";
      const items = [...menu.querySelectorAll('[role="menuitem"], a, button, li')];
      return items.map(i => i.textContent?.trim().slice(0, 60)).filter(Boolean);
    });
    log("Row Action Menu", JSON.stringify(rowActions));
  }

  // Bulk actions - check a row and see what appears
  const firstCheckbox = page.locator('table tbody tr:first-child input[type="checkbox"]').first();
  if (await firstCheckbox.count() > 0) {
    await firstCheckbox.check();
    await page.waitForTimeout(1000);

    // Check second row too
    const secondCheckbox = page.locator('table tbody tr:nth-child(2) input[type="checkbox"]').first();
    if (await secondCheckbox.count() > 0) await secondCheckbox.check();
    await page.waitForTimeout(1000);

    await page.screenshot({ path: `${SS}/deep-10-bulk-selected.png`, fullPage: true });

    // Click the bulk action dropdown
    const bulkSelect = page.locator('[placeholder*="Select Action"], [class*="bulk"], [class*="action-select"]').first();
    if (await bulkSelect.count() > 0) {
      await bulkSelect.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${SS}/deep-11-bulk-actions-dropdown.png`, fullPage: true });

      const bulkOptions = await page.evaluate(() => {
        const dropdown = document.querySelector('[class*="dropdown"]:not([style*="display: none"]), [role="listbox"], [class*="options"]');
        if (!dropdown) return "No dropdown found";
        const items = [...dropdown.querySelectorAll('[role="option"], li, a')];
        return items.map(i => i.textContent?.trim().slice(0, 60)).filter(Boolean);
      });
      log("Bulk Action Options", JSON.stringify(bulkOptions));
    }
  }

  // =============================================
  // 6. DEALS PIPELINE/BOARD VIEW - deeper look
  // =============================================
  // Try the visible deals page and look for drag-drop columns
  await page.goto(`${BASE}/deals`, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForTimeout(2000);

  // Check for kanban-related elements
  const kanbanCheck = await page.evaluate(() => {
    const allElements = [...document.querySelectorAll('*')];
    const kanbanRelated = allElements.filter(el => {
      const cls = el.className?.toString() || '';
      const id = el.id || '';
      return cls.match(/kanban|board|column|lane|drag|drop|pipeline|stage/i) ||
             id.match(/kanban|board|column|lane|pipeline/i);
    });
    return kanbanRelated.slice(0, 20).map(el => ({
      tag: el.tagName,
      class: el.className?.toString().slice(0, 120),
      id: el.id?.slice(0, 40),
      childCount: el.children.length,
      text: el.textContent?.trim().slice(0, 60),
    }));
  });
  log("Kanban/Board Elements", JSON.stringify(kanbanCheck, null, 2));

  // Check the deals page for Kanban toggle in specific locations
  // Screenshot the top-right area where toggles usually are
  await page.screenshot({ path: `${SS}/deep-12-deals-toolbar-area.png`, clip: { x: 0, y: 0, width: 1440, height: 200 } });

  // =============================================
  // 7. SLIDEOVER FROM TABLE ROW CLICK
  // =============================================
  // On the contacts page, try clicking the contact NAME specifically
  await page.goto(`${BASE}/contacts`, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForTimeout(2000);

  // Find the actual clickable name element in the table
  const contactNameInfo = await page.evaluate(() => {
    const firstRow = document.querySelector('table tbody tr');
    if (!firstRow) return null;
    const cells = [...firstRow.querySelectorAll('td')];
    return cells.map((c, i) => ({
      index: i,
      html: c.innerHTML.slice(0, 200),
      text: c.textContent?.trim().slice(0, 60),
      links: [...c.querySelectorAll('a')].map(a => ({ href: a.href, text: a.textContent?.trim() })),
      clickable: c.querySelector('a, button, [role="button"]') !== null,
    }));
  });
  log("Contact Table First Row Cells", JSON.stringify(contactNameInfo, null, 2));

  // Click on the contact name text (which might open a slideover)
  try {
    const contactNameCell = page.locator('table tbody tr:first-child td:nth-child(2)');
    await contactNameCell.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SS}/deep-13-contact-name-click.png`, fullPage: true });

    // Check if a side panel appeared
    const sidePanel = await page.evaluate(() => {
      const panels = [...document.querySelectorAll('[class*="preview"], [class*="peek"], [class*="slide"], [class*="drawer"], [class*="float"], [class*="aside"], [role="complementary"]')];
      return panels.filter(p => p.offsetWidth > 200).map(p => ({
        class: p.className?.toString().slice(0, 150),
        width: p.offsetWidth,
        visible: p.offsetParent !== null,
        content: p.textContent?.trim().slice(0, 200),
      }));
    });
    log("Side Panel After Name Click", JSON.stringify(sidePanel, null, 2));
    log("URL After Name Click", page.url());
  } catch (e) {
    log("Contact Name Click", `ERROR: ${e.message}`);
  }

  // =============================================
  // 8. CONTACT/DEAL DETAIL PAGE - ASSOCIATIONS TAB
  // =============================================
  await page.goto(`${BASE}/contacts/1`, { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForTimeout(3000);

  // Look for association tabs like "Deals", "Companies", "Activities", "Notes"
  const detailTabs = await page.evaluate(() => {
    const allLinks = [...document.querySelectorAll('a, button, [role="tab"]')];
    return allLinks
      .filter(el => {
        const text = el.textContent?.trim().toLowerCase() || '';
        return ['deal', 'compan', 'activit', 'note', 'call', 'email', 'document', 'file', 'log'].some(k => text.includes(k));
      })
      .map(el => ({
        tag: el.tagName,
        text: el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 60),
        href: el.getAttribute('href'),
        class: el.className?.toString().slice(0, 80),
      }))
      .slice(0, 20);
  });
  log("Contact Detail - Association Tabs/Links", JSON.stringify(detailTabs, null, 2));

  // Full detail page HTML structure
  const detailStructure = await page.evaluate(() => {
    const main = document.querySelector('main, #app, [class*="content"]');
    if (!main) return null;
    // Get all section headings and their container class names
    const sections = [...main.querySelectorAll('h2, h3, h4, h5, [class*="heading"], [class*="title"]')];
    return sections.map(s => ({
      tag: s.tagName,
      text: s.textContent?.trim().slice(0, 80),
      parentClass: s.parentElement?.className?.toString().slice(0, 100),
    })).slice(0, 30);
  });
  log("Contact Detail Structure", JSON.stringify(detailStructure, null, 2));

  // Take multiple screenshots of the detail page at different scroll positions
  for (let scrollY = 0; scrollY <= 2000; scrollY += 700) {
    await page.evaluate((y) => window.scrollTo(0, y), scrollY);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SS}/deep-14-contact-detail-scroll-${scrollY}.png`, fullPage: false });
  }

  // =============================================
  // 9. DEAL DETAIL PAGE - Full exploration
  // =============================================
  await page.goto(`${BASE}/deals/1`, { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForTimeout(3000);

  for (let scrollY = 0; scrollY <= 2000; scrollY += 700) {
    await page.evaluate((y) => window.scrollTo(0, y), scrollY);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SS}/deep-15-deal-detail-scroll-${scrollY}.png`, fullPage: false });
  }

  const dealPageFull = await page.evaluate(() => {
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5')]
      .map(h => `${h.tagName}: ${h.textContent?.trim().slice(0, 100)}`);
    const buttons = [...document.querySelectorAll('button')]
      .map(b => b.textContent?.trim().replace(/\s+/g, ' ').slice(0, 60))
      .filter(t => t.length > 0).slice(0, 40);
    const labels = [...document.querySelectorAll('label, [class*="label"], dt')]
      .map(l => l.textContent?.trim().slice(0, 50))
      .filter(t => t.length > 1).slice(0, 40);
    const links = [...document.querySelectorAll('a')]
      .filter(a => a.textContent?.trim().length > 0)
      .map(a => ({ text: a.textContent?.trim().slice(0, 50), href: a.href }))
      .slice(0, 30);
    return { headings, buttons, labels, links };
  });
  log("Deal Detail Full Info", JSON.stringify(dealPageFull, null, 2));

  // =============================================
  // SAVE
  // =============================================
  const output = `# Concord CRM - Deep Exploration\nGenerated: ${new Date().toISOString()}\n${notes.join("\n")}`;
  fs.writeFileSync("./concord-research/deep-notes.md", output, "utf-8");
  console.log("\nDone! Notes saved to concord-research/deep-notes.md");
  console.log(`Screenshots: ${fs.readdirSync(SS).filter(f => f.startsWith('deep-')).length} new files`);

  await browser.close();
}

run().catch(e => { console.error("Fatal:", e); process.exit(1); });
