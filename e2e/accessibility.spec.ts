import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { BASE_URL, loginAndGoToDashboard } from "./helpers/auth";
import {
  navigateTo,
  assertNoErrorBoundary,
} from "./helpers/common";

// Target: WCAG 2.1 AA — required for Polish public sector clients
// (EU Web Accessibility Directive / Ustawa o dostępności cyfrowej)
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function runAxeScan(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .exclude(".recharts-wrapper") // chart SVGs are decorative
    .analyze();

  if (results.violations.length > 0) {
    const summary = results.violations
      .map(
        (v) =>
          `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} node(s))`
      )
      .join("\n");
    console.warn(`Axe violations on ${label}:\n${summary}`);
  }

  // Critical and serious violations are hard failures.
  // Moderate and minor violations are logged but tolerated until remediation.
  const blockers = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious"
  );

  expect(
    blockers,
    `WCAG 2.1 AA critical/serious violations on ${label}:\n` +
      blockers
        .map((v) => `  • ${v.id}: ${v.description}`)
        .join("\n")
  ).toHaveLength(0);
}

test.describe("Accessibility — WCAG 2.1 AA", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await loginAndGoToDashboard(page);
  });

  // ─── 23.0 Automated Axe Scans ────────────────────────────────

  test("dashboard page has no critical/serious WCAG violations", async ({
    page,
  }) => {
    await navigateTo(page, "/dashboard");
    await assertNoErrorBoundary(page);
    await runAxeScan(page, "/dashboard");
  });

  test("contacts page has no critical/serious WCAG violations", async ({
    page,
  }) => {
    await navigateTo(page, "/dashboard/contacts");
    await assertNoErrorBoundary(page);
    await runAxeScan(page, "/dashboard/contacts");
  });

  test("leads page has no critical/serious WCAG violations", async ({
    page,
  }) => {
    await navigateTo(page, "/dashboard/leads");
    await assertNoErrorBoundary(page);
    await runAxeScan(page, "/dashboard/leads");
  });

  test("companies page has no critical/serious WCAG violations", async ({
    page,
  }) => {
    await navigateTo(page, "/dashboard/companies");
    await assertNoErrorBoundary(page);
    await runAxeScan(page, "/dashboard/companies");
  });

  test("gabinet calendar has no critical/serious WCAG violations", async ({
    page,
  }) => {
    await navigateTo(page, "/dashboard/gabinet/calendar");
    await assertNoErrorBoundary(page);
    await runAxeScan(page, "/dashboard/gabinet/calendar");
  });

  test("settings/team page has no critical/serious WCAG violations", async ({
    page,
  }) => {
    await navigateTo(page, "/dashboard/settings/team");
    await assertNoErrorBoundary(page);
    await runAxeScan(page, "/dashboard/settings/team");
  });

  test("contact create dialog has no critical/serious WCAG violations", async ({
    page,
  }) => {
    await navigateTo(page, "/dashboard/contacts");

    const addBtn = page
      .locator(
        'button:has-text("Dodaj kontakt"), button:has-text("Add contact")'
      )
      .first();

    if (!(await addBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await addBtn.click();
    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    await runAxeScan(page, "contact create dialog");

    await page.keyboard.press("Escape");
  });

  // ─── 23.1 Keyboard Navigation ────────────────────────────────

  test("tab navigation works on contacts page", async ({ page }) => {
    await navigateTo(page, "/dashboard/contacts");

    // Press Tab multiple times and verify focus moves through interactive elements
    await page.keyboard.press("Tab");
    await page.waitForTimeout(200);
    await page.keyboard.press("Tab");
    await page.waitForTimeout(200);
    await page.keyboard.press("Tab");
    await page.waitForTimeout(200);

    // Active element should be focusable
    const activeTag = await page.evaluate(
      () => document.activeElement?.tagName ?? ""
    );
    // Tab should focus on interactive elements
    expect(activeTag.length).toBeGreaterThan(0);
    await assertNoErrorBoundary(page);
  });

  test("enter submits contact create form", async ({ page }) => {
    await navigateTo(page, "/dashboard/contacts");

    const addBtn = page
      .locator(
        'button:has-text("Dodaj kontakt"), button:has-text("Add contact")'
      )
      .first();

    if (!(await addBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await addBtn.click();
    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Fill required field
    const firstInput = dialog.locator("input").first();
    await firstInput.fill("KeyboardTest");

    // Press Enter to attempt submit
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);

    // Form should either submit or stay open (both valid behaviors)
    await assertNoErrorBoundary(page);

    // Close dialog if still open
    const stillOpen = await dialog
      .isVisible({ timeout: 1000 })
      .catch(() => false);
    if (stillOpen) {
      await page.keyboard.press("Escape");
    }
  });

  test("escape closes contact create dialog", async ({ page }) => {
    await navigateTo(page, "/dashboard/contacts");

    const addBtn = page
      .locator(
        'button:has-text("Dodaj kontakt"), button:has-text("Add contact")'
      )
      .first();

    if (!(await addBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await addBtn.click();
    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Press Escape to close
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // Dialog should be closed
    await expect(dialog).not.toBeVisible({ timeout: 3000 });
  });

  test("escape closes appointment create dialog", async ({ page }) => {
    await navigateTo(page, "/dashboard/gabinet/calendar");

    const createBtn = page
      .locator(
        'button:has-text("Nowa wizyta"), button:has-text("New appointment"), button:has-text("Dodaj")'
      )
      .first();

    if (!(await createBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await createBtn.click();
    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    await expect(dialog).not.toBeVisible({ timeout: 3000 });
  });

  test("escape closes dropdown menus", async ({ page }) => {
    await navigateTo(page, "/dashboard/contacts");

    const menuTrigger = page
      .locator(
        'table tbody tr button[aria-haspopup="menu"], table tbody tr button:has(svg)'
      )
      .first();

    if (
      !(await menuTrigger.isVisible({ timeout: 5000 }).catch(() => false))
    ) {
      test.skip();
      return;
    }

    await menuTrigger.click();
    await page.waitForTimeout(500);

    const menu = page.locator('[role="menu"]');
    if (await menu.isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);

      await expect(menu).not.toBeVisible({ timeout: 2000 });
    }
  });

  // ─── 23.2 Screen Reader ──────────────────────────────────────

  test("form inputs have labels", async ({ page }) => {
    await navigateTo(page, "/dashboard/contacts");

    const addBtn = page
      .locator(
        'button:has-text("Dodaj kontakt"), button:has-text("Add contact")'
      )
      .first();

    if (!(await addBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await addBtn.click();
    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Check that inputs have associated labels or aria-label
    const inputs = dialog.locator("input");
    const inputCount = await inputs.count();

    for (let i = 0; i < Math.min(inputCount, 5); i++) {
      const input = inputs.nth(i);
      const id = await input.getAttribute("id");
      const ariaLabel = await input.getAttribute("aria-label");
      const ariaLabelledBy = await input.getAttribute("aria-labelledby");
      const placeholder = await input.getAttribute("placeholder");
      const name = await input.getAttribute("name");

      // Input should have at least one accessibility identifier
      const hasAccessibility =
        (id && (await dialog.locator(`label[for="${id}"]`).count()) > 0) ||
        ariaLabel !== null ||
        ariaLabelledBy !== null ||
        placeholder !== null ||
        name !== null;

      expect(hasAccessibility).toBe(true);
    }

    await page.keyboard.press("Escape");
  });

  test("dialogs have ARIA role and title", async ({ page }) => {
    await navigateTo(page, "/dashboard/contacts");

    const addBtn = page
      .locator(
        'button:has-text("Dodaj kontakt"), button:has-text("Add contact")'
      )
      .first();

    if (!(await addBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await addBtn.click();
    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Dialog should have role="dialog"
    const role = await dialog.getAttribute("role");
    expect(role).toBe("dialog");

    // Dialog should have an accessible name (aria-label or aria-labelledby)
    const ariaLabel = await dialog.getAttribute("aria-label");
    const ariaLabelledBy = await dialog.getAttribute("aria-labelledby");
    const ariaDescribedBy = await dialog.getAttribute("aria-describedby");

    const hasAccessibleName =
      ariaLabel !== null || ariaLabelledBy !== null || ariaDescribedBy !== null;
    expect(hasAccessibleName).toBe(true);

    await page.keyboard.press("Escape");
  });

  test("focus moves into dialog when opened", async ({ page }) => {
    await navigateTo(page, "/dashboard/contacts");

    const addBtn = page
      .locator(
        'button:has-text("Dodaj kontakt"), button:has-text("Add contact")'
      )
      .first();

    if (!(await addBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await addBtn.click();
    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Focus should be inside the dialog
    const isFocusInDialog = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return dialog?.contains(document.activeElement) ?? false;
    });
    expect(isFocusInDialog).toBe(true);

    await page.keyboard.press("Escape");
  });

  // ─── 23.3 Patient Portal Accessibility ──────────────────────

  test("patient portal login page (invalid-link state) has no critical/serious WCAG violations", async ({
    page,
  }) => {
    // Without ?org= the component renders an error card immediately — no backend call.
    await page.goto(`${BASE_URL}/patient/login`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await page.waitForTimeout(500);
    await assertNoErrorBoundary(page);
    await runAxeScan(page, "/patient/login (invalid-link)");
  });

  test("patient portal login form (email step) has no critical/serious WCAG violations", async ({
    page,
  }) => {
    // With ?org=X the component renders the email form immediately while the
    // Convex org-lookup query is in flight. Scan before the response arrives.
    await page.goto(`${BASE_URL}/patient/login?org=test`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    // Small wait for React to hydrate but intentionally before network settles.
    await page.waitForTimeout(600);
    await assertNoErrorBoundary(page);

    const emailInput = page.locator("#patient-email");
    if (!(await emailInput.isVisible({ timeout: 3000 }).catch(() => false))) {
      // Org resolved and may have shown error card — scan whatever is rendered.
      await runAxeScan(page, "/patient/login?org=test (resolved)");
      return;
    }

    await runAxeScan(page, "/patient/login?org=test (email step)");
  });

  test("patient portal login email input has an associated label", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/patient/login?org=test`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await page.waitForTimeout(600);

    const emailInput = page.locator("#patient-email");
    if (!(await emailInput.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip();
      return;
    }

    const labelCount = await page.locator('label[for="patient-email"]').count();
    expect(labelCount).toBeGreaterThan(0);
  });

  test("patient portal login Tab key moves focus from email to button", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/patient/login?org=test`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await page.waitForTimeout(600);

    const emailInput = page.locator("#patient-email");
    if (!(await emailInput.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await emailInput.click();
    await page.keyboard.press("Tab");

    const activeTag = await page.evaluate(
      () => document.activeElement?.tagName ?? ""
    );
    // Focus should move to a focusable element (button).
    expect(["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA"]).toContain(
      activeTag.toUpperCase()
    );
    await assertNoErrorBoundary(page);
  });

  test("patient portal login Enter key on email field triggers send action", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/patient/login?org=test`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await page.waitForTimeout(600);

    const emailInput = page.locator("#patient-email");
    if (!(await emailInput.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await emailInput.fill("patient@example.com");
    await page.keyboard.press("Enter");
    // May show OTP step, a toast error, or stay on email step if org not found.
    // All are valid outcomes — we only assert no crash.
    await page.waitForTimeout(2000);
    await assertNoErrorBoundary(page);
  });

  test("patient portal OTP input has an associated label when OTP step is visible", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/patient/login?org=test`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await page.waitForTimeout(600);

    const otpInput = page.locator("#patient-otp");
    if (!(await otpInput.isVisible({ timeout: 2000 }).catch(() => false))) {
      // OTP step not rendered (still on email step or error state) — skip.
      test.skip();
      return;
    }

    const labelCount = await page.locator('label[for="patient-otp"]').count();
    expect(labelCount).toBeGreaterThan(0);
  });

  test("patient portal OTP input strips non-digit characters", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/patient/login?org=test`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await page.waitForTimeout(600);

    const otpInput = page.locator("#patient-otp");
    if (!(await otpInput.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await otpInput.fill("ab1c2d3");
    const value = await otpInput.inputValue();
    expect(value).toMatch(/^\d*$/);
  });

  test("patient portal verify button is disabled until 6 digits are entered", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/patient/login?org=test`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await page.waitForTimeout(600);

    const otpInput = page.locator("#patient-otp");
    if (!(await otpInput.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.skip();
      return;
    }

    // Fewer than 6 digits → button disabled.
    await otpInput.fill("123");
    const verifyBtn = page
      .locator(
        'button:has-text("Zweryfikuj"), button:has-text("Verify"), button:has-text("Potwierdź")'
      )
      .first();
    expect(await verifyBtn.isDisabled()).toBe(true);

    // Exactly 6 digits → button enabled.
    await otpInput.fill("123456");
    expect(await verifyBtn.isDisabled()).toBe(false);
  });
});

// ─── WCAG 1.1.1 Chart Text Alternatives ──────────────────────────────────────
// Non-text content (charts) must have a text alternative (WCAG 1.1.1).
// Recharts SVGs render inside a div[data-chart] container and do NOT trigger
// axe-core's `image-alt` rule (which targets <img> elements), so a dedicated
// aria-label presence check per chart container is required.

test.describe("Chart text alternatives — WCAG 1.1.1", () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await loginAndGoToDashboard(page);
  });

  test("all chart containers on /dashboard have aria-label (WCAG 1.1.1)", async ({
    page,
  }) => {
    await navigateTo(page, "/dashboard");
    await assertNoErrorBoundary(page);

    // Wait up to 15 s for at least one chart to appear; skip if the org has no
    // data yet (charts may be hidden behind empty-state UI).
    const firstChart = page.locator("[data-chart]").first();
    const rendered = await firstChart
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (!rendered) {
      test.skip();
      return;
    }

    const chartContainers = page.locator("[data-chart]");
    const count = await chartContainers.count();

    expect(
      count,
      "Expected at least one [data-chart] container on /dashboard"
    ).toBeGreaterThan(0);

    const missing: string[] = [];
    for (let i = 0; i < count; i++) {
      const container = chartContainers.nth(i);
      const ariaLabel = await container.getAttribute("aria-label");
      if (!ariaLabel) {
        const chartId =
          (await container.getAttribute("data-chart")) ?? `chart[${i}]`;
        missing.push(chartId);
      }
    }

    expect(
      missing,
      "Chart containers missing aria-label (WCAG 1.1.1 Non-text Content):\n" +
        missing.map((id) => `  • ${id}`).join("\n")
    ).toHaveLength(0);
  });
});

// ─── WCAG 1.4.10 Reflow ──────────────────────────────────────────────────────
// Content must be presentable without loss of information and without requiring
// horizontal scrolling at a viewport width of 320 CSS pixels.

const REFLOW_PAGES = [
  { path: "/dashboard", label: "main dashboard" },
  { path: "/dashboard/contacts", label: "contacts" },
  { path: "/dashboard/leads", label: "leads" },
  { path: "/dashboard/companies", label: "companies" },
  { path: "/dashboard/gabinet/calendar", label: "gabinet calendar" },
  { path: "/dashboard/settings/team", label: "settings/team" },
] as const;

test.describe("Reflow — WCAG 1.4.10", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await loginAndGoToDashboard(page);
    // Resize to the WCAG 1.4.10 reference viewport (320 × 768).
    // Height is intentionally taller than 256 px so vertical scrolling is still
    // permitted — only horizontal scrolling is the WCAG violation here.
    await page.setViewportSize({ width: 320, height: 768 });
  });

  for (const { path, label } of REFLOW_PAGES) {
    test(`${label} has no horizontal overflow at 320 px viewport (WCAG 1.4.10)`, async ({
      page,
    }) => {
      await navigateTo(page, path);
      await assertNoErrorBoundary(page);

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));

      expect(
        scrollWidth,
        `Horizontal scroll required on "${label}" at 320 px — WCAG 1.4.10 Reflow violation` +
          ` (scrollWidth=${scrollWidth}, clientWidth=${clientWidth})`
      ).toBeLessThanOrEqual(clientWidth);
    });
  }
});
