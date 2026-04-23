import { useAction } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { NudgeCard } from "../nudge-card";

export function GabinetGlobalNudges({ organizationId }: { organizationId: Id<"organizations"> }) {
  const getAppointmentNudges = useAction(api.gabinet.nudges.getAppointmentNudges);
  const getLeaveNudges = useAction(api.gabinet.nudges.getLeaveNudges);
  const getPatientNudges = useAction(api.gabinet.nudges.getPatientNudges);

  const { data: appointmentNudges } = useQuery({
    queryKey: ["gabinet.nudges.getAppointmentNudges", organizationId],
    queryFn: () => getAppointmentNudges({ organizationId }),
    enabled: !!organizationId,
  });
  const { data: leaveNudges } = useQuery({
    queryKey: ["gabinet.nudges.getLeaveNudges", organizationId],
    queryFn: () => getLeaveNudges({ organizationId }),
    enabled: !!organizationId,
  });
  const { data: patientNudges } = useQuery({
    queryKey: ["gabinet.nudges.getPatientNudges", organizationId],
    queryFn: () => getPatientNudges({ organizationId }),
    enabled: !!organizationId,
  });

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
