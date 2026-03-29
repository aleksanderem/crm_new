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

export function applyBrandColors(
  html: string,
  primaryColor: string,
  accentColor: string,
): string {
  // Apply primaryColor to button-style links (have background-color in style)
  let result = html.replace(
    /<a\s([^>]*style="[^"]*background-color:[^"]*"[^>]*)>/gi,
    (_match, attrs) => {
      const updated = attrs.replace(
        /background-color:\s*[^;"]+/gi,
        `background-color:${primaryColor}`,
      );
      return `<a ${updated}>`;
    },
  );

  // Apply accentColor to plain links (no background-color)
  result = result.replace(/<a\s([^>]*)>/gi, (match, attrs) => {
    if (/background-color/i.test(attrs)) return match;
    if (/style="/i.test(attrs)) {
      const updated = attrs.replace(
        /style="/,
        `style="color:${accentColor};`,
      );
      return `<a ${updated}>`;
    }
    return `<a style="color:${accentColor};" ${attrs}>`;
  });

  return result;
}

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

  const coloredBody = applyBrandColors(bodyContent, primaryColor, accentColor);

  let headerHtml = "";
  if (logoUrl) {
    headerHtml = `<tr><td style="padding:24px;text-align:center;border-bottom:1px solid #e5e7eb;"><img src="${logoUrl}" alt="${companyName ?? ""}" style="max-height:48px;" /></td></tr>`;
  } else if (companyName) {
    headerHtml = `<tr><td style="padding:24px;text-align:center;border-bottom:1px solid #e5e7eb;font-weight:600;font-size:18px;color:${textColor};">${companyName}</td></tr>`;
  }

  let footerHtml = "";
  if (footerText || socialLinks) {
    const socialHtml = socialLinks
      ? [
          socialLinks.website,
          socialLinks.facebook,
          socialLinks.instagram,
          socialLinks.linkedin,
        ]
          .filter(Boolean)
          .map(
            (url) =>
              `<a href="${url}" style="color:${secondaryTextColor};text-decoration:underline;margin:0 4px;">${new URL(url!).hostname}</a>`,
          )
          .join(" ")
      : "";
    footerHtml = `<tr><td style="background:#f9fafb;padding:24px;text-align:center;color:${secondaryTextColor};font-size:12px;line-height:1.5;">${footerText ? `<div>${footerText}</div>` : ""}${socialHtml ? `<div style="margin-top:8px;">${socialHtml}</div>` : ""}</td></tr>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:${backgroundColor};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:${backgroundColor};min-height:100vh;"><tr><td align="center" style="padding:32px 16px;"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${contentBackgroundColor};border-radius:8px;overflow:hidden;">${headerHtml}<tr><td style="padding:32px 24px;color:${textColor};font-size:15px;line-height:1.6;">${coloredBody}</td></tr>${footerHtml}</table></td></tr></table></body></html>`;
}
