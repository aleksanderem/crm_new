"use node";

import { Resend } from "resend";
import type { MailAdapter, SendOptions, SendResult, ConnectionTestResult } from "../adapter";

export function createResendAdapter(apiKey: string, fromEmail: string, fromName: string): MailAdapter {
  const resend = new Resend(apiKey);

  return {
    async send(options: SendOptions): Promise<SendResult> {
      try {
        const result = await resend.emails.send({
          from: `${fromName} <${fromEmail}>`,
          to: Array.isArray(options.to) ? options.to : [options.to],
          subject: options.subject,
          html: options.html,
          text: options.text,
          cc: options.cc,
          bcc: options.bcc,
          reply_to: options.replyTo,
        });

        if (result.error) {
          return { success: false, error: result.error.message };
        }

        return { success: true, messageId: result.data?.id };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },

    async testConnection(): Promise<ConnectionTestResult> {
      if (!apiKey) {
        return { success: false, error: "Missing API key" };
      }
      try {
        const response = await fetch("https://api.resend.com/domains", {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          if (response.status === 401 || response.status === 403) {
            return { success: false, error: "Invalid API key" };
          }
          return { success: false, error: text || `HTTP ${response.status}` };
        }
        return { success: true, accountEmail: fromEmail };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  };
}
