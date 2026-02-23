import { internalMutation } from "../_generated/server";

/**
 * Appointment reminder cron — finds tomorrow's appointments and logs reminders.
 * In production, integrate with Resend to send email reminders.
 */
export const sendDailyReminders = internalMutation({
  handler: async (ctx) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    // Get all appointments for tomorrow across all orgs
    const appointments = await ctx.db
      .query("gabinetAppointments")
      .filter((q) => q.eq(q.field("date"), tomorrowStr))
      .collect();

    const active = appointments.filter(
      (a) => a.status === "scheduled" || a.status === "confirmed"
    );

    for (const appt of active) {
      const patient = await ctx.db.get(appt.patientId);
      const treatment = await ctx.db.get(appt.treatmentId);

      if (patient?.email) {
        // TODO: Send email via Resend
        console.log(
          `[Reminder] ${patient.email}: ${treatment?.name ?? "Appointment"} at ${appt.startTime} on ${appt.date}`
        );
      }
    }

    return { sent: active.length };
  },
});
