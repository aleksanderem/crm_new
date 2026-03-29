# F1: Email Template System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace GrapesJS email builder with TipTap-based template editing using the same variable system as document templates. Create a programmatic email shell with org brand config, seed all 60 system templates, build a 600px-width editor UI, and remove the old email builder.

**Architecture:** Frontend TipTap editor pre-renders HTML on save (stored as `renderedHtml`). Backend does variable substitution on pre-rendered HTML via existing `substituteVariables` helper, then wraps in a table-based 600px email shell generated from org's `emailBrandConfig`. System templates seeded via batched internal mutations during onboarding.

**Tech Stack:** Convex (schema, mutations, actions), TipTap v3 (editor), React, Vitest (backend tests)

**Spec:** `docs/superpowers/specs/2026-03-26-email-system-overhaul-design.md` (section F1)

---

### Task 1: Add emailBrandConfig table to schema

**Files:**
- Modify: `convex/schema/platform.ts` — add `emailBrandConfig` table definition inside `createPlatformTables` (platform-level entity, not CRM-specific)

- [ ] **Step 1: Read current emailLayouts definition**

Read `convex/schema/crm.ts` lines 655-669 to see the current `emailLayouts` table shape that `emailBrandConfig` replaces. Read `convex/schema/platform.ts` to understand the `createPlatformTables` pattern.

- [ ] **Step 2: Add emailBrandConfig table**

In `convex/schema/platform.ts`, add the new table inside the `createPlatformTables` return object:

```typescript
emailBrandConfig: defineTable({
  organizationId: v.id("organizations"),
  logoStorageId: v.optional(v.id("_storage")),
  logoUrl: v.optional(v.string()),
  companyName: v.optional(v.string()),
  primaryColor: v.string(),
  backgroundColor: v.string(),
  contentBackgroundColor: v.string(),
  textColor: v.string(),
  secondaryTextColor: v.string(),
  accentColor: v.string(),
  footerText: v.optional(v.string()),
  socialLinks: v.optional(
    v.object({
      website: v.optional(v.string()),
      facebook: v.optional(v.string()),
      instagram: v.optional(v.string()),
      linkedin: v.optional(v.string()),
    })
  ),
  createdBy: v.id("users"),
  createdAt: v.number(),
  updatedBy: v.id("users"),
  updatedAt: v.number(),
}).index("by_org", ["organizationId"]),
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc -p convex/tsconfig.json --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add convex/schema/platform.ts
git commit -m "feat(schema): add emailBrandConfig table for org email branding"
```

---

### Task 2: Extend emailTemplates table with new fields

**Files:**
- Modify: `convex/schema/crm.ts` — extend `emailTemplates` table definition (lines 631-653)

- [ ] **Step 1: Read current emailTemplates definition**

Read `convex/schema/crm.ts` lines 631-653.

- [ ] **Step 2: Add new fields to emailTemplates**

Extend the table definition. Keep all existing fields, add new ones:

```typescript
emailTemplates: defineTable({
  organizationId: v.id("organizations"),
  name: v.string(),
  subject: v.string(),
  body: v.string(), // kept for backward compat
  contentJson: v.optional(v.string()), // TipTap JSON
  renderedHtml: v.optional(v.string()), // pre-rendered HTML from TipTap
  slug: v.optional(v.string()), // machine ID, e.g. "gabinet.appointment.confirmation"
  category: v.optional(v.string()),
  module: v.optional(v.string()),
  eventType: v.optional(v.string()),
  isSystem: v.optional(v.boolean()),
  locale: v.optional(v.string()), // "pl" | "en"
  requiredSources: v.optional(v.array(v.string())),
  variables: v.array(
    v.object({
      key: v.string(),
      label: v.string(),
      source: v.string(),
    }),
  ),
  createdBy: v.id("users"),
  isActive: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_org", ["organizationId"])
  .index("by_org_active", ["organizationId", "isActive"])
  .index("by_org_module", ["organizationId", "module"])
  .index("by_org_slug_locale", ["organizationId", "slug", "locale"]),
```

Note: new fields are `v.optional()` to maintain backward compatibility with existing records.

- [ ] **Step 3: Run typecheck**

Run: `npx tsc -p convex/tsconfig.json --noEmit`
Expected: PASS. If there are errors in files that reference emailTemplates with strict types, update them to handle the new optional fields.

- [ ] **Step 4: Commit**

```bash
git add convex/schema/crm.ts
git commit -m "feat(schema): extend emailTemplates with contentJson, renderedHtml, slug, locale, requiredSources"
```

---

### Task 3: Create emailBrandConfig CRUD backend

**Files:**
- Create: `convex/emailBrandConfig.ts`

- [ ] **Step 1: Write failing test**

