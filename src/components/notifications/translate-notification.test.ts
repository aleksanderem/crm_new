import { describe, expect, it } from "vitest";
import {
  translateNotificationMessage,
  translateNotificationTitle,
} from "./translate-notification";

// Minimal i18next-like translator that echoes the default value with
// `{{param}}` placeholders interpolated. Status keys
// (`gabinet.appointments.statuses.<status>`) fall through the i18next
// fallback (no defaultValue) so we map them inline below.
const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  pending_confirmation: "Pending confirmation",
  confirmed: "Confirmed",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

const t = (
  key: string,
  arg?: string | { defaultValue?: string; [k: string]: unknown },
): string => {
  if (key.startsWith("gabinet.appointments.statuses.")) {
    const status = key.split(".").pop() ?? "";
    return STATUS_LABELS[status] ?? (typeof arg === "string" ? arg : status);
  }
  if (typeof arg === "string") return arg;
  const tpl = (arg?.defaultValue as string) ?? "";
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, name) => String(arg?.[name] ?? ""));
};

describe("translateNotificationTitle", () => {
  it("translates known title templates", () => {
    expect(translateNotificationTitle("Appointment status changed", t)).toBe(
      "Appointment status changed",
    );
    expect(translateNotificationTitle("Appointment confirmed via SMS", t)).toBe(
      "Appointment confirmed via SMS",
    );
    expect(translateNotificationTitle("Appointment cancelled via SMS", t)).toBe(
      "Appointment cancelled via SMS",
    );
    expect(translateNotificationTitle("Appointment cancelled", t)).toBe(
      "Appointment cancelled",
    );
  });

  it("returns unrecognised titles unchanged", () => {
    expect(translateNotificationTitle("Some other title", t)).toBe(
      "Some other title",
    );
  });

  it("returns input when no translator provided", () => {
    expect(
      translateNotificationTitle("Appointment status changed", undefined),
    ).toBe("Appointment status changed");
  });
});

describe("translateNotificationMessage", () => {
  it("translates the SMS-reply message and the status name within it", () => {
    expect(
      translateNotificationMessage(
        'Appointment status changed to "confirmed" from patient SMS reply',
        t,
      ),
    ).toBe('Appointment status changed to "Confirmed" from patient SMS reply');

    expect(
      translateNotificationMessage(
        'Appointment status changed to "cancelled" from patient SMS reply',
        t,
      ),
    ).toBe('Appointment status changed to "Cancelled" from patient SMS reply');
  });

  it("translates the generic status-change message and the status name within it", () => {
    expect(
      translateNotificationMessage(
        'Appointment status changed to "completed"',
        t,
      ),
    ).toBe('Appointment status changed to "Completed"');

    expect(
      translateNotificationMessage(
        'Appointment status changed to "no_show"',
        t,
      ),
    ).toBe('Appointment status changed to "No-show"');
  });

  it("translates the cancelled message with and without reason", () => {
    expect(
      translateNotificationMessage("An appointment has been cancelled", t),
    ).toBe("An appointment has been cancelled");
    expect(
      translateNotificationMessage(
        "An appointment has been cancelled: patient sick",
        t,
      ),
    ).toBe("An appointment has been cancelled: patient sick");
  });

  it("returns unrecognised messages unchanged", () => {
    expect(translateNotificationMessage("Something else", t)).toBe(
      "Something else",
    );
  });
});
