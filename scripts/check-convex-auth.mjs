#!/usr/bin/env node
/**
 * CI gate: every public Convex function must reach an authorization guard.
 *
 * A public function is any `export const X = query|mutation|action({...})`.
 * Internal variants (internalQuery / internalMutation / internalAction) are
 * exempt — they can only be called from other Convex functions, not directly
 * from browsers.
 *
 * Authorization is considered reached when the handler body (or the body of
 * a single internal function the handler delegates to) contains one of the
 * GUARD_PATTERNS. One level of delegation is supported:
 *  • ctx.runMutation/Query/Action(internal.X.Y) — traced to the target function
 *  • any `internal.X.Y` reference in the body — catches variable-assigned refs
 *  • calls to module-level helper functions defined in the same file that
 *    themselves contain a guard — catches the `verify(ctx, orgId)` pattern
 *
 * Endpoints that are intentionally public (token-based signing, OTP flows,
 * error logging, etc.) are listed in WHITELIST with a safety explanation.
 *
 * Usage:
 *   node scripts/check-convex-auth.mjs
 *   npm run check:convex-auth
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const CONVEX_DIR = "convex";

// ---------------------------------------------------------------------------
// Guard patterns — any of these in a handler body counts as "authorized".
// ---------------------------------------------------------------------------
const GUARD_PATTERNS = [
  // Org-membership guards (query/mutation context)
  "verifyOrgAccess(",
  "checkPermission(",
  "requireOrgAdmin(",
  "requirePlatformAdmin(",
  // Patient-portal session token guard
  "validatePortalSessionSupabase(",
  // Basic user identity checks
  "auth.getUserId(",
  "getCurrentUser(",
  "requireUser(",
  // Action-context org-membership variants (internalQuery helpers)
  "authAction.verifyOrgAccess",
  "authAction.checkPermission",
  // Known project-level auth wrappers that themselves call a guard above.
  // getEffectivePermissions: calls verifyOrgAccess internally (_helpers/permissions.ts)
  "getEffectivePermissions(",
];

// ---------------------------------------------------------------------------
// Whitelist — public functions that are intentionally unauthenticated.
// Format: "moduleKey:exportName"  (moduleKey is path relative to convex/,
// no .ts, forward slashes).
// Every entry MUST have a comment explaining why it is safe.
// ---------------------------------------------------------------------------
const WHITELIST = new Set([
  // ── Signature / document signing ─────────────────────────────────────────
  // getByToken: the signing token IS the auth; no prior session exists.
  //   Returns only sanitized context (masked phone, public org name).
  "signatureRequests:getByToken",

  // signExternal: signer proves identity via the token they received; the
  //   token + OTP verification state are the auth mechanism.
  "signatureRequests:signExternal",

  // verifyOtp: verifies the OTP a signer received. Auth is signing token +
  //   the correct OTP code.
  "signatureRequests:verifyOtp",

  // getBySigningToken: returns document data for a signing link. The signing
  //   token IS the auth — the link was sent to the signer by email.
  "documents/documents:getBySigningToken",

  // submitDocumentFormFields: patient/signer fills in form fields before
  //   signing. Auth is the signing token embedded in the link.
  "documents/documents:submitDocumentFormFields",

  // recordSignature: records the digital signature of an external signer.
  //   Auth is the signing token (pre-validated by signatureRequests.verifyOtp).
  "documents/documents:recordSignature",

  // ── Signing email notifications ───────────────────────────────────────────
  // These three are invoked only from authenticated actions (sendForSigning,
  // requestOtp) that have already validated org membership. They are thin
  // notification helpers that should ideally be internalAction but changing
  // their visibility would break existing callers in this release cycle.
  // They write only to outbound email queues, never to org data tables.
  "signingEmails:sendSigningRequestEmail",
  "signingEmails:sendOtpEmail",
  "signingEmails:sendSlotSignedNotification",

  // ── SMS OTP orchestration ─────────────────────────────────────────────────
  // sendOtpSms: sends an SMS OTP for a signing request. Called only from
  //   authenticated OTP flows; thin delivery wrapper with no org-data writes.
  "sms:sendOtpSms",

  // requestOtp (sms module): orchestrates createOtp + SMS/email delivery for
  //   the document signing flow. The underlying createOtp validates the
  //   signing token.
  "sms:requestOtp",

  // getConfig: returns SMS provider config (provider type + active flag only,
  //   no API keys). Read by the document signing page to choose OTP method.
  //   Same as platformSettings.get — masked, low-sensitivity read.
  "sms:getConfig",

  // ── Patient portal auth endpoints ─────────────────────────────────────────
  // These are the entry points of the patient portal auth flow. A session
  // does not exist yet at call time; the OTP code is the auth mechanism.
  "gabinet/patientAuth:sendPortalOtp",
  "gabinet/patientAuth:verifyPortalOtp",

  // getOrgBySlug: returns org name + logo for the portal login page. No
  //   sensitive data; slug is public-facing (appears in the URL).
  "gabinet/patientAuth:getOrgBySlug",

  // logoutPortal: invalidates the portal session token. The session token
  //   itself is validated inside the handler before deletion.
  "gabinet/patientAuth:logoutPortal",

  // ── Invitation token endpoint ─────────────────────────────────────────────
  // getByToken: returns invitation context for the accept-invite page.
  //   Auth is the invitation token sent to the invitee by email.
  "invitations:getByToken",

  // ── Platform settings ─────────────────────────────────────────────────────
  // get: returns masked platform settings (hasResendApiKey: boolean, etc.).
  //   No API keys or sensitive values exposed. Used by auth pages to display
  //   provider info before login.
  "platformSettings:get",

  // ── Error logging ─────────────────────────────────────────────────────────
  // record: browser-side error reporter. Intentionally accepts unauthenticated
  //   reports (errors happen before auth resolves). userId is bound
  //   server-side via getCurrentUser if a session exists; reporters cannot
  //   impersonate other users. Writes only to errorLogs, not org data.
  "errorLogs:record",

  // ── Google integration ────────────────────────────────────────────────────
  // These actions use ctx.auth / OAuth tokens for their own authorization and
  // are only reachable from authenticated org contexts in the UI. Org-level
  // auth is enforced at the OAuth connection layer (oauthConnections table).
  "google/gmail:sendViaGmail",
  "google/gmail:syncInbox",
  "google/calendar:importFromGoogle",
  "google/calendar:listUserCalendars",

  // ── Email template variable sources ──────────────────────────────────────
  // listVariableSources: returns a static registry of available template
  //   variables. No org data is read; the list is hard-coded. Intentionally
  //   public so the template editor can be loaded before org selection.
  "emailTemplates:listVariableSources",

  // ── Document data sources ─────────────────────────────────────────────────
  // listAvailableSources: returns the static registry of document data-source
  //   types. No org data; hard-coded list used by the template builder UI.
  "documentDataSources:listAvailableSources",

  // ── Dev / seed utilities ──────────────────────────────────────────────────
  // These are only deployed in non-production environments (dev namespace).
  // They never run in production; no RLS required.
  "dev/emails:list",
  "dev/emails:getById",
  "dev/emails:findSignableDocument",
  "dev/emails:triggerSigningEmail",
  "dev/helpers:getDevIds",
  "dev/helpers:countDocs",
  "crm/seed:listOrgs",
  "gabinet/seed:listOrgs",
]);

// ---------------------------------------------------------------------------
// File filtering
// ---------------------------------------------------------------------------
const PUBLIC_FN_TYPES = new Set(["query", "mutation", "action"]);
const INTERNAL_FN_TYPES = new Set([
  "internalQuery",
  "internalMutation",
  "internalAction",
]);

function shouldSkipFile(relPath) {
  if (
    relPath.startsWith("_generated" + sep) ||
    relPath.startsWith("_generated/")
  )
    return true;
  const basename = relPath.split(sep).pop();
  if (basename === "schema.ts" || basename === "auth.config.ts") return true;
  if (basename.startsWith("_test") || basename === "_test_helpers.ts")
    return true;
  if (basename.includes("_e2eTest") || basename.includes("e2eTest"))
    return true;
  return false;
}

function relToModuleKey(relPath) {
  return relPath.replace(/\.(ts|tsx)$/, "").split(sep).join("/");
}

// ---------------------------------------------------------------------------
// Brace-balanced extractor
// Scans `text` starting at `pos` (which must be `{`).
// Returns the text INSIDE the outermost `{...}`, or null if unbalanced.
// Handles: string literals, template literals, line and block comments.
// ---------------------------------------------------------------------------
function extractBraceBlock(text, pos) {
  if (text[pos] !== "{") return null;
  const len = text.length;
  let depth = 0;
  let i = pos;

  while (i < len) {
    const ch = text[i];

    if (ch === "/" && text[i + 1] === "/") {
      while (i < len && text[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < len && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const q = ch;
      i++;
      while (i < len) {
        if (text[i] === "\\") {
          i += 2;
          continue;
        }
        if (text[i] === q) break;
        i++;
      }
      i++;
      continue;
    }
    if (ch === "`") {
      i++;
      let tmplDepth = 0;
      while (i < len) {
        if (text[i] === "`" && tmplDepth === 0) {
          i++;
          break;
        }
        if (text[i] === "$" && text[i + 1] === "{") {
          tmplDepth++;
          i += 2;
          continue;
        }
        if (text[i] === "}" && tmplDepth > 0) {
          tmplDepth--;
          i++;
          continue;
        }
        if (text[i] === "\\") i++;
        i++;
      }
      continue;
    }

    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(pos + 1, i);
      }
    }
    i++;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Extract the handler body from the Convex function object body.
// Finds `handler:` then scans past `=>` to extract the arrow function body.
// ---------------------------------------------------------------------------
function extractHandlerBody(objectBody) {
  const handlerMatch = /\bhandler\s*:/.exec(objectBody);
  if (!handlerMatch) return null;

  const afterHandler = handlerMatch.index + handlerMatch[0].length;
  let i = afterHandler;
  const len = objectBody.length;
  let parenDepth = 0;
  let angleDepth = 0;

  while (i < len) {
    const ch = objectBody[i];
    if (ch === "(") parenDepth++;
    else if (ch === ")") parenDepth--;
    else if (ch === "<" && parenDepth === 0) angleDepth++;
    else if (ch === ">" && parenDepth === 0 && angleDepth > 0) angleDepth--;
    else if (
      ch === "=" &&
      objectBody[i + 1] === ">" &&
      parenDepth === 0 &&
      angleDepth === 0
    ) {
      i += 2;
      break;
    }
    i++;
  }

  // Skip whitespace to find opening `{`
  while (i < len && objectBody[i] !== "{") i++;
  if (i >= len) return null;

  return extractBraceBlock(objectBody, i);
}

// ---------------------------------------------------------------------------
// Find module-level (non-exported) helper functions in a file that themselves
// contain a guard pattern. These are "local guard wrappers".
// Returns a Set of function names.
// ---------------------------------------------------------------------------
function findLocalGuardWrappers(fileContent) {
  const wrappers = new Set();

  // Match module-level function declarations NOT preceded by "export"
  // Pattern: [async] function NAME( ...
  const funcRe =
    /(?:^|\n)([ \t]*)(?:async\s+)?function\s+(\w+)\s*\(/gm;

  let m;
  while ((m = funcRe.exec(fileContent)) !== null) {
    const indent = m[1];
    const funcName = m[2];

    // Skip if it's exported
    const lineStart = m.index + (fileContent[m.index] === "\n" ? 1 : 0);
    const beforeFunc = fileContent.slice(Math.max(0, lineStart - 20), lineStart + m[0].length);
    if (/\bexport\b/.test(beforeFunc)) continue;

    // Only consider top-level helpers (indent = 0 or minimal)
    if (indent.length > 2) continue;

    // Skip the parameter list by tracking parenthesis depth.
    // This avoids mistaking a brace inside a type annotation (e.g.
    // `ctx: { runQuery: Function }`) for the function body brace.
    let j = m.index + m[0].length; // position right after the opening (
    let parenDepth = 1;
    while (j < fileContent.length && parenDepth > 0) {
      const c = fileContent[j];
      if (c === "(") parenDepth++;
      else if (c === ")") parenDepth--;
      // Skip string literals inside params (e.g. default values)
      else if (c === '"' || c === "'") {
        const q = c;
        j++;
        while (j < fileContent.length && fileContent[j] !== q) {
          if (fileContent[j] === "\\") j++;
          j++;
        }
      }
      j++;
    }
    // j is now right after the closing ). Find the opening { of the body,
    // skipping the optional return-type annotation (: ReturnType).
    let bracePos = j;
    while (bracePos < fileContent.length && fileContent[bracePos] !== "{")
      bracePos++;

    const body = extractBraceBlock(fileContent, bracePos);
    if (!body) continue;

    // If this function's body contains a guard, it's a local guard wrapper
    if (GUARD_PATTERNS.some((p) => body.includes(p))) {
      wrappers.add(funcName);
    }
  }

  return wrappers;
}

// ---------------------------------------------------------------------------
// Parse all exported Convex functions from a file.
// ---------------------------------------------------------------------------
function parseFunctions(fileContent, moduleKey) {
  const functions = [];

  // Find local guard wrapper function names for this file
  const localWrappers = findLocalGuardWrappers(fileContent);

  const declRe =
    /\bexport\s+const\s+(\w+)\s*=\s*(query|mutation|action|internalQuery|internalMutation|internalAction)\s*[(<]/g;

  let m;
  while ((m = declRe.exec(fileContent)) !== null) {
    const name = m[1];
    const type = m[2];
    const matchEnd = m.index + m[0].length - 1;

    // Find the opening ( of the function call, skipping generic <T>
    let callPos = matchEnd;
    if (fileContent[callPos] === "<") {
      let depth = 1;
      callPos++;
      while (callPos < fileContent.length && depth > 0) {
        if (fileContent[callPos] === "<") depth++;
        else if (fileContent[callPos] === ">") depth--;
        callPos++;
      }
    }
    while (callPos < fileContent.length && fileContent[callPos] !== "(")
      callPos++;
    callPos++;

    // Find the { opening the argument object
    let bracePos = callPos;
    while (bracePos < fileContent.length && fileContent[bracePos] !== "{")
      bracePos++;

    const objectBody = extractBraceBlock(fileContent, bracePos);
    if (!objectBody) continue;

    const handlerBody = extractHandlerBody(objectBody) ?? "";

    functions.push({
      moduleKey,
      name,
      type,
      handlerBody,
      localWrappers, // guard wrapper names defined in the same file
      isPublic: PUBLIC_FN_TYPES.has(type),
    });
  }

  return functions;
}

// ---------------------------------------------------------------------------
// Guard check helpers
// ---------------------------------------------------------------------------
function hasDirectGuard(handlerBody, localWrappers) {
  // Direct guard pattern
  if (GUARD_PATTERNS.some((p) => handlerBody.includes(p))) return true;

  // Call to a local guard wrapper (e.g. `await verify(ctx, orgId)`)
  for (const wrapperName of localWrappers) {
    if (handlerBody.includes(wrapperName + "(")) return true;
  }

  return false;
}

// Extract all internal.X.Y references from a handler body.
// Returns "moduleKey:fnName" strings for use in delegation tracing.
function extractInternalRefs(handlerBody) {
  const refs = [];
  // Match ANY internal.X.Y reference (not just via ctx.runX)
  // This catches both direct calls and variable-assigned references.
  const re = /\binternal\.([\w.]+)/g;
  let m;
  while ((m = re.exec(handlerBody)) !== null) {
    const dotPath = m[1];
    const parts = dotPath.split(".");
    if (parts.length < 2) continue; // need at least module + function
    const fnName = parts.pop();
    const moduleKey = parts.join("/");
    refs.push(`${moduleKey}:${fnName}`);
  }
  return refs;
}

// ---------------------------------------------------------------------------
// File walker
// ---------------------------------------------------------------------------
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (
      st.isFile() &&
      entry.endsWith(".ts") &&
      !entry.endsWith(".d.ts")
    ) {
      out.push(full);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const allFiles = walk(CONVEX_DIR);

// First pass: parse ALL functions (public + internal) to build the lookup map.
// Key: "moduleKey:fnName" → handler body text
const internalBodyMap = new Map();
const internalLocalWrappers = new Map(); // "moduleKey:fnName" → localWrappers Set
const publicFunctions = [];

for (const file of allFiles) {
  const relPath = relative(CONVEX_DIR, file);
  if (shouldSkipFile(relPath)) continue;

  const content = readFileSync(file, "utf8");
  const moduleKey = relToModuleKey(relPath);

  const fns = parseFunctions(content, moduleKey);

  for (const fn of fns) {
    if (!fn.isPublic) {
      internalBodyMap.set(`${fn.moduleKey}:${fn.name}`, fn.handlerBody);
      internalLocalWrappers.set(
        `${fn.moduleKey}:${fn.name}`,
        fn.localWrappers,
      );
    } else {
      publicFunctions.push(fn);
    }
  }
}

// Second pass: check each public function.
const violations = [];

for (const fn of publicFunctions) {
  const whitelistKey = `${fn.moduleKey}:${fn.name}`;

  // 1. Whitelist
  if (WHITELIST.has(whitelistKey)) continue;

  // 2. Direct guard (including local wrapper calls in the same file)
  if (hasDirectGuard(fn.handlerBody, fn.localWrappers)) continue;

  // 3. One-level delegation: ANY internal.X.Y reference in the handler body
  //    that maps to an internal function with a guard (direct or via its own
  //    local wrappers).
  const refs = extractInternalRefs(fn.handlerBody);
  const delegationGuarded = refs.some((ref) => {
    const body = internalBodyMap.get(ref) ?? "";
    const wrappers = internalLocalWrappers.get(ref) ?? new Set();
    return hasDirectGuard(body, wrappers);
  });
  if (delegationGuarded) continue;

  // No guard found — report violation.
  violations.push(fn);
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
if (violations.length === 0) {
  console.log(
    `✓ convex-auth-gate: all ${publicFunctions.length} public Convex functions reach an authorization guard.`,
  );
  process.exit(0);
}

console.error(
  `\nconvex-auth-gate: ${violations.length} public function(s) lack an authorization guard.\n`,
);

for (const v of violations) {
  console.error(`  ${v.moduleKey}.ts: ${v.name} (${v.type})`);
}

console.error(`
Each listed function must either:
  a) Call one of: ${GUARD_PATTERNS.slice(0, 8).map((p) => p.replace("(", "")).join(", ")}, ...
  b) Call a module-level helper function that itself calls a guard
  c) Reference an internal function (via internal.X.Y) whose body has a guard
  d) Be added to WHITELIST in scripts/check-convex-auth.mjs with a safety explanation

See issue #3835 for context.
`);

process.exit(1);