Create `tests/convex/emailBrandConfig.test.ts`:

```typescript
import { expect, test, describe } from "vitest";
import { api } from "../_generated/api";
import { createTestCtx, seedTestUser } from "../_test_helpers";

describe("emailBrandConfig", () => {
  test("getOrCreate returns default config when none exists", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const config = await t
      .withIdentity(identity)
      .query(api.emailBrandConfig.getForOrg, { organizationId });

    expect(config).toBeNull();
  });

  test("upsert creates config with provided colors", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    await t.withIdentity(identity).mutation(api.emailBrandConfig.upsert, {
      organizationId,
      primaryColor: "#2563eb",
      backgroundColor: "#f3f4f6",
      contentBackgroundColor: "#ffffff",
      textColor: "#1f2937",
      secondaryTextColor: "#6b7280",
      accentColor: "#7c3aed",
      companyName: "Test Clinic",
      footerText: "ul. Testowa 1, Warszawa",
    });

    const config = await t
      .withIdentity(identity)
      .query(api.emailBrandConfig.getForOrg, { organizationId });

    expect(config).not.toBeNull();
    expect(config!.primaryColor).toBe("#2563eb");
    expect(config!.companyName).toBe("Test Clinic");
  });

  test("upsert updates existing config", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    await t.withIdentity(identity).mutation(api.emailBrandConfig.upsert, {
      organizationId,
      primaryColor: "#2563eb",
      backgroundColor: "#f3f4f6",
      contentBackgroundColor: "#ffffff",
      textColor: "#1f2937",
      secondaryTextColor: "#6b7280",
      accentColor: "#7c3aed",
    });

    await t.withIdentity(identity).mutation(api.emailBrandConfig.upsert, {
      organizationId,
      primaryColor: "#dc2626",
      backgroundColor: "#f3f4f6",
      contentBackgroundColor: "#ffffff",
      textColor: "#1f2937",
      secondaryTextColor: "#6b7280",
      accentColor: "#7c3aed",
      companyName: "Updated Clinic",
    });

    const config = await t
      .withIdentity(identity)
      .query(api.emailBrandConfig.getForOrg, { organizationId });

    expect(config!.primaryColor).toBe("#dc2626");
    expect(config!.companyName).toBe("Updated Clinic");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/alfred/projects/crm_new && npx vitest run tests/convex/emailBrandConfig.test.ts --reporter=verbose`
Expected: FAIL — module `api.emailBrandConfig` does not exist.

- [ ] **Step 3: Implement emailBrandConfig.ts**

Create `convex/emailBrandConfig.ts`:

```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/permissions";

export const getForOrg = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.db
      .query("emailBrandConfig")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .first();
  },
});

export const upsert = mutation({
  args: {
    organizationId: v.id("organizations"),
    logoStorageId: v.optional(v.id("_storage")),
    companyName: v.optional(v.string()),
    primaryColor: v.string(),
    backgroundColor: v.string(),
    contentBackgroundColor: v.string(),
    textColor: v.string(),
    secondaryTextColor: v.string(),
    accentColor: v.string(),
    footerText: v.optional(v.string()),
    socialLinks: v.optional(
      v.object({
        website: v.optional(v.string()),
        facebook: v.optional(v.string()),
        instagram: v.optional(v.string()),
        linkedin: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();

    const existing = await ctx.db
      .query("emailBrandConfig")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .first();

    // Resolve logo URL if storageId provided
    let logoUrl: string | undefined;
    if (args.logoStorageId) {
      logoUrl = (await ctx.storage.getUrl(args.logoStorageId)) ?? undefined;
    }

    const data = {
      organizationId: args.organizationId,
      logoStorageId: args.logoStorageId,
      logoUrl,
      companyName: args.companyName,
      primaryColor: args.primaryColor,
      backgroundColor: args.backgroundColor,
      contentBackgroundColor: args.contentBackgroundColor,
      textColor: args.textColor,
      secondaryTextColor: args.secondaryTextColor,
      accentColor: args.accentColor,
      footerText: args.footerText,
      socialLinks: args.socialLinks,
      updatedBy: user._id,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
      return existing._id;
    } else {
      return await ctx.db.insert("emailBrandConfig", {
        ...data,
        createdBy: user._id,
        createdAt: now,
      });
    }
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/alfred/projects/crm_new && npx vitest run tests/convex/emailBrandConfig.test.ts --reporter=verbose`
Expected: PASS (3/3)

- [ ] **Step 5: Typecheck**

Run: `npx tsc -p convex/tsconfig.json --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add convex/emailBrandConfig.ts tests/convex/emailBrandConfig.test.ts
git commit -m "feat: add emailBrandConfig CRUD with upsert and org-scoped query"
```

---

