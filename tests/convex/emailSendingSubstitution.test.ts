import { expect, test, describe } from "vitest";
import {
  substituteVariables,
  SYSTEM_URL_PLACEHOLDER_KEYS,
} from "../../convex/emailSending";

describe("substituteVariables", () => {
  test("substitutes flat keys", () => {
    expect(substituteVariables("Hi {{name}}", { name: "Anna" })).toBe(
      "Hi Anna",
    );
  });

  test("substitutes dot-prefixed keys by stripping the source prefix", () => {
    const result = substituteVariables(
      "Verify: {{current_user.verification_url}}",
      { verification_url: "https://example.com/v?token=abc" },
    );
    expect(result).toBe("Verify: https://example.com/v?token=abc");
  });

  test("prefers exact dot-prefixed key match over stripped lookup", () => {
    const result = substituteVariables("Url: {{patient.portal_url}}", {
      "patient.portal_url": "https://exact",
      portal_url: "https://stripped",
    });
    expect(result).toBe("Url: https://exact");
  });

  test("leaves unresolved placeholders as literal {{...}}", () => {
    expect(substituteVariables("Hi {{missing}}", {})).toBe("Hi {{missing}}");
  });
});

describe("SYSTEM_URL_PLACEHOLDER_KEYS", () => {
  test("includes every URL placeholder referenced by seeded system templates", () => {
    expect(new Set(SYSTEM_URL_PLACEHOLDER_KEYS)).toEqual(
      new Set([
        "verification_url",
        "reset_url",
        "invitation_url",
        "signing_url",
        "portal_url",
      ]),
    );
  });

  test("each key resolves cleanly when defaulted to empty string", () => {
    const variables: Record<string, string> = {};
    for (const key of SYSTEM_URL_PLACEHOLDER_KEYS) {
      variables[key] = "";
    }

    const body = `
      <a href="{{current_user.verification_url}}">Verify</a>
      <a href="{{current_user.reset_url}}">Reset</a>
      <a href="{{current_user.invitation_url}}">Invite</a>
      <a href="{{current_user.signing_url}}">Sign</a>
      <a href="{{patient.portal_url}}">Portal</a>
    `;

    const out = substituteVariables(body, variables);
    expect(out).not.toContain("{{");
    expect(out).not.toContain("}}");
  });
});
