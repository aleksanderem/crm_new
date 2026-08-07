type LogContext = Record<string, unknown>;

function emit(
  level: "info" | "warn" | "error",
  ns: string,
  message: string,
  context?: LogContext,
): void {
  const entry: LogContext = { level, ns, message, ts: Date.now(), ...context };
  if (level === "error") console.error(JSON.stringify(entry));
  else if (level === "warn") console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

/**
 * Returns a structured logger bound to a namespace. Logs are emitted as
 * single-line JSON, making them filterable in the Convex dashboard and any
 * log-aggregation pipeline (Sentry, Datadog, etc.).
 *
 * Optionally pass a `baseContext` (e.g. `{ correlationId }`) that will be
 * merged into every log entry emitted by this logger instance.
 */
export function createLogger(ns: string, baseContext?: LogContext) {
  return {
    info: (message: string, context?: LogContext) =>
      emit("info", ns, message, { ...baseContext, ...context }),
    warn: (message: string, context?: LogContext) =>
      emit("warn", ns, message, { ...baseContext, ...context }),
    error: (message: string, context?: LogContext) =>
      emit("error", ns, message, { ...baseContext, ...context }),
  };
}