### Task 4: Build email shell HTML builder

**Files:**
- Create: `convex/mail/emailShell.ts`

- [ ] **Step 1: Write test for buildEmailHtml**

Create `tests/convex/emailShell.test.ts`:

```typescript
import { expect, test, describe } from "vitest";
import { buildEmailHtml, applyBrandColors } from "../../convex/mail/emailShell";

describe("buildEmailHtml", () => {
  const defaultConfig = {
    primaryColor: "#2563eb",
    backgroundColor: "#f3f4f6",
    contentBackgroundColor: "#ffffff",
    textColor: "#1f2937",
    secondaryTextColor: "#6b7280",
    accentColor: "#7c3aed",
  };

  test("wraps body in 600px table structure", () => {
    const html = buildEmailHtml("<p>Hello</p>", defaultConfig);
    expect(html).toContain('width="600"');
    expect(html).toContain("max-width:600px");
    expect(html).toContain("<p>Hello</p>");
  });

  test("includes logo when logoUrl provided", () => {
    const html = buildEmailHtml("<p>Hi</p>", {
      ...defaultConfig,
      logoUrl: "https://example.com/logo.png",
      companyName: "Test Co",
    });
    expect(html).toContain('src="https://example.com/logo.png"');
    expect(html).toContain('alt="Test Co"');
  });

  test("shows company name when no logo", () => {
    const html = buildEmailHtml("<p>Hi</p>", {
      ...defaultConfig,
      companyName: "My Clinic",
    });
    expect(html).toContain("My Clinic");
    expect(html).not.toContain("<img");
  });

  test("includes footer text", () => {
    const html = buildEmailHtml("<p>Body</p>", {
      ...defaultConfig,
      footerText: "ul. Testowa 1, Warszawa",
    });
    expect(html).toContain("ul. Testowa 1, Warszawa");
  });

  test("applies background colors from config", () => {
    const html = buildEmailHtml("<p>Body</p>", defaultConfig);
    expect(html).toContain("background:#f3f4f6");
    expect(html).toContain("background:#ffffff");
  });
});

describe("applyBrandColors", () => {
  test("applies accentColor to plain links", () => {
    const html = '<a href="https://example.com">Click</a>';
    const result = applyBrandColors(html, "#2563eb", "#7c3aed");
    expect(result).toContain("color:#7c3aed");
  });

  test("applies primaryColor to button-style links", () => {
    const html = '<a href="#" style="background-color:#000">Button</a>';
    const result = applyBrandColors(html, "#2563eb", "#7c3aed");
    expect(result).toContain("background-color:#2563eb");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/alfred/projects/crm_new && npx vitest run tests/convex/emailShell.test.ts --reporter=verbose`
Expected: FAIL — module not found.

- [ ] **Step 3: Create emailShell.ts**

Create `convex/mail/emailShell.ts`:

```typescript
/**
 * Email HTML shell builder.
 * Generates table-based 600px email wrapper from org brand config.
 */

interface BrandConfig {
  primaryColor: string;
  backgroundColor: string;
  contentBackgroundColor: string;
  textColor: string;
  secondaryTextColor: string;
  accentColor: string;
  logoUrl?: string;
  companyName?: string;
  footerText?: string;
  socialLinks?: {
    website?: string;
    facebook?: string;
    instagram?: string;
    linkedin?: string;
  };
}

/**
 * Apply brand colors to links in rendered HTML.
 * - Links with background-color (button-style) get primaryColor
 * - Plain text links get accentColor
 */
export function applyBrandColors(
  html: string,
  primaryColor: string,
  accentColor: string,
): string {
  // Apply primaryColor to button-style links (have background-color in style)
  let result = html.replace(
    /<a\s([^>]*style="[^"]*background-color:[^"]*"[^>]*)>/gi,
    (match, attrs) => {
      const updated = attrs.replace(
        /background-color:\s*[^;"]+/gi,
        `background-color:${primaryColor}`,
      );
      return `<a ${updated}>`;
    },
  );

  // Apply accentColor to plain links (no background-color)
  result = result.replace(
    /<a\s([^>]*)>/gi,
    (match, attrs) => {
      if (/background-color/i.test(attrs)) return match; // already handled
      if (/style="/i.test(attrs)) {
        const updated = attrs.replace(/style="/, `style="color:${accentColor};`);
        return `<a ${updated}>`;
      }
      return `<a style="color:${accentColor};" ${attrs}>`;
    },
  );

  return result;
}

/**
 * Build complete email HTML from rendered body content and brand config.
 */
