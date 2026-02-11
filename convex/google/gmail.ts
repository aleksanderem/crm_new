import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { getValidAccessToken } from "./_helpers";

export const sendViaGmail = action({
  args: {
    organizationId: v.id("organizations"),
    to: v.array(v.string()),
    cc: v.optional(v.array(v.string())),
    bcc: v.optional(v.array(v.string())),
    subject: v.string(),
    bodyHtml: v.optional(v.string()),
    bodyText: v.optional(v.string()),
    contactId: v.optional(v.id("contacts")),
    companyId: v.optional(v.id("companies")),
    leadId: v.optional(v.id("leads")),
    inReplyTo: v.optional(v.string()),
    threadId: v.optional(v.string()),
    sentBy: v.id("users"),
    fromEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const token = await getValidAccessToken(ctx, args.organizationId);
    if (!token) throw new Error("Google not connected");

    // Build RFC 2822 MIME message
    const toHeader = args.to.join(", ");
    const ccHeader = args.cc?.join(", ") ?? "";
    const body = args.bodyHtml ?? args.bodyText ?? "";
    const contentType = args.bodyHtml
      ? "text/html; charset=utf-8"
      : "text/plain; charset=utf-8";

    let rawMessage = `From: ${args.fromEmail}\r\n`;
    rawMessage += `To: ${toHeader}\r\n`;
    if (ccHeader) rawMessage += `Cc: ${ccHeader}\r\n`;
    rawMessage += `Subject: ${args.subject}\r\n`;
    if (args.inReplyTo) rawMessage += `In-Reply-To: ${args.inReplyTo}\r\n`;
    rawMessage += `Content-Type: ${contentType}\r\n`;
    rawMessage += `\r\n`;
    rawMessage += body;

    // Base64url encode
    const encoded = btoa(unescape(encodeURIComponent(rawMessage)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: encoded }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gmail send failed:", errText);
      throw new Error("Failed to send via Gmail");
    }

    const result = await response.json();

    // Store email record
    await ctx.runMutation(internal.emails_internal.insertOutboundGmail, {
      organizationId: args.organizationId,
      to: args.to,
      cc: args.cc,
      bcc: args.bcc,
      subject: args.subject,
      bodyHtml: args.bodyHtml,
      bodyText: args.bodyText,
      fromEmail: args.fromEmail,
      gmailMessageId: result.id as string,
      gmailThreadId: (result.threadId as string) ?? undefined,
      inReplyTo: args.inReplyTo,
      threadId: args.threadId,
      contactId: args.contactId,
      companyId: args.companyId,
      leadId: args.leadId,
      sentBy: args.sentBy,
    });

    return result.id;
  },
});

export const syncInbox = action({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const token = await getValidAccessToken(ctx, args.organizationId);
    if (!token) throw new Error("Google not connected");

    // Fetch recent inbox messages (last 50)
    const listResponse = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&maxResults=50",
      {
        headers: { Authorization: `Bearer ${token.accessToken}` },
      }
    );

    if (!listResponse.ok) {
      throw new Error("Failed to list Gmail messages");
    }

    const listData = await listResponse.json();
    const messages = (listData.messages ?? []) as { id: string; threadId: string }[];

    let synced = 0;

    for (const msg of messages) {
      // Fetch full message
      const msgResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
        {
          headers: { Authorization: `Bearer ${token.accessToken}` },
        }
      );

      if (!msgResponse.ok) continue;

      const msgData = await msgResponse.json();
      const headers = (msgData.payload?.headers ?? []) as {
        name: string;
        value: string;
      }[];

      const getHeader = (name: string) =>
        headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

      const from = getHeader("From");
      const to = getHeader("To");
      const subject = getHeader("Subject");
      const snippet = msgData.snippet as string | undefined;

      // Extract email from "Name <email>" format
      const fromEmail = from.includes("<")
        ? from.match(/<(.+)>/)?.[1] ?? from
        : from;

      const toAddresses = to
        .split(",")
        .map((s: string) => {
          const match = s.match(/<(.+)>/);
          return match ? match[1].trim() : s.trim();
        })
        .filter(Boolean);

      await ctx.runMutation(internal.emails_internal.insertInboundGmail, {
        organizationId: args.organizationId,
        gmailMessageId: msg.id,
        gmailThreadId: msg.threadId,
        from: fromEmail,
        to: toAddresses,
        subject: subject || "(no subject)",
        snippet,
      });

      synced++;
    }

    return { synced };
  },
});
