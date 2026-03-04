import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotsDir = path.join(__dirname, "screenshots");

const BASE_URL = "http://localhost:5173";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  // Collect console errors
  const consoleErrors = [];

  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(`PAGE ERROR: ${err.message}`);
  });

  const results = {};

  // 1. Landing / Home page (shows "Get Started" button which leads to login)
  try {
    await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: path.join(screenshotsDir, "home-landing.png"),
      fullPage: false,
    });
    results["home-landing.png"] = "OK - Landing page captured";
  } catch (e) {
    results["home-landing.png"] = `FAIL - ${e.message}`;
  }

  // 2. Auth login form
  try {
    await page.goto(`${BASE_URL}/login`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: path.join(screenshotsDir, "auth-login-form.png"),
      fullPage: false,
    });
    results["auth-login-form.png"] = "OK - Auth login form captured";
  } catch (e) {
    results["auth-login-form.png"] = `FAIL - ${e.message}`;
  }

  // 3. Try dashboard (will likely redirect to login if not authenticated)
  try {
    await page.goto(`${BASE_URL}/dashboard`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await page.waitForTimeout(3000);
    const currentUrl = page.url();
    const filename = currentUrl.includes("login")
      ? "auth-logged-in-dashboard.png"
      : "auth-logged-in-dashboard.png";
    await page.screenshot({
      path: path.join(screenshotsDir, filename),
      fullPage: false,
    });
    results[filename] = currentUrl.includes("login")
      ? `OK - Redirected to login (not authenticated): ${currentUrl}`
      : `OK - Dashboard page captured at: ${currentUrl}`;
  } catch (e) {
    results["auth-logged-in-dashboard.png"] = `FAIL - ${e.message}`;
  }

  // 4. Patient portal login
  try {
    await page.goto(`${BASE_URL}/patient/login`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: path.join(screenshotsDir, "patient-portal-login.png"),
      fullPage: false,
    });
    results["patient-portal-login.png"] =
      "OK - Patient portal login page captured";
  } catch (e) {
    results["patient-portal-login.png"] = `FAIL - ${e.message}`;
  }

  // 5. Patient portal view (main patient area)
  try {
    await page.goto(`${BASE_URL}/patient`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);
    const currentUrl = page.url();
    await page.screenshot({
      path: path.join(screenshotsDir, "patient-portal-view.png"),
      fullPage: false,
    });
    results["patient-portal-view.png"] = currentUrl.includes("login")
      ? `OK - Redirected to patient login (not authenticated): ${currentUrl}`
      : `OK - Patient portal view captured at: ${currentUrl}`;
  } catch (e) {
    results["patient-portal-view.png"] = `FAIL - ${e.message}`;
  }

  // 6. Console errors screenshot
  if (consoleErrors.length > 0) {
    // Navigate to a blank page and inject console errors for screenshot
    await page.setContent(`
      <html>
        <head>
          <style>
            body { font-family: monospace; background: #1e1e1e; color: #f44; padding: 20px; }
            h1 { color: #fff; font-size: 18px; }
            .error { margin: 8px 0; padding: 8px; background: #2d2d2d; border-left: 3px solid #f44; font-size: 13px; word-wrap: break-word; }
            .count { color: #aaa; margin-bottom: 16px; }
          </style>
        </head>
        <body>
          <h1>Runtime Console Errors</h1>
          <p class="count">${consoleErrors.length} error(s) captured during navigation</p>
          ${consoleErrors
            .slice(0, 50)
            .map((e) => `<div class="error">${e.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`)
            .join("")}
          ${consoleErrors.length > 50 ? `<p class="count">... and ${consoleErrors.length - 50} more</p>` : ""}
        </body>
      </html>
    `);
    await page.screenshot({
      path: path.join(screenshotsDir, "runtime-error-console.png"),
      fullPage: true,
    });
    results["runtime-error-console.png"] =
      `OK - ${consoleErrors.length} console error(s) captured`;
  } else {
    results["runtime-error-console.png"] =
      "SKIPPED - No console errors detected during navigation";
  }

  await browser.close();

  // Print results summary
  console.log("\n=== Screenshot Capture Results ===");
  for (const [file, status] of Object.entries(results)) {
    console.log(`  ${file}: ${status}`);
  }
  console.log("\nConsole errors collected:", consoleErrors.length);
  if (consoleErrors.length > 0) {
    console.log("\n--- Console Errors ---");
    consoleErrors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
  }

  // Write results as JSON for manifest generation
  const fs = await import("fs");
  fs.writeFileSync(
    path.join(__dirname, "capture-results.json"),
    JSON.stringify({ results, consoleErrors }, null, 2)
  );
}

main().catch((e) => {
  console.error("Screenshot capture failed:", e);
  process.exit(1);
});