export function buildEmailHtml(
  bodyContent: string,
  config: BrandConfig,
): string {
  const {
    backgroundColor,
    contentBackgroundColor,
    textColor,
    secondaryTextColor,
    primaryColor,
    accentColor,
    logoUrl,
    companyName,
    footerText,
    socialLinks,
  } = config;

  // Apply brand colors to links/buttons in body
  const coloredBody = applyBrandColors(bodyContent, primaryColor, accentColor);

  // Header: logo image or company name text
  let headerHtml = "";
  if (logoUrl) {
    headerHtml = `<tr><td style="padding:24px;text-align:center;border-bottom:1px solid #e5e7eb;"><img src="${logoUrl}" alt="${companyName ?? ""}" style="max-height:48px;" /></td></tr>`;
  } else if (companyName) {
    headerHtml = `<tr><td style="padding:24px;text-align:center;border-bottom:1px solid #e5e7eb;font-weight:600;font-size:18px;color:${textColor};">${companyName}</td></tr>`;
  }

  // Footer: text + social links
  let footerHtml = "";
  if (footerText || socialLinks) {
    const socialHtml = socialLinks
      ? [socialLinks.website, socialLinks.facebook, socialLinks.instagram, socialLinks.linkedin]
          .filter(Boolean)
          .map((url) => `<a href="${url}" style="color:${secondaryTextColor};text-decoration:underline;margin:0 4px;">${new URL(url!).hostname}</a>`)
          .join(" ")
      : "";

    footerHtml = `<tr><td style="background:#f9fafb;padding:24px;text-align:center;color:${secondaryTextColor};font-size:12px;line-height:1.5;">${footerText ? `<div>${footerText}</div>` : ""}${socialHtml ? `<div style="margin-top:8px;">${socialHtml}</div>` : ""}</td></tr>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:${backgroundColor};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:${backgroundColor};min-height:100vh;"><tr><td align="center" style="padding:32px 16px;"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${contentBackgroundColor};border-radius:8px;overflow:hidden;">${headerHtml}<tr><td style="padding:32px 24px;color:${textColor};font-size:15px;line-height:1.6;">${coloredBody}</td></tr>${footerHtml}</table></td></tr></table></body></html>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/alfred/projects/crm_new && npx vitest run tests/convex/emailShell.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/mail/emailShell.ts tests/convex/emailShell.test.ts
git commit -m "feat: add email shell HTML builder with brand color application"
```

---

### Task 5: Update email sending pipeline to use renderedHtml + shell

**Files:**
- Modify: `convex/emailSending.ts` — update `getTemplateAndLayout` to load brand config, update `sendTemplateEmail` to use `renderedHtml` with fallback

- [ ] **Step 1: Write test for new rendering pipeline**

Create `tests/convex/emailRendering.test.ts`:

```typescript
import { expect, test, describe } from "vitest";
import { buildEmailHtml } from "../../convex/mail/emailShell";

// Test the integration: variable substitution + shell wrapping
describe("email rendering integration", () => {
  test("substituteVariables handles both flat and dot-prefixed keys", () => {
    // Import the function from emailSending.ts (it's currently not exported, will need to export it)
    // For now test the logic inline
    const template = "Hello {{patient.name}}, your appointment is on {{date}}";
    const variables: Record<string, string> = {
      "patient.name": "Jan Kowalski",
      date: "2026-04-01",
    };

    let result = template;
    result = result.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => {
      const trimmed = key.trim();
      if (variables[trimmed] !== undefined) return variables[trimmed];
      return `{{${trimmed}}}`;
    });

    expect(result).toBe("Hello Jan Kowalski, your appointment is on 2026-04-01");
  });

  test("full pipeline: renderedHtml + substitution + shell", () => {
    const renderedHtml = "<p>Hello {{patient.name}}</p>";
    const variables = { "patient.name": "Jan" };

    // Substitute
    const substituted = renderedHtml.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
      return variables[key.trim() as keyof typeof variables] ?? `{{${key.trim()}}}`;
    });

    // Wrap in shell
    const fullEmail = buildEmailHtml(substituted, {
      primaryColor: "#2563eb",
      backgroundColor: "#f3f4f6",
      contentBackgroundColor: "#ffffff",
      textColor: "#1f2937",
      secondaryTextColor: "#6b7280",
      accentColor: "#7c3aed",
      companyName: "Test Clinic",
    });

    expect(fullEmail).toContain("<p>Hello Jan</p>");
    expect(fullEmail).toContain("Test Clinic");
    expect(fullEmail).toContain('width="600"');
    expect(fullEmail).not.toContain("{{patient.name}}");
  });
});
```

- [ ] **Step 2: Run test**

Run: `cd /Users/alfred/projects/crm_new && npx vitest run tests/convex/emailRendering.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 3: Update emailSending.ts**

Modify `convex/emailSending.ts`:
1. Update `getTemplateAndLayout` to also load `emailBrandConfig` (query by org)
2. Update `sendTemplateEmail` to prefer `renderedHtml` over `body`, fall back to old extraction logic
3. Import and use `buildEmailHtml` from `convex/mail/emailShell.ts` instead of the inline `buildHtml` function
4. Export `substituteVariables` so it can be reused

Key changes:
- In `getTemplateAndLayout`: add `const brandConfig = await ctx.db.query("emailBrandConfig").withIndex("by_org", ...).first()` and return it alongside template and layout
- In `sendTemplateEmail`: check for `template.renderedHtml` first, then fall back to old `body` JSON extraction. Use `buildEmailHtml` with brand config (or layout for backward compat).

- [ ] **Step 4: Run existing email tests to verify no regression**

Run: `cd /Users/alfred/projects/crm_new && npx vitest run tests/convex/emailEventTrigger.test.ts tests/convex/emailActivities.test.ts --reporter=verbose`
Expected: PASS — all existing email tests still green.

- [ ] **Step 5: Typecheck**

Run: `npx tsc -p convex/tsconfig.json --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add convex/emailSending.ts tests/convex/emailRendering.test.ts
git commit -m "feat: update email sending pipeline to use renderedHtml + brand config shell"
```

---

### Task 6: Create system template seed catalog

**Files:**
- Create: `convex/emailTemplateSeed.ts` — batched internal mutations for seeding 60 templates x 2 locales

- [ ] **Step 1: Create template definitions catalog**

Create `convex/emailTemplateSeed.ts` with all 60 template definitions as a data array:

```typescript
import { internalMutation, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

interface SystemTemplateDef {
  slug: string;
  category: string;
  module: string;
  eventType?: string;
  requiredSources: string[];
  pl: { name: string; subject: string; body: string };
  en: { name: string; subject: string; body: string };
}

const SYSTEM_TEMPLATES: SystemTemplateDef[] = [
  // Platform / Auth
  {
    slug: "platform.email_verification",
    category: "auth",
    module: "platform",
    requiredSources: ["current_user", "org"],
    pl: {
      name: "Weryfikacja adresu email",
      subject: "Potwierdź swój adres email",
      body: "<p>Cześć {{current_user.name}},</p><p>Kliknij poniższy link, aby potwierdzić swój adres email.</p>",
    },
    en: {
      name: "Email Verification",
      subject: "Verify your email address",
      body: "<p>Hi {{current_user.name}},</p><p>Click the link below to verify your email address.</p>",
    },
  },
  // ... all 60 templates defined here with PL and EN content
  // Each entry follows the same shape
];
```

The file contains the full catalog. Each template has default body content with `{{source.field}}` variable placeholders appropriate to its use case.

- [ ] **Step 2: Add batched seeding mutations**

In the same file, add the batched seeding logic:

```typescript
/** Seed a batch of system templates for an org (called by scheduler). */
export const seedBatch = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    createdBy: v.id("users"),
    startIndex: v.number(),
    batchSize: v.number(),
  },
  handler: async (ctx, args) => {
    const batch = SYSTEM_TEMPLATES.slice(args.startIndex, args.startIndex + args.batchSize);
    const now = Date.now();

    for (const tmpl of batch) {
      for (const locale of ["pl", "en"] as const) {
        // Check if already exists (idempotent)
        const existing = await ctx.db
          .query("emailTemplates")
          .withIndex("by_org_slug_locale", (q) =>
            q.eq("organizationId", args.organizationId)
              .eq("slug", tmpl.slug)
              .eq("locale", locale)
          )
          .first();

        if (existing) continue;

        const content = tmpl[locale];
        await ctx.db.insert("emailTemplates", {
          organizationId: args.organizationId,
          name: content.name,
          subject: content.subject,
          body: content.body,
          renderedHtml: content.body, // default body IS rendered HTML for system templates
          contentJson: undefined, // will be populated when user edits in TipTap
          slug: tmpl.slug,
          category: tmpl.category,
          module: tmpl.module,
          eventType: tmpl.eventType,
          isSystem: true,
          locale,
          requiredSources: tmpl.requiredSources,
          variables: [], // legacy field, empty for new templates
          createdBy: args.createdBy,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  },
});

/** Kick off seeding all system templates in batches of 15 via scheduler.
 *  Each batch runs as a separate mutation invocation to avoid Convex time limits.
 */
export const seedAllSystemTemplates = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    createdBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const BATCH_SIZE = 15;
    const totalTemplates = SYSTEM_TEMPLATES.length;

    for (let i = 0; i < totalTemplates; i += BATCH_SIZE) {
      // Schedule each batch as a separate mutation via scheduler
      await ctx.scheduler.runAfter(0, internal.emailTemplateSeed.seedBatch, {
        organizationId: args.organizationId,
        createdBy: args.createdBy,
        startIndex: i,
        batchSize: BATCH_SIZE,
      });
    }
  },
});

export { SYSTEM_TEMPLATES };
```

- [ ] **Step 3: Write test for seeding**

Create `tests/convex/emailTemplateSeed.test.ts`:

```typescript
import { expect, test, describe } from "vitest";
import { internal } from "../_generated/api";
import { createTestCtx, seedTestUser } from "../_test_helpers";
import { SYSTEM_TEMPLATES } from "../../convex/emailTemplateSeed";

describe("emailTemplateSeed", () => {
  test("seedBatch creates templates for both locales", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    await t.withIdentity(identity).mutation(internal.emailTemplateSeed.seedBatch, {
      organizationId,
      createdBy: userId,
      startIndex: 0,
      batchSize: 2,
    });

    const templates = await t.run(async (ctx) =>
      ctx.db.query("emailTemplates").withIndex("by_org", (q) => q.eq("organizationId", organizationId)).collect()
    );

    // 2 templates x 2 locales = 4 records
    expect(templates).toHaveLength(4);
    expect(templates.filter((t) => t.locale === "pl")).toHaveLength(2);
    expect(templates.filter((t) => t.locale === "en")).toHaveLength(2);
    expect(templates.every((t) => t.isSystem === true)).toBe(true);
  });

  test("seedBatch is idempotent — re-run does not create duplicates", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    // Run twice
    await t.withIdentity(identity).mutation(internal.emailTemplateSeed.seedBatch, {
      organizationId, createdBy: userId, startIndex: 0, batchSize: 2,
    });
    await t.withIdentity(identity).mutation(internal.emailTemplateSeed.seedBatch, {
      organizationId, createdBy: userId, startIndex: 0, batchSize: 2,
    });

    const templates = await t.run(async (ctx) =>
      ctx.db.query("emailTemplates").withIndex("by_org", (q) => q.eq("organizationId", organizationId)).collect()
    );

    expect(templates).toHaveLength(4); // still 4, not 8
  });

  test("SYSTEM_TEMPLATES catalog has 60 entries", () => {
    expect(SYSTEM_TEMPLATES.length).toBe(60);
    // Verify each has required fields
    for (const tmpl of SYSTEM_TEMPLATES) {
      expect(tmpl.slug).toBeTruthy();
      expect(tmpl.category).toBeTruthy();
      expect(tmpl.module).toBeTruthy();
      expect(tmpl.pl.name).toBeTruthy();
      expect(tmpl.en.name).toBeTruthy();
    }
  });
});
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/alfred/projects/crm_new && npx vitest run tests/convex/emailTemplateSeed.test.ts --reporter=verbose`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add convex/emailTemplateSeed.ts tests/convex/emailTemplateSeed.test.ts
git commit -m "feat: add system email template catalog with batched seeding (60 templates x PL/EN)"
```

