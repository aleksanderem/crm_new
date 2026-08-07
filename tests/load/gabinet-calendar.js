/**
 * Load test: Gabinet calendar date-range query
 *
 * Simulates concurrent users opening the calendar view. Each VU fetches
 * appointments for a random week (or month) within the current year, with
 * and without an employee filter — matching the two most common UI states.
 *
 * The production query hits `gabinet_appointments_org_date_idx
 * ON gabinet_appointments (organization_id, date)` and the
 * `gabinet_appointments_org_employee_date_idx` compound index, so response
 * times should be <200 ms even with thousands of rows per org.
 *
 * Thresholds:
 *   p95 < 500 ms   — calendar must feel responsive
 *   error rate < 1%
 *
 * Run:
 *   k6 run --env SUPABASE_URL=... --env SUPABASE_SERVICE_ROLE_KEY=... \
 *           --env TEST_ORG_ID=... tests/load/gabinet-calendar.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";
import { env, supabaseHeaders, validateEnv } from "./config.js";

const calendarLatency = new Trend("gabinet_calendar_latency", true);
const calendarErrors = new Rate("gabinet_calendar_errors");

export const options = {
  scenarios: {
    weekly_view: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 20 },
        { duration: "3m", target: 50 },
        { duration: "30s", target: 0 },
      ],
      tags: { scenario: "weekly" },
    },
    monthly_view: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 5 },
        { duration: "3m", target: 15 },
        { duration: "30s", target: 0 },
      ],
      tags: { scenario: "monthly" },
    },
  },
  thresholds: {
    gabinet_calendar_latency: ["p(95)<500"],
    gabinet_calendar_errors: ["rate<0.01"],
    http_req_failed: ["rate<0.01"],
  },
};

// Fixed employee IDs populated at init time — replaced by TEST_EMPLOYEE_IDS env var
// (comma-separated list) or left empty to test org-wide calendar queries only.
let employeeIds = [];

export function setup() {
  validateEnv(["supabaseUrl", "supabaseKey", "orgId"]);

  const ids = __ENV.TEST_EMPLOYEE_IDS; // eslint-disable-line no-undef
  if (ids) {
    employeeIds = ids.split(",").map((s) => s.trim()).filter(Boolean);
  }

  // Warm up: verify the org has appointment data.
  const res = http.get(
    `${env.supabaseUrl}/rest/v1/gabinet_appointments?select=id&organization_id=eq.${env.orgId}&limit=1`,
    { headers: supabaseHeaders() },
  );
  if (res.status !== 200) {
    throw new Error(`Setup check failed: ${res.status} ${res.body}`);
  }
  return { employeeIds };
}

function randomWeek() {
  const now = new Date();
  const year = now.getFullYear();
  // Pick a random Monday within the current year
  const dayOfYear = Math.floor(Math.random() * 52) * 7;
  const start = new Date(year, 0, 1 + dayOfYear);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
}

function randomMonth() {
  const year = new Date().getFullYear();
  const month = Math.floor(Math.random() * 12);
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
}

export default function (data) {
  const isMonthlyScenario = exec.scenario.name === "monthly_view"; // eslint-disable-line no-undef
  const { start, end } = isMonthlyScenario ? randomMonth() : randomWeek();

  let url = `${env.supabaseUrl}/rest/v1/gabinet_appointments`
    + `?select=id,date,start_time,end_time,status,employee_id,patient_id,location_id`
    + `&organization_id=eq.${env.orgId}`
    + `&date=gte.${start}`
    + `&date=lte.${end}`
    + `&order=date.asc,start_time.asc`;

  // 40% of requests include an employee filter (mirrors real usage — users
  // commonly filter calendar to their own appointments).
  if (data.employeeIds.length > 0 && Math.random() < 0.4) {
    const empId = data.employeeIds[Math.floor(Math.random() * data.employeeIds.length)];
    url += `&employee_id=eq.${empId}`;
  }

  const res = http.get(url, { headers: supabaseHeaders(), tags: { name: "calendar_fetch" } });

  const ok = check(res, {
    "status 200": (r) => r.status === 200,
    "returned array": (r) => {
      try {
        return Array.isArray(JSON.parse(r.body));
      } catch {
        return false;
      }
    },
  });

  calendarLatency.add(res.timings.duration);
  calendarErrors.add(!ok);

  // Simulate user staying on the page before navigating
  sleep(Math.random() * 2 + 1);
}
