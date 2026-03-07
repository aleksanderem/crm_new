import { action } from "./_generated/server";
import { v } from "convex/values";
import { Resend } from "resend";

const APP_URL = process.env.APP_URL ?? "https://app.example.com";

// ---------------------------------------------------------------------------
// Send signing request email
// ---------------------------------------------------------------------------

export const sendSigningRequestEmail = action({
  args: {
    signerName: v.string(),
    signerEmail: v.string(),
    documentTitle: v.string(),
    organizationName: v.string(),
    token: v.string(),
    expiresAt: v.number(),
  },
  handler: async (_ctx, args): Promise<{ sent: boolean }> => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn("RESEND_API_KEY not set — skipping email");
      return { sent: false };
    }

    const resend = new Resend(apiKey);
    const signingUrl = `${APP_URL}/sign/${args.token}`;
    const expiryDate = new Date(args.expiresAt).toLocaleDateString("pl-PL");

    await resend.emails.send({
      from: process.env.RESEND_FROM ?? "noreply@example.com",
      to: args.signerEmail,
      subject: `Dokument do podpisania — "${args.documentTitle}"`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Dokument do podpisania</h2>
          <p>Cześć ${args.signerName},</p>
          <p>Organizacja <strong>${args.organizationName}</strong> prosi o podpisanie dokumentu:</p>
          <p style="font-size: 18px; font-weight: 600; color: #111;">${args.documentTitle}</p>
          <p>
            <a href="${signingUrl}"
               style="display: inline-block; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500;">
              Podpisz dokument
            </a>
          </p>
          <p style="color: #666; font-size: 14px;">
            Link ważny do: ${expiryDate}
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="color: #999; font-size: 12px;">
            Jeśli nie spodziewałeś się tej wiadomości, możesz ją zignorować.
          </p>
        </div>
      `,
    });

    return { sent: true };
  },
});

// ---------------------------------------------------------------------------
// Notify document author when a slot is signed
// ---------------------------------------------------------------------------

export const sendSlotSignedNotification = action({
  args: {
    authorEmail: v.string(),
    authorName: v.string(),
    documentTitle: v.string(),
    signerName: v.string(),
    slotLabel: v.string(),
    allSigned: v.boolean(),
  },
  handler: async (_ctx, args): Promise<{ sent: boolean }> => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return { sent: false };

    const resend = new Resend(apiKey);

    const subject = args.allSigned
      ? `Dokument podpisany — "${args.documentTitle}"`
      : `Podpis złożony — "${args.documentTitle}"`;

    const body = args.allSigned
      ? `<p>Wszystkie podpisy zostały złożone na dokumencie <strong>${args.documentTitle}</strong>. Dokument jest teraz w pełni podpisany.</p>`
      : `<p><strong>${args.signerName}</strong> złożył podpis na slocie „${args.slotLabel}" dokumentu <strong>${args.documentTitle}</strong>.</p>`;

    await resend.emails.send({
      from: process.env.RESEND_FROM ?? "noreply@example.com",
      to: args.authorEmail,
      subject,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">${subject}</h2>
          <p>Cześć ${args.authorName},</p>
          ${body}
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="color: #999; font-size: 12px;">
            Powiadomienie automatyczne.
          </p>
        </div>
      `,
    });

    return { sent: true };
  },
});
