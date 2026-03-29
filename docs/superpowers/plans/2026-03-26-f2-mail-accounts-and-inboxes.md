# F2: Connected Mail Accounts & Inboxes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify mail configuration into a single "Poczta" / "Mail" settings page with a provider abstraction layer supporting Google, Microsoft, Mailgun, and Resend. Extend inbox with multi-mailbox switching, shared mailboxes, and gabinet entity linking.

**Architecture:** New `mailProviders` table with per-provider config (OAuth tokens or API keys). `MailAdapter` interface with implementations per provider. Unified settings page replaces `settings/email` and absorbs mail parts of `settings/integrations`. `oauthConnections` kept alive for Google Calendar. Inbox enhanced with mailbox switcher and extended entity linking to gabinet entities.

**Tech Stack:** Convex (schema, mutations, actions), React, TanStack Router, Vitest

**Spec:** `docs/superpowers/specs/2026-03-26-email-system-overhaul-design.md` (section F2)

**Depends on:** F1 (email template system) for rendering pipeline and emailBrandConfig table/editor (F1 Tasks 1, 8). The "Email Brand" tab in Task 8 Step 5 imports the brand editor component built in F1 Task 8 — F1 must complete Tasks 1-8 before F2 Task 8 can be fully wired.

---

### Task 1: Add mailProviders table to schema

**Files:**
- Modify: `convex/schema/crm.ts` — add `mailProviders` table, extend `emails` table

- [ ] **Step 1: Read current emailAccounts and emails definitions**

Read `convex/schema/crm.ts` lines 620-627 (emailAccounts) and 579-618 (emails).

- [ ] **Step 2: Add mailProviders table**

In `convex/schema/crm.ts`, add inside `createCrmTables`:

```typescript
mailProviders: defineTable({
  organizationId: v.id("organizations"),
  name: v.string(),
  providerType: v.union(
    v.literal("google"),
    v.literal("microsoft"),
    v.literal("mailgun"),
    v.literal("resend"),
  ),
  oauthTokens: v.optional(
    v.object({
      accessToken: v.string(),
      refreshToken: v.string(),
      expiresAt: v.number(),
      scope: v.string(),
      providerAccountId: v.string(),
    })
  ),
  apiConfig: v.optional(
    v.object({
      apiKey: v.string(),
      domain: v.optional(v.string()),
      region: v.optional(v.string()),
    })
  ),
  fromName: v.string(),
  fromEmail: v.string(),
  replyToEmail: v.optional(v.string()),
  capabilities: v.object({
    canSend: v.boolean(),
    canReceive: v.boolean(),
  }),
  isDefault: v.boolean(),
  isShared: v.boolean(),
  assignedUserIds: v.optional(v.array(v.id("users"))),
  status: v.union(
    v.literal("active"),
    v.literal("error"),
    v.literal("disconnected"),
    v.literal("pending_auth"),
  ),
  statusMessage: v.optional(v.string()),
  lastSyncedAt: v.optional(v.number()),
  connectedBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_org", ["organizationId"])
  .index("by_org_default", ["organizationId", "isDefault"])
  .index("by_org_type", ["organizationId", "providerType"])
  .index("by_org_status", ["organizationId", "status"])
  .index("by_org_email", ["organizationId", "fromEmail"]),
```

- [ ] **Step 3: Extend emails table with new fields and indexes**

Add to the `emails` table definition:

```typescript
// New optional fields:
mailProviderId: v.optional(v.id("mailProviders")),
patientId: v.optional(v.id("gabinetPatients")),
appointmentId: v.optional(v.id("gabinetAppointments")),
employeeId: v.optional(v.id("gabinetEmployees")),
```

Update the `provider` validator to:
```typescript
provider: v.optional(v.union(
  v.literal("resend"),
  v.literal("google"),
  v.literal("microsoft"),
  v.literal("mailgun"),
)),
```

Add new indexes:
```typescript
.index("by_patient", ["patientId", "sentAt"])
.index("by_appointment", ["appointmentId", "sentAt"])
.index("by_employee", ["employeeId", "sentAt"])
.index("by_org_provider", ["organizationId", "mailProviderId"])
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc -p convex/tsconfig.json --noEmit`
Expected: May fail if existing code references `v.literal("gmail")`. Fix those references to use `"google"`.

