"use node";

import type { MailAdapter, SendOptions, SendResult, ConnectionTestResult } from "../adapter";

export function createMailgunAdapter(
  apiKey: string,
  domain: string,
  fromEmail: string,
  fromName: string,
  region: string = "us",
): MailAdapter {
  const BASE_URL = region === "eu"
    ? `https://api.eu.mailgun.net/v3/${domain}`
    : `https://api.mailgun.net/v3/${domain}`;

  return {
    async send(options: SendOptions): Promise<SendResult> {
      const form = new URLSearchParams();
      form.append("from", `${fromName} <${fromEmail}>`);
      const recipients = Array.isArray(options.to) ? options.to : [options.to];
      recipients.forEach((r) => form.append("to", r));
      form.append("subject", options.subject);
      form.append("html", options.html);
      if (options.text) form.append("text", options.text);
      options.cc?.forEach((r) => form.append("cc", r));
      options.bcc?.forEach((r) => form.append("bcc", r));
      if (options.replyTo) form.append("h:Reply-To", options.replyTo);

      const response = await fetch(`${BASE_URL}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`api:${apiKey}`)}`,
        },
        body: form,
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error };
      }
      const data = await response.json();
      return { success: true, messageId: data.id };
    },

    async testConnection(): Promise<ConnectionTestResult> {
      try {
        const response = await fetch(`${BASE_URL}`, {
          headers: { Authorization: `Basic ${btoa(`api:${apiKey}`)}` },
        });
        if (!response.ok) return { success: false, error: "Invalid API key or domain" };
        return { success: true, accountEmail: fromEmail };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  };
}
