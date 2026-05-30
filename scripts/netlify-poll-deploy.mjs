#!/usr/bin/env node
// Poll Netlify deploy status after a build hook trigger, fail if the deploy
// errors out. Issue #1161: a broken Netlify build should turn the GitHub
// Actions run red instead of relying solely on Netlify-side notifications.
//
// Build hooks do not return a deploy ID in their response, so we identify
// "our" deploy by listing recent deploys and picking the OLDEST one created
// at or after the trigger timestamp (the first deploy queued after our POST).
//
// Inputs (env):
//   NETLIFY_AUTH_TOKEN   — Personal access token (User settings -> Applications)
//   NETLIFY_SITE_ID      — Site API ID (Site settings -> General -> Site ID)
//   NETLIFY_TRIGGER_TIME — ISO timestamp of when the build hook was POSTed
//
// Exits 0 if the deploy reaches `ready`, non-zero if it reaches `error` or
// times out. Exits 0 with a warning if either secret is missing — keeps the
// workflow backwards-compatible with setups that haven't configured the
// auth token yet (same fail-open posture as the build-hook secret).

const NETLIFY_API = "https://api.netlify.com/api/v1";
const TERMINAL_OK = new Set(["ready"]);
const TERMINAL_FAIL = new Set(["error"]);
const POLL_INTERVAL_MS = 15_000;
const TOTAL_TIMEOUT_MS = 25 * 60 * 1000;
const FIND_DEPLOY_TIMEOUT_MS = 3 * 60 * 1000;

const token = process.env.NETLIFY_AUTH_TOKEN;
const siteId = process.env.NETLIFY_SITE_ID;
const triggerTime = process.env.NETLIFY_TRIGGER_TIME;

if (!token || !siteId) {
  console.log(
    "::warning::NETLIFY_AUTH_TOKEN and/or NETLIFY_SITE_ID secret not set — skipping deploy poll.",
  );
  console.log(
    "::warning::Configure both repo secrets to fail this workflow when the Netlify build errors out (issue #1161).",
  );
  console.log("::warning::  NETLIFY_AUTH_TOKEN — User settings -> Applications -> Personal access tokens");
  console.log("::warning::  NETLIFY_SITE_ID    — Site settings -> General -> Site details -> Site ID");
  process.exit(0);
}

if (!triggerTime) {
  console.error("NETLIFY_TRIGGER_TIME env var is required (ISO timestamp of build-hook POST).");
  process.exit(2);
}

const triggerMs = Date.parse(triggerTime);
if (Number.isNaN(triggerMs)) {
  console.error(`NETLIFY_TRIGGER_TIME is not a valid ISO timestamp: ${triggerTime}`);
  process.exit(2);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function netlifyGet(path) {
  const res = await fetch(`${NETLIFY_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Netlify API ${path} -> ${res.status}: ${body}`);
  }
  return res.json();
}

async function findOurDeploy() {
  // Allow 5s clock skew between the runner and Netlify when matching deploys.
  const cutoffMs = triggerMs - 5000;
  const start = Date.now();
  while (Date.now() - start < FIND_DEPLOY_TIMEOUT_MS) {
    const deploys = await netlifyGet(`/sites/${siteId}/deploys?per_page=20`);
    const ours = deploys
      .filter((d) => d.created_at && Date.parse(d.created_at) >= cutoffMs)
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))[0];
    if (ours) return ours;
    console.log(
      `No deploy created at/after ${triggerTime} yet, retrying in ${POLL_INTERVAL_MS / 1000}s…`,
    );
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(
    `No new Netlify deploy appeared within ${FIND_DEPLOY_TIMEOUT_MS / 1000}s of triggering the build hook.`,
  );
}

async function waitForTerminal(deployId) {
  const start = Date.now();
  let lastState = null;
  while (Date.now() - start < TOTAL_TIMEOUT_MS) {
    const d = await netlifyGet(`/sites/${siteId}/deploys/${deployId}`);
    if (d.state !== lastState) {
      console.log(`Deploy ${deployId} state: ${d.state}`);
      lastState = d.state;
    }
    if (TERMINAL_FAIL.has(d.state)) {
      const url = d.admin_url ?? d.deploy_url ?? "(see Netlify UI)";
      console.log(
        `::error::Netlify deploy ${deployId} failed (state=${d.state}). Logs: ${url}`,
      );
      if (d.error_message) console.log(`::error::${d.error_message}`);
      process.exit(1);
    }
    if (TERMINAL_OK.has(d.state)) {
      const url = d.deploy_ssl_url ?? d.deploy_url ?? "(see Netlify UI)";
      console.log(`Netlify deploy ${deployId} succeeded. URL: ${url}`);
      return;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  console.log(
    `::error::Timed out after ${TOTAL_TIMEOUT_MS / 1000}s waiting for Netlify deploy ${deployId} to finish. Last state: ${lastState}.`,
  );
  process.exit(1);
}

const ours = await findOurDeploy();
console.log(`Tracking Netlify deploy ${ours.id} (created ${ours.created_at}, branch=${ours.branch ?? "?"}).`);
await waitForTerminal(ours.id);