- [ ] **Step 5: Fix any "gmail" literal references**

Search and replace `v.literal("gmail")` with `v.literal("google")` in the provider validator and any existing backend code that checks `provider === "gmail"`.

Run: `grep -rn '"gmail"' convex/ --include="*.ts" | grep -v node_modules`

Update each occurrence. The `emails` table records with `provider: "gmail"` will be migrated in a later task.

- [ ] **Step 6: Typecheck again**

Run: `npx tsc -p convex/tsconfig.json --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add convex/schema/crm.ts [any other modified files]
git commit -m "feat(schema): add mailProviders table and extend emails with gabinet entity linking"
```

---

### Task 2: Create MailAdapter interface and factory

**Files:**
- Create: `convex/mail/adapter.ts`

- [ ] **Step 1: Define the adapter interface**

Create `convex/mail/adapter.ts`:

```typescript
import type { Doc, Id } from "../_generated/dataModel";

export interface SendOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface FetchInboxOptions {
  organizationId: Id<"organizations">;
  maxResults?: number;
  pageToken?: string;
  query?: string;
}

export interface InboxMessage {
  externalId: string;
  threadId: string;
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  snippet?: string;
  sentAt: number;
  isRead: boolean;
}

export interface InboxResult {
  messages: InboxMessage[];
  nextPageToken?: string;
}

export interface ConnectionTestResult {
  success: boolean;
  error?: string;
  accountEmail?: string;
}

/**
 * Mail provider adapter interface.
 * Each provider implements send() and optionally receive capabilities.
 */
export interface MailAdapter {
  send(options: SendOptions): Promise<SendResult>;
  fetchInbox?(options: FetchInboxOptions): Promise<InboxResult>;
  fetchThread?(threadId: string): Promise<InboxMessage[]>;
  markRead?(externalMessageId: string): Promise<void>;
  testConnection?(): Promise<ConnectionTestResult>;
}

/**
 * Factory: get the right adapter for a mail provider record.
 */
export function getAdapterType(
  providerType: Doc<"mailProviders">["providerType"],
): string {
  // Returns the module path suffix for dynamic loading
  // Actual adapter instantiation happens in the action that uses it
  return providerType;
}
```

- [ ] **Step 2: Commit**

```bash
git add convex/mail/adapter.ts
git commit -m "feat: add MailAdapter interface and types for provider abstraction"
```

---

### Task 3: Implement Resend adapter (refactor existing)

**Files:**
- Create: `convex/mail/adapters/resend.ts`
- Modify: `convex/emailSending.ts` — use adapter for Resend sends

- [ ] **Step 1: Write test**

Create `tests/convex/mailAdapterResend.test.ts`:

```typescript
import { expect, test, describe } from "vitest";
import { createResendAdapter } from "../../convex/mail/adapters/resend";

describe("resend adapter", () => {
  test("createResendAdapter returns an object with send method", () => {
    const adapter = createResendAdapter("re_test_key", "test@example.com", "Test Co");
    expect(adapter).toBeDefined();
    expect(typeof adapter.send).toBe("function");
    // Resend adapter is send-only — no inbox methods
    expect(adapter.fetchInbox).toBeUndefined();
    expect(adapter.fetchThread).toBeUndefined();
    expect(adapter.markRead).toBeUndefined();
  });

  test("send returns error for invalid API key without throwing", async () => {
    const adapter = createResendAdapter("re_invalid_key", "test@example.com", "Test Co");
    const result = await adapter.send({
      to: "recipient@example.com",
      subject: "Test",
      html: "<p>Hello</p>",
    });
    // API call fails with invalid key, but adapter catches and returns error result
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
```

- [ ] **Step 2: Extract Resend logic into adapter**

Create `convex/mail/adapters/resend.ts`:

```typescript
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
```

- [ ] **Step 3: Update emailSending.ts to use Resend adapter**

Refactor `sendTemplateEmail` in `convex/emailSending.ts` to use `createResendAdapter` for Resend sends. Keep backward compatibility — if no `mailProviderId` on the email/event, use the system Resend key.