---

### Task 7: Data migrations (emailLayouts, variables, body, eventBindings)

**Files:**
- Create: `convex/migrations/emailTemplateMigrations.ts`

This task covers 4 data migrations specified in the spec.

- [ ] **Step 1: Create migration file with all 4 migrations**

Create `convex/migrations/emailTemplateMigrations.ts`:

```typescript
import { internalMutation } from "../_generated/server";

/** Migration 1: Copy emailLayouts data into emailBrandConfig */
export const migrateLayoutsToBrandConfig = internalMutation({
  handler: async (ctx) => {
    const layouts = await ctx.db.query("emailLayouts").collect();
    let migrated = 0;
    for (const layout of layouts) {
      const existing = await ctx.db
        .query("emailBrandConfig")
        .withIndex("by_org", (q) => q.eq("organizationId", layout.organizationId))
        .first();
      if (existing) continue;

      await ctx.db.insert("emailBrandConfig", {
        organizationId: layout.organizationId,
        primaryColor: layout.primaryColor ?? "#2563eb",
        backgroundColor: layout.backgroundColor,
        contentBackgroundColor: layout.contentBackgroundColor,
        textColor: "#1f2937",
        secondaryTextColor: "#6b7280",
        accentColor: "#7c3aed",
        logoUrl: layout.logoUrl,
        companyName: layout.companyName,
        footerText: layout.footerText,
        createdBy: layout.updatedBy,
        createdAt: layout.updatedAt,
        updatedBy: layout.updatedBy,
        updatedAt: layout.updatedAt,
      });
      migrated++;
    }
    return { migrated };
  },
});

/** Migration 2: Extract requiredSources from variables array */
export const migrateVariablesToRequiredSources = internalMutation({
  handler: async (ctx) => {
    const templates = await ctx.db.query("emailTemplates").collect();
    let migrated = 0;
    for (const tmpl of templates) {
      if (tmpl.requiredSources && tmpl.requiredSources.length > 0) continue;
      if (!tmpl.variables || tmpl.variables.length === 0) continue;

      const sources = [...new Set(tmpl.variables.map((v: any) => v.source))];
      await ctx.db.patch(tmpl._id, { requiredSources: sources });
      migrated++;
    }
    return { migrated };
  },
});

/** Migration 3: Extract renderedHtml from GrapesJS body JSON */
export const migrateBodyToRenderedHtml = internalMutation({
  handler: async (ctx) => {
    const templates = await ctx.db
      .query("emailTemplates")
      .filter((q) => q.eq(q.field("renderedHtml"), undefined))
      .take(100);
    let migrated = 0;
    for (const tmpl of templates) {
      if (!tmpl.body) continue;
      let html = tmpl.body;
      try {
        const parsed = JSON.parse(tmpl.body);
        if (parsed.html) html = parsed.html;
      } catch {
        // body is already raw HTML, use as-is
      }
      await ctx.db.patch(tmpl._id, { renderedHtml: html });
      migrated++;
    }
    return { migrated };
  },
});

/** Migration 4: Add templateSlug to emailEventBindings for locale-aware lookup */
export const migrateEventBindingsToSlug = internalMutation({
  handler: async (ctx) => {
    const bindings = await ctx.db.query("emailEventBindings").collect();
    let migrated = 0;
    for (const binding of bindings) {
      if ((binding as any).templateSlug) continue;
      const template = await ctx.db.get(binding.templateId);
      if (template?.slug) {
        await ctx.db.patch(binding._id, { templateSlug: template.slug } as any);
        migrated++;
      }
    }
    return { migrated };
  },
});
```

