import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const SCREENSHOT_DIR = './docs/runtime-e2e/screenshots';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  
  // Collect console errors
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text());
  });
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  // Go to login page
  console.log('1. Navigating to /login ...');
  await page.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  console.log('   URL:', page.url());

  // Click "Email i hasło" button 
  console.log('2. Clicking "Email i hasło" button...');
  await page.click('button:has-text("Email i has")');
  await page.waitForTimeout(2000);
  
  // Debug: take screenshot after clicking
  await page.screenshot({ path: SCREENSHOT_DIR + '/debug-step2.png' });

  // Wait for the email input to appear
  console.log('3. Waiting for #userEmail input...');
  try {
    await page.waitForSelector('#userEmail', { timeout: 5000 });
    console.log('   Found #userEmail');
  } catch (e) {
    console.log('   #userEmail not found, checking page state...');
    const inputs = await page.$$eval('input', els => els.map(e => ({ id: e.id, type: e.type, name: e.name, placeholder: e.placeholder })));
    console.log('   Inputs:', JSON.stringify(inputs));
  }

  // Fill email
  console.log('4. Filling email...');
  await page.fill('#userEmail', 'amiesak@gmail.com');
  
  // Fill password
  console.log('5. Filling password...');
  await page.fill('#password', 'ABcdefg123!@#');
  
  // Debug: take screenshot before submit
  await page.screenshot({ path: SCREENSHOT_DIR + '/debug-step5.png' });

  // Click "Zaloguj się" submit button
  console.log('6. Clicking submit...');
  await page.click('button[type="submit"]:has-text("Zaloguj")');
  
  // Wait for navigation or auth to complete
  console.log('7. Waiting for auth...');
  try {
    await page.waitForURL('**/dashboard**', { timeout: 15000 });
    console.log('   Navigated to dashboard!');
  } catch (e) {
    console.log('   Did not navigate to dashboard. Current URL:', page.url());
    await page.screenshot({ path: SCREENSHOT_DIR + '/debug-step7.png' });
    // Try to detect any error messages
    const errorText = await page.$$eval('.text-destructive', els => els.map(e => e.textContent));
    if (errorText.length > 0) console.log('   Error messages:', errorText);
    
    // Maybe just try navigating directly
    console.log('   Trying direct navigation to /dashboard...');
    await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(3000);
    console.log('   URL after direct nav:', page.url());
  }

  // Check if we're actually logged in
  const finalUrl = page.url();
  console.log('8. Final URL:', finalUrl);
  
  if (finalUrl.includes('dashboard')) {
    await page.waitForTimeout(3000);
    
    // 1: CRM Dashboard
    console.log('Capturing CRM Dashboard...');
    await page.screenshot({ path: SCREENSHOT_DIR + '/crm-dashboard.png', fullPage: false });
    console.log('OK: crm-dashboard.png');

    // 2: CRM Leads
    console.log('Capturing CRM Leads...');
    await page.goto(BASE + '/dashboard/leads', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: SCREENSHOT_DIR + '/crm-leads.png', fullPage: false });
    console.log('OK: crm-leads.png');

    // 3: CRM Activities
    console.log('Capturing CRM Activities...');
    await page.goto(BASE + '/dashboard/activities', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: SCREENSHOT_DIR + '/crm-activities.png', fullPage: false });
    console.log('OK: crm-activities.png');

    // 4: CRM Calendar
    console.log('Capturing CRM Calendar...');
    await page.goto(BASE + '/dashboard/calendar', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: SCREENSHOT_DIR + '/crm-calendar.png', fullPage: false });
    console.log('OK: crm-calendar.png');

    // 5: CRM Documents
    console.log('Capturing CRM Documents...');
    await page.goto(BASE + '/dashboard/documents', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: SCREENSHOT_DIR + '/crm-documents.png', fullPage: false });
    console.log('OK: crm-documents.png');
    
    console.log('All screenshots captured successfully!');
  } else {
    console.log('FAILED: Could not log in. Screenshots will show login page.');
    // Still capture whatever we have
    await page.screenshot({ path: SCREENSHOT_DIR + '/crm-dashboard.png', fullPage: false });
  }

  await browser.close();
}

run().catch(err => {
  console.error('Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
