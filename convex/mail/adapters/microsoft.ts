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

export function createMicrosoftAdapter(
  accessToken: string,
  _refreshToken: string,
  _fromEmail: string,
  _fromName: string,
): MailAdapter {
  const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

  return {
    async send(options: SendOptions): Promise<SendResult> {
      const message = {
        subject: options.subject,
        body: { contentType: "HTML", content: options.html },
        toRecipients: (Array.isArray(options.to) ? options.to : [options.to]).map(
          (email) => ({ emailAddress: { address: email } })
        ),
        ccRecipients: options.cc?.map((email) => ({ emailAddress: { address: email } })),
      };

      const response = await fetch(`${GRAPH_BASE}/me/sendMail`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message, saveToSentItems: true }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error };
      }
      return { success: true };
    },

    async fetchInbox(options: FetchInboxOptions): Promise<InboxResult> {
      const params = new URLSearchParams({
        $top: String(options.maxResults ?? 50),
        $orderby: "receivedDateTime desc",
        $select:
          "id,conversationId,from,toRecipients,ccRecipients,subject,bodyPreview,body,isRead,receivedDateTime",
      });

      const response = await fetch(`${GRAPH_BASE}/me/messages?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) return { messages: [] };
      const data = await response.json() as {
        value: Array<{
          id: string;
          conversationId: string;
          from?: { emailAddress?: { address?: string } };
          toRecipients?: Array<{ emailAddress: { address: string } }>;
          ccRecipients?: Array<{ emailAddress: { address: string } }>;
          subject?: string;
          body?: { contentType: string; content: string };
          bodyPreview?: string;
          isRead: boolean;
          receivedDateTime: string;
        }>;
        "@odata.nextLink"?: string;
      };

      const messages: InboxMessage[] = data.value.map((msg) => ({
        externalId: msg.id,
        threadId: msg.conversationId,
        from: msg.from?.emailAddress?.address ?? "",
        to: msg.toRecipients?.map((r) => r.emailAddress.address) ?? [],
        cc: msg.ccRecipients?.map((r) => r.emailAddress.address),
        subject: msg.subject ?? "",
        bodyHtml:
          msg.body?.contentType === "html" ? msg.body.content : undefined,
        bodyText:
          msg.body?.contentType === "text" ? msg.body.content : undefined,
        snippet: msg.bodyPreview,
        sentAt: new Date(msg.receivedDateTime).getTime(),
        isRead: msg.isRead,
      }));

      return { messages, nextPageToken: data["@odata.nextLink"] };
    },

    async fetchThread(threadId: string): Promise<InboxMessage[]> {
      const params = new URLSearchParams({
        $filter: `conversationId eq '${threadId}'`,
        $orderby: "receivedDateTime asc",
        $select:
          "id,conversationId,from,toRecipients,ccRecipients,subject,bodyPreview,body,isRead,receivedDateTime",
      });

      const response = await fetch(`${GRAPH_BASE}/me/messages?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) return [];
      const data = await response.json() as {
        value: Array<{
          id: string;
          conversationId: string;
          from?: { emailAddress?: { address?: string } };
          toRecipients?: Array<{ emailAddress: { address: string } }>;
          ccRecipients?: Array<{ emailAddress: { address: string } }>;
          subject?: string;
          body?: { contentType: string; content: string };
          bodyPreview?: string;
          isRead: boolean;
          receivedDateTime: string;
        }>;
      };

      return data.value.map((msg) => ({
        externalId: msg.id,
        threadId: msg.conversationId,
        from: msg.from?.emailAddress?.address ?? "",
        to: msg.toRecipients?.map((r) => r.emailAddress.address) ?? [],
        cc: msg.ccRecipients?.map((r) => r.emailAddress.address),
        subject: msg.subject ?? "",
        bodyHtml:
          msg.body?.contentType === "html" ? msg.body.content : undefined,
        bodyText:
          msg.body?.contentType === "text" ? msg.body.content : undefined,
        snippet: msg.bodyPreview,
        sentAt: new Date(msg.receivedDateTime).getTime(),
        isRead: msg.isRead,
      }));
    },

    async markRead(externalMessageId: string): Promise<void> {
      await fetch(`${GRAPH_BASE}/me/messages/${externalMessageId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isRead: true }),
      });
    },

    async testConnection(): Promise<ConnectionTestResult> {
      try {
        const response = await fetch(`${GRAPH_BASE}/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) return { success: false, error: "Auth failed" };
        const data = await response.json() as {
          mail?: string;
          userPrincipalName?: string;
        };
        return {
          success: true,
          accountEmail: data.mail || data.userPrincipalName,
        };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  };
}
