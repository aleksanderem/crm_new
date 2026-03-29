"use node";

import { Resend } from "resend";
import type { MailAdapter, SendOptions, SendResult } from "../adapter";

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
  };
}
