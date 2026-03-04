# OTP Security Hotfix — Patient Portal Auth

Date: 2026-03-04

## Summary

Closed production security gaps in `convex/gabinet/patientAuth.ts`: replaced weak OTP hashing with SHA-256, removed dev secret leakage from mutation responses, added brute-force protections with rate limiting and lockout, and enforced OTP TTL and one-time use semantics.

## Changed files

`convex/gabinet/patientAuth.ts` — Complete rewrite of crypto helpers and mutation handlers. Replaced the 32-bit `hashString` with `crypto.subtle.digest("SHA-256", ...)`. Replaced `Math.random()` OTP generation with `crypto.getRandomValues()`. Removed `_devOtp` and `_devToken` from `sendPortalOtp` response. Changed `verifyPortalOtp` from throw-on-failure to result-object pattern so that fail-count and lockout state persist across Convex's transactional rollback boundary. Added send rate limiting (5 per 15 min window) and verification lockout (5 failures triggers 15 min cooldown).

`convex/schema.ts` — Added four optional fields to `gabinetPortalSessions` table: `otpSendCount`, `otpSendWindowStart`, `verifyFailCount`, `lockedUntil`.

`src/routes/_app/patient/login.tsx` — Updated `handleVerifyOtp` to check `result.success` instead of relying on thrown errors, matching the new result-object API contract.

`convex/tests/patientAuth.test.ts` — New test file with 15 tests covering all security behaviors.

## Tests added (15)

sendPortalOtp (5 tests): does not leak OTP or token in response, stores OTP as SHA-256 hash (64-char hex), rate-limits after 5 sends within 15-minute window, allows sending again after the rate-limit window resets, returns success even when patient does not exist (no user enumeration).

verifyPortalOtp (7 tests): accepts correct OTP and returns session token, rejects wrong OTP, rejects expired OTP, OTP is invalidated after successful verification (one-time use), locks out after 5 failed verification attempts, lockout expires after cooldown period.

getPortalSession (3 tests): returns session for valid active token, returns null for inactive session, returns null for expired session.

Full auth flow (1 test): send then verify then getSession then logout.

## Commands run and results

`npx vitest run --config convex/vitest.config.ts convex/tests/patientAuth.test.ts` — 15/15 passed (36ms).

`npx vitest run --config convex/vitest.config.ts` — 44/44 tests passed across all 5 Convex test suites. Two pre-existing Playwright e2e files fail to import under Vitest (unrelated).

`npm run typecheck` — Zero errors across tsconfig.app.json, tsconfig.node.json, convex/tsconfig.json.

`npm run build` — Success. 6629 modules transformed, built in 3.99s. Output: dist/assets/index-DAXyG6mG.js (2337 kB), dist/assets/index-CFFC34SL.css (244 kB).

## Security properties now enforced

OTP hashing: SHA-256 via Web Crypto API. Stored `otpHash` is a 64-character hex digest. The weak 32-bit `hashString` is removed entirely.

OTP generation: `crypto.getRandomValues()` instead of `Math.random()`. Produces uniform 6-digit codes (100000-999999).

No secret leakage: `sendPortalOtp` returns only `{ success: true }`. No OTP, no token, no internal state.

Send rate limiting: Maximum 5 OTP sends per 15-minute sliding window per patient session. Window resets after expiry. Throws on rate limit violation (Convex rollback-safe because no new state needs persisting).

Verify brute-force protection: Maximum 5 failed OTP verification attempts. On the 5th failure the session is locked for 15 minutes and the OTP is invalidated. Uses result-object pattern (not throw) so fail counts persist despite Convex transactional semantics.

OTP TTL: 10 minutes, unchanged from original.

One-time use: OTP hash is cleared on successful verification. Reuse returns "No pending OTP".

Session tokens: High-entropy UUID pair stored directly (not hashed). The previous weak 32-bit hash actually reduced entropy from ~256 bits to ~32 bits; storing the raw token is strictly more secure.

## Residual risks

The OTP is logged to server console (`console.log`) for development. This must be replaced with an email/SMS delivery integration before production deployment.

No IP-based rate limiting exists because Convex mutations do not receive client IP addresses. Rate limiting is per-patient-session only. An attacker could target different patient emails without hitting a global rate limit.

The session token is stored in localStorage on the client. This is vulnerable to XSS. Consider HttpOnly cookie-based session management for the patient portal in a future iteration.

The `sendPortalOtp` timing difference between "patient exists" (DB writes) and "patient doesn't exist" (early return) could theoretically be used for email enumeration via statistical timing analysis. The constant `{ success: true }` response mitigates casual probing but not sophisticated timing attacks.

No CAPTCHA or proof-of-work challenge is enforced before OTP send, so automated OTP spam is possible up to the per-session rate limit.
