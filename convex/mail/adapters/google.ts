"use node";

import type {
  MailAdapter,
  SendOptions,
  SendResult,
  FetchInboxOptions,
  InboxResult,
  InboxMessage,
  ConnectionTestResult,
} from "../adapter";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const TOKEN_REFRESH_URL = "https://oauth2.googleapis.com/token";

interface GmailMessagePart {
  mimeType: string;
  body?: { data?: string; size?: number };
  parts?: GmailMessagePart[];
  headers?: { name: string; value: string }[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  snippet?: string;
  labelIds?: string[];
  payload?: GmailMessagePart & { headers?: { name: string; value: string }[] };
  internalDate?: string;
}

function buildRawMessage(from: string, options: SendOptions): string {
  const toHeader = (Array.isArray(options.to) ? options.to : [options.to]).join(", ");

  // Encode subject as UTF-8 base64 per RFC 2047
  const subjectEncoded =
    "=?UTF-8?B?" + Buffer.from(options.subject, "utf-8").toString("base64") + "?=";

  let raw = `From: ${from}\r\n`;
  raw += `To: ${toHeader}\r\n`;
  if (options.cc && options.cc.length > 0) {
    raw += `Cc: ${options.cc.join(", ")}\r\n`;
  }
  if (options.bcc && options.bcc.length > 0) {
    raw += `Bcc: ${options.bcc.join(", ")}\r\n`;
  }
  if (options.replyTo) {
    raw += `Reply-To: ${options.replyTo}\r\n`;
  }
  raw += `Subject: ${subjectEncoded}\r\n`;

  if (options.html && options.text) {
    // Multipart alternative
    const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    raw += `MIME-Version: 1.0\r\n`;
    raw += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n`;
    raw += `\r\n`;
    raw += `--${boundary}\r\n`;
    raw += `Content-Type: text/plain; charset=utf-8\r\n`;
    raw += `Content-Transfer-Encoding: base64\r\n`;
    raw += `\r\n`;
    raw += Buffer.from(options.text, "utf-8").toString("base64") + "\r\n";
    raw += `--${boundary}\r\n`;
    raw += `Content-Type: text/html; charset=utf-8\r\n`;
    raw += `Content-Transfer-Encoding: base64\r\n`;
    raw += `\r\n`;
    raw += Buffer.from(options.html, "utf-8").toString("base64") + "\r\n";
    raw += `--${boundary}--\r\n`;
  } else {
    const body = options.html ?? options.text ?? "";
    const contentType = options.html
      ? "text/html; charset=utf-8"
      : "text/plain; charset=utf-8";
    raw += `MIME-Version: 1.0\r\n`;
    raw += `Content-Type: ${contentType}\r\n`;
    raw += `Content-Transfer-Encoding: base64\r\n`;
    raw += `\r\n`;
    raw += Buffer.from(body, "utf-8").toString("base64") + "\r\n";
  }

  return raw;
}

function encodeBase64Url(str: string): string {
  return Buffer.from(str, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decodeBase64Url(str: string): string {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf-8");
}

function getHeader(
  headers: { name: string; value: string }[] | undefined,
  name: string
): string {
  if (!headers) return "";
  return (
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ""
  );
}

function extractEmailAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return match ? match[1].trim() : raw.trim();
}

function extractEmailAddresses(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => extractEmailAddress(s))
    .filter(Boolean);
}

function findBodyPart(
  part: GmailMessagePart,
  mimeType: string
): string | undefined {
  if (part.mimeType === mimeType && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }
  if (part.parts) {
    for (const child of part.parts) {
      const found = findBodyPart(child, mimeType);
      if (found) return found;
    }
  }
  return undefined;
}

function parseGmailMessage(msg: GmailMessage): InboxMessage {
  const headers = msg.payload?.headers ?? [];
  const from = getHeader(headers, "From");
  const toRaw = getHeader(headers, "To");
  const ccRaw = getHeader(headers, "Cc");
  const subject = getHeader(headers, "Subject") || "(no subject)";
  const dateHeader = getHeader(headers, "Date");

  const sentAt = msg.internalDate
    ? parseInt(msg.internalDate, 10)
    : dateHeader
      ? new Date(dateHeader).getTime()
      : Date.now();

  const isRead = !(msg.labelIds ?? []).includes("UNREAD");

  const bodyHtml = msg.payload ? findBodyPart(msg.payload, "text/html") : undefined;
  const bodyText = msg.payload
    ? findBodyPart(msg.payload, "text/plain")
    : undefined;

  const cc =
    ccRaw ? extractEmailAddresses(ccRaw) : undefined;

  return {
    externalId: msg.id,
    threadId: msg.threadId,
    from: extractEmailAddress(from),
    to: extractEmailAddresses(toRaw),
    cc: cc && cc.length > 0 ? cc : undefined,
    subject,
    bodyHtml,
    bodyText,
    snippet: msg.snippet,
    sentAt,
    isRead,
  };
}

export function createGoogleAdapter(
  accessToken: string,
  refreshToken: string,
  fromEmail: string,
  fromName: string,
  clientId: string,
  clientSecret: string,
  expiresAt: number,
  onTokenRefresh?: (newAccessToken: string, newExpiresAt: number) => Promise<void>
): MailAdapter {
  let currentAccessToken = accessToken;
  let currentExpiresAt = expiresAt;

  const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

  async function getAccessToken(): Promise<string> {
    // Use a 5-minute buffer before expiry
    if (currentExpiresAt > Date.now() + 5 * 60 * 1000) {
      return currentAccessToken;
    }

    const response = await fetch(TOKEN_REFRESH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to refresh Google access token: ${errText}`);
    }

