import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { NudgeCard } from "../nudge-card";

export function GabinetGlobalNudges({ organizationId }: { organizationId: Id<"organizations"> }) {
  const appointmentNudges = useQuery(api.gabinet.nudges.getAppointmentNudges, { organizationId });
  const leaveNudges = useQuery(api.gabinet.nudges.getLeaveNudges, { organizationId });
  const patientNudges = useQuery(api.gabinet.nudges.getPatientNudges, { organizationId });

  const nudges = [
    ...(appointmentNudges ?? []),
    ...(leaveNudges ?? []),
    ...(patientNudges ?? []),
  ].slice(0, 3);

  if (nudges.length === 0) return null;

  return (
    <>
      {nudges.map((n, index) => (
        <NudgeCard
          key={`${n.message}-${index}`}
          message={n.message}
          messageValues={n.messageValues}
          severity={n.severity}
          icon={n.icon}
        />
      ))}
    </>
  );
}
