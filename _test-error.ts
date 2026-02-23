import { chromium } from "playwright";

(async () => {
  // Launch with visible browser for debugging
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push("[pageerror] " + err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push("[console.error] " + msg.text());
  });

  // Go to login
  console.log("1. Loading login page...");
  await page.goto("http://localhost:5174/login", { timeout: 15000, waitUntil: "networkidle" });
  console.log("   Login page loaded.");

  // Check page content
  const bodyText = await page.locator("body").innerText().catch(() => "");
  
  // Check errors on login page (which also uses useQuery)
  console.log("   Login page uses useQuery? checking errors:", errors.length > 0 ? errors.join("\n   ") : "none");
  
  // Since we can't authenticate, let me try loading the dashboard directly
  // which will redirect to login but might still trigger the error during redirect
  errors.length = 0;
  
  console.log("\n2. Navigating to /dashboard (will redirect to login)...");
  await page.goto("http://localhost:5174/dashboard", { timeout: 15000, waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  console.log("   Dashboard page errors:", errors.length > 0 ? errors.join("\n   ") : "none");
  
  errors.length = 0;
  
  console.log("\n3. Navigating to /dashboard/gabinet/calendar...");
  await page.goto("http://localhost:5174/dashboard/gabinet/calendar", { timeout: 15000, waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  
  const calBody = await page.locator("body").innerText().catch(() => "");
  const hasDefaultQueryError = calBody.includes("defaultQueryOptions");
  console.log("   Page text contains 'defaultQueryOptions':", hasDefaultQueryError);
  console.log("   Page text preview:", calBody.substring(0, 200));
  console.log("   JS errors:", errors.length > 0 ? errors.join("\n   ") : "none");
  
  if (hasDefaultQueryError) {
    console.log("   >>> ERROR REPRODUCED <<<");
    await page.screenshot({ path: "/tmp/calendar-error-repro.png", fullPage: true });
    console.log("   Screenshot saved to /tmp/calendar-error-repro.png");
  }
  
  // Also check gabinet index
  errors.length = 0;
  console.log("\n4. Navigating to /dashboard/gabinet...");
  await page.goto("http://localhost:5174/dashboard/gabinet", { timeout: 15000, waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  
  const gabBody = await page.locator("body").innerText().catch(() => "");
  const gabHasError = gabBody.includes("defaultQueryOptions");
  console.log("   Gabinet index has defaultQueryOptions error:", gabHasError);
  console.log("   Gabinet page text preview:", gabBody.substring(0, 200));
  console.log("   JS errors:", errors.length > 0 ? errors.join("\n   ") : "none");
  
  await browser.close();
  
  console.log("\n=== SUMMARY ===");
  if (hasDefaultQueryError) {
    console.log("Calendar page: ERROR PRESENT");
  } else {
    console.log("Calendar page: no visible error (might need auth to trigger)");
  }
  if (gabHasError) {
    console.log("Gabinet index: ERROR PRESENT");
  } else {
    console.log("Gabinet index: no visible error");
  }
})();