    const data = await response.json() as {
      access_token: string;
      expires_in: number;
    };

    currentAccessToken = data.access_token;
    currentExpiresAt = Date.now() + data.expires_in * 1000;

    if (onTokenRefresh) {
      await onTokenRefresh(currentAccessToken, currentExpiresAt);
    }

    return currentAccessToken;
  }

  return {
    async send(options: SendOptions): Promise<SendResult> {
      try {
        const token = await getAccessToken();
        const rawMessage = buildRawMessage(from, options);
        const encoded = encodeBase64Url(rawMessage);

        const response = await fetch(`${GMAIL_API_BASE}/messages/send`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw: encoded }),
        });

        if (!response.ok) {
          const errText = await response.text();
          return { success: false, error: `Gmail send failed: ${errText}` };
        }

        const result = await response.json() as { id: string };
        return { success: true, messageId: result.id };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async fetchInbox(options: FetchInboxOptions): Promise<InboxResult> {
      const token = await getAccessToken();
      const maxResults = options.maxResults ?? 50;

      const params = new URLSearchParams({
        labelIds: "INBOX",
        maxResults: String(maxResults),
      });
      if (options.pageToken) params.set("pageToken", options.pageToken);
      if (options.query) params.set("q", options.query);

      const listResponse = await fetch(
        `${GMAIL_API_BASE}/messages?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!listResponse.ok) {
        throw new Error(`Failed to list Gmail messages: ${await listResponse.text()}`);
      }

      const listData = await listResponse.json() as {
        messages?: { id: string; threadId: string }[];
        nextPageToken?: string;
      };

      const messageRefs = listData.messages ?? [];
      const messages: InboxMessage[] = [];

      for (const ref of messageRefs) {
        const msgResponse = await fetch(
          `${GMAIL_API_BASE}/messages/${ref.id}?format=full`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!msgResponse.ok) continue;

        const msgData = await msgResponse.json() as GmailMessage;
        messages.push(parseGmailMessage(msgData));
      }

      return {
        messages,
        nextPageToken: listData.nextPageToken,
      };
    },

    async fetchThread(threadId: string): Promise<InboxMessage[]> {
      const token = await getAccessToken();

      const response = await fetch(
        `${GMAIL_API_BASE}/threads/${threadId}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch Gmail thread: ${await response.text()}`);
      }

      const data = await response.json() as { messages?: GmailMessage[] };
      const threadMessages = data.messages ?? [];

      return threadMessages.map(parseGmailMessage);
    },

    async markRead(messageId: string): Promise<void> {
      const token = await getAccessToken();

      const response = await fetch(
        `${GMAIL_API_BASE}/messages/${messageId}/modify`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to mark message as read: ${await response.text()}`);
      }
    },

    async testConnection(): Promise<ConnectionTestResult> {
      try {
        const token = await getAccessToken();

        const response = await fetch(`${GMAIL_API_BASE}/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          const errText = await response.text();
          return { success: false, error: `Gmail profile fetch failed: ${errText}` };
        }

        const profile = await response.json() as { emailAddress?: string };
        return { success: true, accountEmail: profile.emailAddress };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}