- [ ] **Step 2: Run migrations in sequence on dev**

```bash
# Run each migration via Convex dashboard or CLI
npx convex run migrations/emailTemplateMigrations:migrateLayoutsToBrandConfig
npx convex run migrations/emailTemplateMigrations:migrateVariablesToRequiredSources
npx convex run migrations/emailTemplateMigrations:migrateBodyToRenderedHtml
npx convex run migrations/emailTemplateMigrations:migrateEventBindingsToSlug
```

- [ ] **Step 3: Verify no data loss**

Query email templates and brand config to verify migrated data is correct.

- [ ] **Step 4: Commit**

```bash
git add convex/migrations/emailTemplateMigrations.ts
git commit -m "feat: add email template data migrations (layouts, variables, body, eventBindings)"
```

---

### Task 8: Update substituteVariables for dot-notation syntax

**Files:**
- Modify: `convex/emailSending.ts` — extend `substituteVariables` to handle `{{source.field}}` pattern for any source prefix, not just `event.`

- [ ] **Step 1: Read current substituteVariables**

Read `convex/emailSending.ts` lines 16-30 to see the current implementation. It handles `{{key}}` flat and `event.` prefix stripping.

- [ ] **Step 2: Extend to handle all source prefixes**

Update `substituteVariables` to try both flat key and any dot-prefix:

