import type { Activity } from "../activity-item";

type JsonRecord = Record<string, unknown>;

type ActivityEnvelope = {
  summary?: unknown;
  actor?: { label?: unknown };
  payload?: unknown;
};

export type PresenterInput = Activity & {
  metadata?: unknown;
};

export type RenderedFields = {
  description?: string;
  performedByName?: string;
  contentSnapshot?: string;
  metaLines?: string[];
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" ? (value as JsonRecord) : null;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const candidate = asNonEmptyString(value);
    if (candidate) return candidate;
  }
  return undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(asNonEmptyString).filter(Boolean) as string[];
}

export function getEnvelope(input: PresenterInput): ActivityEnvelope | null {
  const metadata = asRecord(input.metadata);
  const envelope = asRecord(metadata?.activityEnvelope);
  if (!envelope) return null;

  return {
    summary: envelope.summary,
    actor: asRecord(envelope.actor) ?? undefined,
    payload: envelope.payload,
  };
}

export function renderGenericActivity(input: PresenterInput): RenderedFields {
  const envelope = getEnvelope(input);
  const payload = asRecord(envelope?.payload);

  const subject = asNonEmptyString(payload?.subject);

  return {
    description: firstString(envelope?.summary),
    performedByName: firstString(envelope?.actor?.label),
    contentSnapshot: firstString(
      payload?.rawBody,
      payload?.body,
      payload?.bodyText,
      payload?.message,
      payload?.content,
      payload?.text,
      payload?.bodyPreview,
      payload?.preview,
    ),
    metaLines: subject ? [`Subject: ${subject}`] : undefined,
  };
}

export function renderEmailActivity(input: PresenterInput): RenderedFields {
  const envelope = getEnvelope(input);
  const payload = asRecord(envelope?.payload);

  const subject = asNonEmptyString(payload?.subject);
  const to = stringArray(payload?.to);
  const from = asNonEmptyString(payload?.from);

  let description: string | undefined;
  if (input.action === "email_sent" && subject && to.length > 0) {
    description = `Sent email "${subject}" to ${to.join(", ")}`;
  } else if (input.action === "email_received" && subject && from) {
    description = `Received email "${subject}" from ${from}`;
  }

  const metaLines: string[] = [];
  if (input.action === "email_sent" && to.length > 0) {
    metaLines.push(`To: ${to.join(", ")}`);
  }
  if (input.action === "email_received" && from) {
    metaLines.push(`From: ${from}`);
  }
  if (subject) {
    metaLines.push(`Subject: ${subject}`);
  }

  return {
    description: description ?? firstString(envelope?.summary),
    performedByName: firstString(envelope?.actor?.label),
    contentSnapshot: firstString(
      payload?.rawBody,
      payload?.body,
      payload?.bodyText,
      payload?.message,
      payload?.content,
      payload?.text,
      payload?.bodyPreview,
      payload?.preview,
    ),
    metaLines: metaLines.length > 0 ? metaLines : undefined,
  };
}
