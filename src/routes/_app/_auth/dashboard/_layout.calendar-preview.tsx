import { createFileRoute } from "@tanstack/react-router";
import { Calendar } from "@/components/application/calendar/calendar";
import { events } from "@/components/application/calendar/config";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/calendar-preview"
)({
  component: CalendarPreview,
});

function CalendarPreview() {
  return (
    <div className="flex flex-1 flex-col">
      <Calendar events={events} view="month" />
    </div>
  );
}