```typescript
export function substituteVariables(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => {
    const trimmed = key.trim();
    // Exact match first
    if (variables[trimmed] !== undefined) return variables[trimmed];
    // Try stripping any source prefix (e.g., "patient.name" -> "name", "event.patientName" -> "patientName")
    const dotIndex = trimmed.indexOf(".");
    if (dotIndex > 0) {
      const flatKey = trimmed.slice(dotIndex + 1);
      if (variables[flatKey] !== undefined) return variables[flatKey];
    }
    return `{{${trimmed}}}`;
  });
}
```

- [ ] **Step 3: Export the function**

Ensure `substituteVariables` is exported (add `export` keyword if not already).

- [ ] **Step 4: Run existing email tests**

Run: `cd /Users/alfred/projects/crm_new && npx vitest run tests/convex/emailEventTrigger.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/emailSending.ts
git commit -m "feat: extend substituteVariables to handle dot-notation source prefixes"
```

---

### Task 9: Build email template editor UI with 600px preview

**Files:**
- Create: `src/components/email/template-editor.tsx` — TipTap editor wrapped in email shell preview
- Modify: `src/routes/_app/_auth/dashboard/_layout.settings.email-templates.new.tsx` or relevant route — use new editor
- Modify: existing email template edit route — use new editor

- [ ] **Step 1: Create the email template editor component**

Create `src/components/email/template-editor.tsx`. This component:
- Renders a 600px-width container with the org's brand header/footer (read-only, faded)
- Inside the container: TipTap editor with the same extensions as `src/components/gabinet/template-editor.tsx`
- Variable mention support using `VariableMentionCurly` extension
- Right sidebar with available variables grouped by data source
- On save: calls `editor.getJSON()` for contentJson AND `generateHTML()` for renderedHtml, passes both to the save mutation
- Subject line input with inline `{{variable}}` support

