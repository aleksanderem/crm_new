// Multi-provider send dispatch for platform-level emails.
//
// Each helper takes the rendered email + per-provider credentials and POSTs
// to the provider's API. Errors throw so the caller can log+swallow as it
// sees fit (the invitations action does this already).
//
// Google/Microsoft are NOT implemented here — they require OAuth tokens
// scoped to a specific mailbox, not API keys, and there's no platform-level
// OAuth flow yet. Use Resend or Mailgun.

export type ProviderEmail = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
};

export async function sendViaResend(
  email: ProviderEmail,
  cfg: { apiKey: string },
) {
  if (!email.from) {
    throw new Error("sendViaResend: from is required when using a custom Resend key");
  }
  const body = {
    from: email.from,
    to: email.to,
    subject: email.subject,
    html: email.html,
    ...(email.text ? { text: email.text } : {}),
    ...(email.replyTo ? { reply_to: email.replyTo } : {}),
  };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend send failed (${res.status}): ${detail}`);
  }
}

export async function sendViaMailgun(
  email: ProviderEmail,
  cfg: { apiKey: string; domain: string; region: "us" | "eu" },
) {
  if (!email.from) {
    throw new Error("sendViaMailgun: from is required");
  }
  const base =
    cfg.region === "eu"
      ? "https://api.eu.mailgun.net/v3"
      : "https://api.mailgun.net/v3";

  const form = new URLSearchParams();
  form.set("from", email.from);
  form.set("to", email.to);
  form.set("subject", email.subject);
  form.set("html", email.html);
  if (email.text) form.set("text", email.text);
  if (email.replyTo) form.set("h:Reply-To", email.replyTo);

  const auth = "Basic " + Buffer.from(`api:${cfg.apiKey}`).toString("base64");
  const res = await fetch(`${base}/${encodeURIComponent(cfg.domain)}/messages`, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Mailgun send failed (${res.status}): ${detail}`);
  }
}
