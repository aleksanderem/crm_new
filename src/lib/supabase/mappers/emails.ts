/**
 * Emails Mapper — Supabase ↔ Frontend
 *
 * Maps emails table rows to camelCase frontend objects using the generic
 * createEntityMapper factory. Shape mirrors `Doc<'emails'>` from Convex.
 */

import type { Database } from "../database.types";
import { createEntityMapper } from "./generic";

type EmailRow = Database["public"]["Tables"]["emails"]["Row"];

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape that mirrors `Doc<'emails'>` from Convex (camelCase). */
export interface MappedEmail {
  _id: string;
  organizationId: string;
  threadId: string;
  messageId: string;
  inReplyTo?: string;
  direction: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  snippet?: string;
  isRead: boolean;
  isStarred?: boolean;
  contactId?: string;
  companyId?: string;
  leadId?: string;
  provider?: string;
  mailProviderId?: string;
  gmailMessageId?: string;
  gmailThreadId?: string;
  sentBy?: string;
  templateId?: string;
  patientId?: string;
  appointmentId?: string;
  employeeId?: string;
  sentAt: number;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

// ─── Mapper Instance ──────────────────────────────────────────────────────────

const emailMapper = createEntityMapper<EmailRow, MappedEmail>({});

// ─── Exported Functions ───────────────────────────────────────────────────────

export function mapEmailFromSupabase(row: EmailRow): MappedEmail {
  return emailMapper.mapFromSupabase(row);
}

export function mapEmailToSupabase(
  email: Record<string, unknown>,
): Record<string, unknown> {
  return emailMapper.mapToSupabase(email);
}
