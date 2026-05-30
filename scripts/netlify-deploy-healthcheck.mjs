#!/usr/bin/env node
// Scheduled health check for the latest Netlify deploy on `main`. Issue #1162:
// the in-workflow polling added by #1161/#1182 catches failures of deploys
// triggered by our push-to-main job, but it does not catch failures of deploys
// triggered by anything else (Netlify auto-deploy on its own schedule, manual
// "Trigger deploy" clicks in the UI, drift after a rollback). This script
// queries the Netlify API for the most recent deploy on `main`, and if it is
// in the `error` state and the commit is newer than MAX_AGE_HOURS, signals
// the calling workflow to open a tracking issue.
//
// Inputs (env):
//   NETLIFY_AUTH_TOKEN — Personal access token (User settings -> Applications)
//   NETLIFY_SITE_ID    — Site API ID (Site settings -> General -> Site ID)
//   MAX_AGE_HOURS      — Optional, default 24. Skip alerting on older failures
//                         so that we do not spam issues for known-broken commits
//                         that have already been triaged or rolled past.
//   GITHUB_OUTPUT      — Set by GitHub Actions; receives structured outputs.
//
// Exits 0 in all non-exceptional cases. The decision to alert is communicated
// via the `should_alert` output, not the exit code, so the workflow run stays
// green on healthy deploys.

const NETLIFY_API = "https://api.netlify.com/api/v1";
const DEFAULT_MAX_AGE_HOURS = 24;
const BRANCH = "main";

const token = process.env.NETLIFY_AUTH_TOKEN;
const siteId = process.env.NETLIFY_SITE_ID;
const maxAgeHours = Number(process.env.MAX_AGE_HOURS ?? DEFAULT_MAX_AGE_HOURS);

if (!token || !siteId) {
  console.log(
    "::warning::NETLIFY_AUTH_TOKEN and/or NETLIFY_SITE_ID secret not set — skipping deploy health check.",
  );
  await writeOutputs({ should_alert: "false", reason: "missing-credentials" });
  process.exit(0);
}

if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) {
  console.error(`MAX_AGE_HOURS must be a positive number, got: ${process.env.MAX_AGE_HOURS}`);
  process.exit(2);
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

async function writeOutputs(outputs) {
  const path = process.env.GITHUB_OUTPUT;
  if (!path) return;
  const { writeFile } = await import("node:fs/promises");
  const lines = Object.entries(outputs)
    .map(([k, v]) => `${k}=${String(v).replace(/\r?\n/g, " ")}`)
    .join("\n");
  await writeFile(path, lines + "\n", { flag: "a" });
}

// `branch=main` filters server-side, but we still need `per_page` because the
// most recent deploy on `main` is what we want — not the most recent ever.
const deploys = await netlifyGet(
  `/sites/${siteId}/deploys?branch=${encodeURIComponent(BRANCH)}&per_page=5`,
);

if (!Array.isArray(deploys) || deploys.length === 0) {
  console.log(`No deploys found for branch ${BRANCH} — nothing to check.`);
  await writeOutputs({ should_alert: "false", reason: "no-deploys" });
  process.exit(0);
}

const latest = deploys[0];
const ageHours = latest.created_at
  ? (Date.now() - Date.parse(latest.created_at)) / (1000 * 60 * 60)
  : Number.POSITIVE_INFINITY;

console.log(
  `Latest ${BRANCH} deploy: id=${latest.id} state=${latest.state} created=${latest.created_at} age=${ageHours.toFixed(2)}h commit=${latest.commit_ref ?? "?"}`,
);

if (latest.state !== "error") {
  console.log(`Deploy state is "${latest.state}" — healthy, no alert.`);
  await writeOutputs({ should_alert: "false", reason: `state-${latest.state}` });
  process.exit(0);
}

if (ageHours > maxAgeHours) {
  console.log(
    `Deploy errored but is ${ageHours.toFixed(1)}h old (> ${maxAgeHours}h threshold) — skipping alert.`,
  );
  await writeOutputs({ should_alert: "false", reason: "too-old" });
  process.exit(0);
}

const sha = latest.commit_ref ?? "unknown";
const shortSha = sha === "unknown" ? "unknown" : sha.slice(0, 7);
const adminUrl = latest.admin_url ?? `https://app.netlify.com/sites/${siteId}/deploys/${latest.id}`;
const commitUrl = latest.commit_url ?? "";
const errorMessage = latest.error_message ?? "(no error_message returned by Netlify API)";

console.log(`::warning::Netlify deploy ${latest.id} on main is in error state (commit ${shortSha}).`);

await writeOutputs({
  should_alert: "true",
  deploy_id: latest.id,
  commit_sha: sha,
  short_sha: shortSha,
  created_at: latest.created_at ?? "",
  branch: latest.branch ?? BRANCH,
  admin_url: adminUrl,
  commit_url: commitUrl,
  error_message: errorMessage,
});
