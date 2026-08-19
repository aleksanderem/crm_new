import { describe, expect, test } from "vitest";
import { FEATURES } from "../../convex/_helpers/permissionTypes";
import { DEFAULT_PERMISSIONS } from "../../convex/_helpers/permissions";

// Drift guard for the gabinet RBAC fix (sec-audit 2026-08). A plain org
// "member" must NOT gain operational gabinet access from the org-role default —
// the gabinet-role is the sole granting path (MAX-merge). Because a NEW gabinet
// feature added to FEATURES silently inherits the generic member default
// (create:"all"), which re-opens the hole (this happened once with
// gabinet_documents / gabinet_salary), every gabinet feature must be
// CONSCIOUSLY reviewed here.

// Every gabinet_* feature that has been reviewed and given a deliberate
// member/viewer default. Adding a new gabinet feature to FEATURES WITHOUT
// adding it here (and configuring its default in permissions.ts) fails the
// coverage test below — that is the point: it forces a security review.
const REVIEWED_GABINET_FEATURES = new Set<string>([
  // Operational / clinical — locked to "none" for member+viewer (gabinet-role governs).
  "gabinet_patients",
  "gabinet_treatments",
  "gabinet_appointments",
  "gabinet_packages",
  "gabinet_employees",
  "gabinet_inventory",
  "gabinet_dashboard",
  "gabinet_photos",
  "gabinet_documents",
  "gabinet_salary",
  // Financial / settings — deliberate per-feature member overrides (NOT all-none).
  "gabinet_payments",
  "gabinet_receipts",
  "gabinet_reports",
  "gabinet_financial_reports",
  "gabinet_purchase_prices",
  "gabinet_online_booking",
  "gabinet_settings",
]);

// The operational subset that MUST default to "none" for member and viewer
// (financial features intentionally allow some member access, so they are
// excluded from this stricter check).
const OPERATIONAL_MUST_BE_NONE = [
  "gabinet_patients",
  "gabinet_treatments",
  "gabinet_appointments",
  "gabinet_packages",
  "gabinet_employees",
  "gabinet_inventory",
  "gabinet_dashboard",
  "gabinet_photos",
  "gabinet_documents",
  "gabinet_salary",
] as const;

describe("gabinet permission coverage (RBAC drift guard)", () => {
  test("every gabinet_* feature has been consciously reviewed", () => {
    const gabinetFeatures = FEATURES.filter((f) => f.startsWith("gabinet_"));
    const unreviewed = gabinetFeatures.filter(
      (f) => !REVIEWED_GABINET_FEATURES.has(f),
    );
    // If this fails, a new gabinet feature was added to FEATURES. Configure its
    // member/viewer default in convex/_helpers/permissions.ts (operational →
    // "none" so it requires a gabinet-role), then add it to
    // REVIEWED_GABINET_FEATURES above.
    expect(unreviewed).toEqual([]);
  });

  test("operational gabinet features default to 'none' for member and viewer", () => {
    for (const feature of OPERATIONAL_MUST_BE_NONE) {
      for (const role of ["member", "viewer"] as const) {
        const perms = DEFAULT_PERMISSIONS[role][feature];
        for (const action of [
          "view",
          "create",
          "edit",
          "delete",
        ] as const) {
          expect(
            perms[action],
            `${role}.${feature}.${action} must be "none" (gabinet-role is the sole grant)`,
          ).toBe("none");
        }
      }
    }
  });

  test("no gabinet feature leaves member with the generic create:'all' default", () => {
    // The generic member default is create:"all". Any gabinet feature still on
    // that value has NOT been given an intentional override — except the
    // financial ones that deliberately allow member create.
    const intentionalMemberCreate = new Set<string>([
      "gabinet_payments",
      "gabinet_receipts",
    ]);
    const gabinetFeatures = FEATURES.filter((f) => f.startsWith("gabinet_"));
    const leaky = gabinetFeatures.filter(
      (f) =>
        DEFAULT_PERMISSIONS.member[f].create === "all" &&
        !intentionalMemberCreate.has(f),
    );
    expect(leaky).toEqual([]);
  });
});
