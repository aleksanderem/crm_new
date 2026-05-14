// Server-side error logger. Use from inside any Convex handler that wants
// to persist errors into the global errorLogs table.
//
// Usage in a MUTATION:
//   try {
//     ...
//   } catch (err) {
//     await logError(ctx, err, { scope: "gabinet.treatments", fnName: "update", argsJson: JSON.stringify(args) });
//     throw err;
//   }
//
// Usage in an ACTION: same. The helper picks the right write path
// (direct db.insert from mutations/queries, runMutation from actions).
//
// Failure to log must NEVER throw — the original error is what the caller
// cares about. Logger errors are swallowed by design.
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";

type AnyCtx = ActionCtx | MutationCtx | QueryCtx;

export type LogContext = {
  scope: string;
  fnName?: string;
  argsJson?: string;
  organizationId?: string;
  userId?: string;
};

export async function logError(
  ctx: AnyCtx,
  err: unknown,
  context: LogContext,
): Promise<void> {
  try {
    const message =
      err instanceof Error ? err.message : String(err ?? "unknown error");
    const stack = err instanceof Error ? err.stack : undefined;

    const payload = {
      source: "convex" as const,
      scope: context.scope,
      fnName: context.fnName,
      level: "error" as const,
      message,
      stack,
      argsJson: context.argsJson,
      // Cast strings to Convex ids — runtime is fine, types just need a hint
      organizationId: context.organizationId as
        | (LogContext["organizationId"] & {})
        | undefined,
      userId: context.userId as (LogContext["userId"] & {}) | undefined,
    };

    if ("db" in ctx && typeof (ctx as MutationCtx).db?.insert === "function") {
      // Mutation context — write directly. Queries can't insert, so we
      // gracefully skip (queries shouldn't really throw side-effecting work
      // anyway).
      try {
        await (ctx as MutationCtx).db.insert("errorLogs", {
          ts: Date.now(),
          source: payload.source,
          scope: payload.scope,
          fnName: payload.fnName,
          level: payload.level,
          message,
          stack: stack?.slice(0, 8000),
          argsJson: context.argsJson?.slice(0, 4000),
          organizationId: payload.organizationId as never,
          userId: payload.userId as never,
        });
      } catch {
        // ignore
      }
    } else if ("runMutation" in ctx) {
      // Action context — go through the internal mutation
      try {
        await (ctx as ActionCtx).runMutation(
          internal.errorLogs._recordInternal,
          {
            source: payload.source,
            scope: payload.scope,
            fnName: payload.fnName,
            level: payload.level,
            message,
            stack: stack?.slice(0, 8000),
            argsJson: context.argsJson?.slice(0, 4000),
            organizationId: payload.organizationId as never,
            userId: payload.userId as never,
          },
        );
      } catch {
        // ignore
      }
    }
  } catch {
    // Top-level swallow — logger must not throw.
  }
}
