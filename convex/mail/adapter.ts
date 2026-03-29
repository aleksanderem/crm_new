import type { Id } from "../_generated/dataModel";

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