- [ ] **Step 4: Run existing email tests**

Run: `cd /Users/alfred/projects/crm_new && npx vitest run tests/convex/emailEventTrigger.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/mail/adapters/resend.ts convex/emailSending.ts tests/convex/mailAdapterResend.test.ts
git commit -m "feat: extract Resend adapter from emailSending, implement MailAdapter interface"
```

---

### Task 4: Implement Google adapter (refactor existing Gmail code)

**Files:**
- Create: `convex/mail/adapters/google.ts`
- Modify: `convex/google/gmail.ts` — extract shared logic
- Modify: `convex/google/oauth.ts` — dual-write to mailProviders on OAuth callback

- [ ] **Step 1: Read existing Gmail implementation**

Read `convex/google/gmail.ts` to understand the current Gmail API integration (send, sync, thread fetch).

- [ ] **Step 2: Create Google adapter**

Create `convex/mail/adapters/google.ts`. This adapter wraps Gmail API calls, reusing the existing token refresh pattern from `convex/google/oauth.ts` and the RFC 2822 message construction from `convex/google/gmail.ts`. Read both files first to extract the shared logic.

```typescript
"use node";

import type { MailAdapter, SendOptions, SendResult, FetchInboxOptions, InboxResult, InboxMessage, ConnectionTestResult } from "../adapter";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

/** Build RFC 2822 message for Gmail API (base64url-encoded). */
function buildRawMessage(from: string, options: SendOptions): string {
  const to = Array.isArray(options.to) ? options.to.join(", ") : options.to;
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(options.subject).toString("base64")}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
  ];
  if (options.cc?.length) lines.push(`Cc: ${options.cc.join(", ")}`);
  if (options.bcc?.length) lines.push(`Bcc: ${options.bcc.join(", ")}`);
  if (options.replyTo) lines.push(`Reply-To: ${options.replyTo}`);
  lines.push("", options.html);
  return Buffer.from(lines.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Parse a Gmail API message resource into InboxMessage. */
function parseGmailMessage(msg: any): InboxMessage {
  const headers = msg.payload?.headers ?? [];
  const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
  const bodyPart = msg.payload?.parts?.find((p: any) => p.mimeType === "text/html") ?? msg.payload;
  const bodyData = bodyPart?.body?.data ?? "";
  const bodyHtml = bodyData ? Buffer.from(bodyData, "base64").toString("utf-8") : undefined;

  return {
    externalId: msg.id,
    threadId: msg.threadId,
    from: getHeader("From"),
    to: getHeader("To").split(",").map((s: string) => s.trim()).filter(Boolean),
    cc: getHeader("Cc") ? getHeader("Cc").split(",").map((s: string) => s.trim()) : undefined,
    subject: getHeader("Subject"),
    bodyHtml,
    snippet: msg.snippet,
    sentAt: Number(msg.internalDate),
    isRead: !msg.labelIds?.includes("UNREAD"),
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
  onTokenRefresh?: (newAccessToken: string, newExpiresAt: number) => Promise<void>,
): MailAdapter {
  let currentToken = accessToken;
  let currentExpiresAt = expiresAt;

  async function getValidToken(): Promise<string> {
    if (Date.now() < currentExpiresAt - 60_000) return currentToken;
    // Refresh token — same logic as convex/google/oauth.ts refreshGoogleToken
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!response.ok) throw new Error("Token refresh failed");
    const data = await response.json();
    currentToken = data.access_token;
    currentExpiresAt = Date.now() + data.expires_in * 1000;
    await onTokenRefresh?.(currentToken, currentExpiresAt);
    return currentToken;
  }

  return {
    async send(options: SendOptions): Promise<SendResult> {
      try {
        const token = await getValidToken();
        const raw = buildRawMessage(`${fromName} <${fromEmail}>`, options);
        const response = await fetch(`${GMAIL_BASE}/messages/send`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ raw }),
        });
        if (!response.ok) {
          const error = await response.text();
          return { success: false, error };
        }
        const data = await response.json();
        return { success: true, messageId: data.id };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },

    async fetchInbox(options: FetchInboxOptions): Promise<InboxResult> {
      const token = await getValidToken();
      const params = new URLSearchParams({
        maxResults: String(options.maxResults ?? 50),
        labelIds: "INBOX",
      });
      if (options.pageToken) params.set("pageToken", options.pageToken);
      if (options.query) params.set("q", options.query);

      const listResponse = await fetch(`${GMAIL_BASE}/messages?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!listResponse.ok) return { messages: [] };
      const listData = await listResponse.json();
      if (!listData.messages?.length) return { messages: [] };

      // Fetch full message details (batch of IDs)
      const messages: InboxMessage[] = [];
      for (const item of listData.messages.slice(0, options.maxResults ?? 50)) {
        const msgResponse = await fetch(`${GMAIL_BASE}/messages/${item.id}?format=full`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (msgResponse.ok) {
          messages.push(parseGmailMessage(await msgResponse.json()));
        }
      }

      return { messages, nextPageToken: listData.nextPageToken };
    },

    async fetchThread(threadId: string): Promise<InboxMessage[]> {
      const token = await getValidToken();
      const response = await fetch(`${GMAIL_BASE}/threads/${threadId}?format=full`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return [];
      const data = await response.json();
      return (data.messages ?? []).map(parseGmailMessage);
    },

    async markRead(externalMessageId: string): Promise<void> {
      const token = await getValidToken();
      await fetch(`${GMAIL_BASE}/messages/${externalMessageId}/modify`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
      });
    },

    async testConnection(): Promise<ConnectionTestResult> {
      try {
        const token = await getValidToken();
        const response = await fetch(`${GMAIL_BASE}/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return { success: false, error: "Auth failed" };
        const data = await response.json();
        return { success: true, accountEmail: data.emailAddress };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  };
}
```

- [ ] **Step 3: Update Google OAuth callback to dual-write**

In `convex/google/oauth.ts`, update the callback handler to also create/update a `mailProviders` record when OAuth completes:

```typescript
// After storing in oauthConnections (keep for calendar):
// Also create/update mailProviders record
const existingProvider = await ctx.db
  .query("mailProviders")
  .withIndex("by_org_type", (q) =>
    q.eq("organizationId", organizationId).eq("providerType", "google")
  )
  .first();

const providerData = {
  organizationId,
  name: `Gmail (${userEmail})`,
  providerType: "google" as const,
  oauthTokens: { accessToken, refreshToken, expiresAt, scope, providerAccountId },
  fromName: userName || userEmail,
  fromEmail: userEmail,
  capabilities: { canSend: true, canReceive: true },
  isDefault: !existingProvider, // default if first provider
  isShared: true,
  status: "active" as const,
  connectedBy: userId,
  updatedAt: Date.now(),
};

if (existingProvider) {
  await ctx.db.patch(existingProvider._id, providerData);
} else {
  await ctx.db.insert("mailProviders", {
    ...providerData,
    isDefault: true,
    createdAt: Date.now(),
  });
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc -p convex/tsconfig.json --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/mail/adapters/google.ts convex/google/oauth.ts convex/google/gmail.ts
git commit -m "feat: add Google mail adapter and dual-write OAuth tokens to mailProviders"
```

---

### Task 5: Implement Microsoft adapter

**Files:**
- Create: `convex/mail/adapters/microsoft.ts`
- Create: `convex/microsoft/oauth.ts` — Microsoft OAuth flow (initiate + callback)

- [ ] **Step 1: Create Microsoft OAuth flow**

Create `convex/microsoft/oauth.ts` following the same pattern as `convex/google/oauth.ts`:
- `initiate` httpAction — redirects to Microsoft login with `Mail.ReadWrite Mail.Send User.Read` scopes
- `callback` httpAction — exchanges code for tokens, stores in `mailProviders`

Required env vars: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_REDIRECT_URI`

Microsoft OAuth endpoints:
- Auth: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize`
- Token: `https://login.microsoftonline.com/common/oauth2/v2.0/token`

- [ ] **Step 2: Create Microsoft adapter**

Create `convex/mail/adapters/microsoft.ts`:

```typescript
"use node";

import type { MailAdapter, SendOptions, SendResult, FetchInboxOptions, InboxResult, InboxMessage, ConnectionTestResult } from "../adapter";

export function createMicrosoftAdapter(
  accessToken: string,
  refreshToken: string,
  fromEmail: string,
  fromName: string,
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
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
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
        "$top": String(options.maxResults ?? 50),
        "$orderby": "receivedDateTime desc",
        "$select": "id,conversationId,from,toRecipients,ccRecipients,subject,bodyPreview,body,isRead,receivedDateTime",
      });

      const response = await fetch(`${GRAPH_BASE}/me/messages?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) return { messages: [] };
      const data = await response.json();

      const messages: InboxMessage[] = data.value.map((msg: any) => ({
        externalId: msg.id,
        threadId: msg.conversationId,
        from: msg.from?.emailAddress?.address ?? "",
        to: msg.toRecipients?.map((r: any) => r.emailAddress.address) ?? [],
        cc: msg.ccRecipients?.map((r: any) => r.emailAddress.address),
        subject: msg.subject ?? "",
        bodyHtml: msg.body?.contentType === "html" ? msg.body.content : undefined,
        bodyText: msg.body?.contentType === "text" ? msg.body.content : undefined,
        snippet: msg.bodyPreview,
        sentAt: new Date(msg.receivedDateTime).getTime(),
        isRead: msg.isRead,
      }));

      return { messages, nextPageToken: data["@odata.nextLink"] };
    },

    async fetchThread(threadId: string): Promise<InboxMessage[]> {
      // Microsoft uses conversationId to group thread messages
      const params = new URLSearchParams({
        "$filter": `conversationId eq '${threadId}'`,
        "$orderby": "receivedDateTime asc",
        "$select": "id,conversationId,from,toRecipients,ccRecipients,subject,bodyPreview,body,isRead,receivedDateTime",
      });

      const response = await fetch(`${GRAPH_BASE}/me/messages?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) return [];
      const data = await response.json();

      return data.value.map((msg: any) => ({
        externalId: msg.id,
        threadId: msg.conversationId,
        from: msg.from?.emailAddress?.address ?? "",
        to: msg.toRecipients?.map((r: any) => r.emailAddress.address) ?? [],
        cc: msg.ccRecipients?.map((r: any) => r.emailAddress.address),
        subject: msg.subject ?? "",
        bodyHtml: msg.body?.contentType === "html" ? msg.body.content : undefined,
        bodyText: msg.body?.contentType === "text" ? msg.body.content : undefined,
        snippet: msg.bodyPreview,
        sentAt: new Date(msg.receivedDateTime).getTime(),
        isRead: msg.isRead,
      }));
    },

    async markRead(externalMessageId: string): Promise<void> {
      await fetch(`${GRAPH_BASE}/me/messages/${externalMessageId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ isRead: true }),
      });
    },

    async testConnection(): Promise<ConnectionTestResult> {
      try {
        const response = await fetch(`${GRAPH_BASE}/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) return { success: false, error: "Auth failed" };
        const data = await response.json();
        return { success: true, accountEmail: data.mail || data.userPrincipalName };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  };
}
```

- [ ] **Step 3: Register Microsoft OAuth routes in http.ts**

Add Microsoft OAuth routes to `convex/http.ts` (following the Google OAuth pattern).

- [ ] **Step 4: Typecheck**

Run: `npx tsc -p convex/tsconfig.json --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/mail/adapters/microsoft.ts convex/microsoft/oauth.ts convex/http.ts
git commit -m "feat: add Microsoft mail adapter with OAuth flow and Graph API integration"
```

---

### Task 6: Implement Mailgun adapter

**Files:**
- Create: `convex/mail/adapters/mailgun.ts`

- [ ] **Step 1: Create Mailgun adapter**

Create `convex/mail/adapters/mailgun.ts`:

```typescript
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p convex/tsconfig.json --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add convex/mail/adapters/mailgun.ts
git commit -m "feat: add Mailgun mail adapter with send and connection test"
```

---

### Task 7: Create mailProviders CRUD backend

**Files:**
- Create: `convex/mailProviders.ts`

- [ ] **Step 1: Write tests**

Create `tests/convex/mailProviders.test.ts`:

```typescript
import { expect, test, describe } from "vitest";
import { api } from "../_generated/api";
import { createTestCtx, seedTestUser } from "../_test_helpers";

describe("mailProviders", () => {
  test("list returns empty when no providers configured", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const providers = await t
      .withIdentity(identity)
      .query(api.mailProviders.list, { organizationId });

    expect(providers).toHaveLength(0);
  });

  test("create adds a provider and marks first as default", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    await t.withIdentity(identity).mutation(api.mailProviders.create, {
      organizationId,
      name: "Company Resend",
      providerType: "resend",
      fromName: "Test Company",
      fromEmail: "hello@test.com",
      apiConfig: { apiKey: "re_test123" },
      capabilities: { canSend: true, canReceive: false },
    });

    const providers = await t
      .withIdentity(identity)
      .query(api.mailProviders.list, { organizationId });

    expect(providers).toHaveLength(1);
    expect(providers[0].isDefault).toBe(true);
    expect(providers[0].status).toBe("active");
  });

  test("setDefault changes default provider", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    // Create two providers
    const id1 = await t.withIdentity(identity).mutation(api.mailProviders.create, {
      organizationId, name: "P1", providerType: "resend",
      fromName: "P1", fromEmail: "p1@test.com",
      apiConfig: { apiKey: "key1" },
      capabilities: { canSend: true, canReceive: false },
    });
    const id2 = await t.withIdentity(identity).mutation(api.mailProviders.create, {
      organizationId, name: "P2", providerType: "mailgun",
      fromName: "P2", fromEmail: "p2@test.com",
      apiConfig: { apiKey: "key2", domain: "mg.test.com" },
      capabilities: { canSend: true, canReceive: false },
    });

    // Set P2 as default
    await t.withIdentity(identity).mutation(api.mailProviders.setDefault, {
      organizationId,
      providerId: id2,
    });

    const providers = await t
      .withIdentity(identity)
      .query(api.mailProviders.list, { organizationId });

    expect(providers.find((p) => p._id === id1)!.isDefault).toBe(false);
    expect(providers.find((p) => p._id === id2)!.isDefault).toBe(true);
  });
});
```

- [ ] **Step 2: Implement CRUD**

Create `convex/mailProviders.ts` with: `list`, `create`, `update`, `remove`, `setDefault`, `getDefault` functions. All org-scoped with `verifyOrgAccess`.

- [ ] **Step 3: Run tests**

Run: `cd /Users/alfred/projects/crm_new && npx vitest run tests/convex/mailProviders.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add convex/mailProviders.ts tests/convex/mailProviders.test.ts
git commit -m "feat: add mailProviders CRUD with org-scoped queries and default management"
```

---

### Task 8: Create unified mail settings page

**Files:**
- Create: `src/routes/_app/_auth/dashboard/_layout.settings.mail.tsx`
- Create: `src/components/settings/mail-provider-card.tsx`
- Create: `src/components/settings/mail-provider-form.tsx`
- Modify: `src/modules/crm/manifest.ts` — update settingsNav

- [ ] **Step 1: Update settings navigation**

In `src/modules/crm/manifest.ts`, in the `settingsNav` array:
- Replace `{ labelKey: "settingsNav.email", to: "/dashboard/settings/email" }` with `{ labelKey: "settingsNav.mail", to: "/dashboard/settings/mail" }`
- Keep other items unchanged

- [ ] **Step 2: Add i18n keys**

Add translation keys for:
- `settingsNav.mail` — "Poczta" / "Mail"
- `settings.mail.providers` — "Dostawcy" / "Providers"
- `settings.mail.brand` — "Marka email" / "Email Brand"
- `settings.mail.events` — "Zdarzenia" / "Events"
- `settings.mail.addProvider` — "Dodaj dostawcę" / "Add Provider"
- Provider type labels: google, microsoft, mailgun, resend
- Status labels: active, error, disconnected, pending_auth
- Form labels for each provider type

- [ ] **Step 3: Create mail-provider-card.tsx**

A card component showing: provider icon (per type), name, email, status badge, capabilities icons (send/receive), default badge, shared badge. Actions: set as default, edit, disconnect/remove.

- [ ] **Step 4: Create mail-provider-form.tsx**

A form component that renders different fields based on `providerType`:
- `google`: "Connect with Google" button triggering OAuth redirect
- `microsoft`: "Connect with Microsoft" button triggering OAuth redirect
- `mailgun`: API key, domain, region select, from name/email, test connection button
- `resend`: API key (optional, uses system default if empty), from name/email, test connection button

- [ ] **Step 5: Create settings mail page**

Create `_layout.settings.mail.tsx` with 3 tabs:
- Tab 1: Providers list + add button + provider cards
- Tab 2: Email brand editor (import from F1 Task 8)
- Tab 3: Links to email events and sequences pages

- [ ] **Step 6: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/routes/_app/_auth/dashboard/_layout.settings.mail.tsx src/components/settings/mail-provider-card.tsx src/components/settings/mail-provider-form.tsx src/modules/crm/manifest.ts public/locales/*/translation.json
git commit -m "feat: add unified mail settings page with provider management"
```

---

### Task 9: Enhance inbox with multi-mailbox and entity linking

**Files:**
- Modify: `src/routes/_app/_auth/dashboard/_layout.inbox.index.tsx`
- Modify: `src/components/email/inbox-list.tsx`
- Modify: `src/components/email/compose-dialog.tsx`
- Modify: `convex/emails.ts` — add queries for new indexes

- [ ] **Step 1: Add mailbox switcher to inbox page**

In `_layout.inbox.index.tsx`:
- Query `api.mailProviders.list` to get all providers with `canReceive: true`
- Add a dropdown/select at the top: "Wszystkie skrzynki" + individual mailboxes
- Filter inbox query by selected `mailProviderId` (or show all if "all" selected)
- Show unread count badge per mailbox

- [ ] **Step 2: Update inbox-list queries**

In `convex/emails.ts`, add/update the `listInbox` query to accept optional `mailProviderId` filter. Use the new `by_org_provider` index when filtering by provider.

- [ ] **Step 3: Update compose dialog with provider selector**

In `compose-dialog.tsx`:
- Add a "Send from" dropdown showing available providers with `canSend: true`
- Default to the org's default provider
- Pass selected `mailProviderId` to the send mutation

- [ ] **Step 4: Add entity linking queries**

In `convex/emails.ts`, add queries to list emails by patient, appointment, and employee:

```typescript
export const listByPatient = query({
  args: { patientId: v.id("gabinetPatients"), organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.db
      .query("emails")
      .withIndex("by_patient", (q) => q.eq("patientId", args.patientId))
      .order("desc")
      .take(50);
  },
});
```

Same pattern for `listByAppointment` and `listByEmployee`.

- [ ] **Step 5: Add auto-linking helper for incoming emails**

In `convex/emails.ts`, add an internal helper that runs after syncing an incoming email. It attempts to link the email to gabinet entities by matching the sender/recipient email address against known patient, employee, or contact records:

```typescript
/** Auto-link an email to entities by matching email addresses. */
async function autoLinkEmail(
  ctx: MutationCtx,
  emailId: Id<"emails">,
  organizationId: Id<"organizations">,
  addresses: string[],
) {
  // Match against contacts (CRM)
  const contact = await ctx.db
    .query("contacts")
    .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
    .filter((q) => q.or(...addresses.map((addr) => q.eq(q.field("email"), addr))))
    .first();
  if (contact) {
    await ctx.db.patch(emailId, { contactId: contact._id });
  }

  // Match against patients (Gabinet) — patients have contactId → contacts have email
  if (contact) {
    const patient = await ctx.db
      .query("gabinetPatients")
      .withIndex("by_contact", (q) => q.eq("contactId", contact._id))
      .first();
    if (patient) {
      await ctx.db.patch(emailId, { patientId: patient._id });
    }
  }
}
```

Call this helper from the inbox sync mutation after inserting/updating an email record.

- [ ] **Step 6: Add i18n keys**

Add keys for mailbox switcher: `inbox.allMailboxes`, `inbox.sendFrom`, etc.

- [ ] **Step 7: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit && npx tsc -p convex/tsconfig.json --noEmit`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/routes/_app/_auth/dashboard/_layout.inbox.index.tsx src/components/email/inbox-list.tsx src/components/email/compose-dialog.tsx convex/emails.ts public/locales/*/translation.json
git commit -m "feat: add multi-mailbox inbox switcher, provider send selector, and gabinet entity linking"
```

---

### Task 10: Migration and old page cleanup

**Files:**
- Modify: `convex/emails.ts` or create migration script — backfill `mailProviderId` on historical emails
- Remove: `src/routes/_app/_auth/dashboard/_layout.settings.email.tsx`
- Modify: `src/routes/_app/_auth/dashboard/_layout.settings.integrations.tsx` — remove Google OAuth card (moved to mail settings)

- [ ] **Step 1: Create migration for historical emails**

Create `convex/migrations/backfillMailProviders.ts` (or add as internal mutation):

```typescript
export const backfillEmailProviders = internalMutation({
  handler: async (ctx) => {
    // 1. Rename provider "gmail" -> "google" on existing emails
    const gmailEmails = await ctx.db
      .query("emails")
      .filter((q) => q.eq(q.field("provider"), "gmail" as any))
      .take(100);

    for (const email of gmailEmails) {
      await ctx.db.patch(email._id, { provider: "google" as any });
    }

    // 2. Match emails to mailProviders by org + fromEmail
    const unmatchedEmails = await ctx.db
      .query("emails")
      .filter((q) => q.eq(q.field("mailProviderId"), undefined))
      .take(100);

    for (const email of unmatchedEmails) {
      const provider = await ctx.db
        .query("mailProviders")
        .withIndex("by_org_email", (q) =>
          q.eq("organizationId", email.organizationId).eq("fromEmail", email.from)
        )
        .first();

      if (provider) {
        await ctx.db.patch(email._id, { mailProviderId: provider._id });
      }
    }

    return { processed: gmailEmails.length + unmatchedEmails.length };
  },
});
```

Run this migration in batches until all records are processed.

- [ ] **Step 2: Migrate emailAccounts to mailProviders**

Create internal mutation to convert existing `emailAccounts` records to `mailProviders`:

```typescript
export const migrateEmailAccounts = internalMutation({
  handler: async (ctx) => {
    const accounts = await ctx.db.query("emailAccounts").collect();
    for (const account of accounts) {
      const existing = await ctx.db
        .query("mailProviders")
        .withIndex("by_org_email", (q) =>
          q.eq("organizationId", account.organizationId).eq("fromEmail", account.fromEmail)
        )
        .first();

      if (!existing) {
        // Find org owner to use as connectedBy (organizationId is not a valid user ID)
        const ownerMembership = await ctx.db
          .query("teamMemberships")
          .withIndex("by_org", (q) => q.eq("organizationId", account.organizationId))
          .filter((q) => q.eq(q.field("role"), "owner"))
          .first();
        const connectedBy = ownerMembership?.userId;
        if (!connectedBy) continue; // skip if no owner found

        await ctx.db.insert("mailProviders", {
          organizationId: account.organizationId,
          name: account.fromName,
          providerType: "resend",
          fromName: account.fromName,
          fromEmail: account.fromEmail,
          capabilities: { canSend: true, canReceive: false },
          isDefault: account.isDefault,
          isShared: true,
          status: "active",
          connectedBy,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
        });
      }
    }
  },
});
```

- [ ] **Step 3: Remove old settings/email page**

```bash
rm src/routes/_app/_auth/dashboard/_layout.settings.email.tsx
```

- [ ] **Step 4: Update integrations page**

Remove the Google OAuth card from `_layout.settings.integrations.tsx` (it's now in the mail settings page). Keep SMS config and any other non-email integrations.

- [ ] **Step 5: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit && npx tsc -p convex/tsconfig.json --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add convex/migrations/backfillMailProviders.ts src/routes/_app/_auth/dashboard/_layout.settings.integrations.tsx
git rm src/routes/_app/_auth/dashboard/_layout.settings.email.tsx
git commit -m "refactor: migrate emailAccounts to mailProviders, remove settings/email page, clean up integrations page"
```
