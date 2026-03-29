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