The component should import TipTap extensions from the same source as the document template editor to ensure consistency.

- [ ] **Step 2: Read existing template editor for reference**

Read `src/components/gabinet/template-editor.tsx` to understand the exact TipTap configuration, extensions, and variable mention setup used for documents. Mirror this setup.

Read `src/components/gabinet/variable-mention.tsx` for the mention extension configuration.

- [ ] **Step 3: Build the component**

The editor wraps TipTap in a visual email shell container:

```tsx
// Outer container mimics email client
<div className="mx-auto max-w-[600px] border border-gray-200 rounded-lg overflow-hidden bg-white">
  {/* Brand header (read-only, faded) */}
  <div className="opacity-60 pointer-events-none border-b border-gray-200 p-6 text-center">
    {brandConfig?.logoUrl ? (
      <img src={brandConfig.logoUrl} alt="" className="mx-auto max-h-12" />
    ) : brandConfig?.companyName ? (
      <span className="font-semibold text-lg">{brandConfig.companyName}</span>
    ) : (
      <span className="text-gray-400">{t("emailTemplates.editor.headerPlaceholder")}</span>
    )}
  </div>

  {/* TipTap editor area */}
  <div className="p-8">
    <EditorContent editor={editor} />
  </div>

  {/* Brand footer (read-only, faded) */}
  <div className="opacity-60 pointer-events-none bg-gray-50 p-6 text-center text-xs text-gray-500">
    {brandConfig?.footerText ?? t("emailTemplates.editor.footerPlaceholder")}
  </div>
</div>
```

- [ ] **Step 4: Wire to email template routes**

Update the email template create/edit routes to use the new `EmailTemplateEditor` component instead of the GrapesJS `EmailBuilderLazy`.

- [ ] **Step 5: Add i18n keys**

Add PL and EN translation keys for the email template editor under `emailTemplates.editor.*` namespace.

- [ ] **Step 6: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/email/template-editor.tsx src/routes/_app/_auth/dashboard/_layout.settings.email-templates* public/locales/*/translation.json
git commit -m "feat: add TipTap email template editor with 600px shell preview"
```

---

### Task 10: Build email brand config editor UI

**Files:**
- Create: `src/components/settings/email-brand-editor.tsx`

- [ ] **Step 1: Create the brand config editor component**

The component renders:
- Logo upload (using existing file upload pattern with `generateUploadUrl`)
- Company name text input
- 6 color picker inputs (hex, using native `<input type="color">` or a simple hex input)
- Footer text textarea
- Social links section (4 URL inputs: website, facebook, instagram, linkedin)
- Live preview panel: renders a sample email with the current settings using `buildEmailHtml` (imported from a shared utility or replicated as a frontend helper)

The form uses `useForm` from TanStack Form. On submit, calls `api.emailBrandConfig.upsert`.

- [ ] **Step 2: Add to settings mail page**

The brand config editor will be used in the unified mail settings page (F2 Task). For now, ensure it's a standalone component that can be imported.

- [ ] **Step 3: Add i18n keys**

Add PL/EN keys under `settings.emailBrand.*` namespace.

- [ ] **Step 4: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/email-brand-editor.tsx public/locales/*/translation.json
git commit -m "feat: add email brand config editor with live preview"
```

---

### Task 11: Remove GrapesJS and clean up

**Files:**
- Remove: `src/components/email-builder/` directory (email-builder.tsx, merge-tags-plugin.ts, editor-config.ts, and any other files)
- Modify: any routes that imported GrapesJS components — update to use new TipTap editor
- Modify: `package.json` — remove `@grapesjs/studio-sdk` and `grapesjs` dependencies

- [ ] **Step 1: Find all GrapesJS imports**

Run: `grep -rn "grapesjs\|GrapesJS\|EmailBuilder\|email-builder" src/ --include="*.tsx" --include="*.ts"`

This reveals all files that reference the old email builder.

- [ ] **Step 2: Update all importing files**

Replace GrapesJS imports with the new TipTap `EmailTemplateEditor` component.

- [ ] **Step 3: Remove email-builder directory**

```bash
rm -rf src/components/email-builder/
```

- [ ] **Step 4: Remove GrapesJS dependencies**

```bash
npm uninstall @grapesjs/studio-sdk grapesjs
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: PASS — no remaining references to removed modules.

- [ ] **Step 6: Commit**

```bash
git rm -rf src/components/email-builder/
git add package.json package-lock.json [any updated route files]
git commit -m "refactor: remove GrapesJS email builder, replaced by TipTap template editor"
```
