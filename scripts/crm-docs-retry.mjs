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

  // Login
  await page.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.click('button:has-text("Email i has")');
  await page.waitForSelector('#userEmail', { timeout: 5000 });
  await page.fill('#userEmail', 'amiesak@gmail.com');
  await page.fill('#password', 'ABcdefg123!@#');
  await page.click('button[type="submit"]:has-text("Zaloguj")');
  await page.waitForURL('**/dashboard**', { timeout: 15000 });
  console.log('Logged in, URL:', page.url());

  // Navigate to documents with extra wait
  console.log('Navigating to documents...');
  await page.goto(BASE + '/dashboard/documents', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(8000);
  
  // Check what's on the page
  const bodyText = await page.$eval('body', el => el.innerText.substring(0, 500));
  console.log('Page text:', bodyText);
  
  await page.screenshot({ path: SCREENSHOT_DIR + '/crm-documents.png', fullPage: false });
  console.log('OK: crm-documents.png');

  await browser.close();
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
