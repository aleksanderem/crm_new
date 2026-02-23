import { useMemo } from "react";
import { CalendarDate, CalendarDateTime, type ZonedDateTime, getLocalTimeZone, isSameDay, toCalendarDate, toZoned } from "@internationalized/date";
import { useDateFormatter, useLocale } from "@react-aria/i18n";
import { XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { cx } from "@/lib/utils/cx";
import { CalendarDwViewCell } from "./calendar-dw-view-cell";
import { CalendarDwViewEvent } from "./calendar-dw-view-event";
import { CalendarRowLabel } from "./calendar-row-label";
import { CalendarTimeMarker } from "./calendar-time-marker";

type ZonedEvent = {
    id: string;
    title: string;
    start: ZonedDateTime;
    end: ZonedDateTime;
    color?: string;
    dot?: boolean;
};

const SLOT_HEIGHT = 48;

const getStartOfDay = (date: ZonedDateTime | CalendarDate, timeZone: string): ZonedDateTime => {
    const zoned = date instanceof CalendarDate ? toZoned(date, timeZone) : date;
    return zoned.set({ hour: 0, minute: 0, second: 0, millisecond: 0 });
};

const getEndOfDay = (date: ZonedDateTime | CalendarDate, timeZone: string): ZonedDateTime => {
    const zoned = date instanceof CalendarDate ? toZoned(date, timeZone) : date;
    return zoned.set({ hour: 23, minute: 59, second: 59, millisecond: 999 });
};

interface CalendarSidebarProps {
    selectedDate: CalendarDate;
    zonedEvents: ZonedEvent[];
    currentTime: ZonedDateTime;
    onClose?: () => void;
    className?: string;
}

export const CalendarSidebar = ({ selectedDate, zonedEvents, currentTime, onClose, className }: CalendarSidebarProps) => {
    const { locale } = useLocale();
    const timeZone = getLocalTimeZone();
    const timeFormatter = useDateFormatter({ hour: "numeric", minute: "2-digit", hour12: true });
    const hourOnlyFormatter = useDateFormatter({ hour: "numeric", hour12: true });
    const dateFormatter = useDateFormatter({ weekday: "long", month: "long", day: "numeric" });

    const dayEvents = useMemo(() => {
        const dayStart = getStartOfDay(selectedDate, timeZone);
        const dayEnd = getEndOfDay(selectedDate, timeZone);
        return zonedEvents
            .filter((event) => event.start.compare(dayEnd) < 0 && event.end.compare(dayStart) > 0)
            .sort((a, b) => a.start.compare(b.start));
    }, [zonedEvents, selectedDate, timeZone]);

    const hours = Array.from({ length: 24 }, (_, i) => i);

    const showTimeMarker = isSameDay(toCalendarDate(currentTime), selectedDate);
    let timeMarkerTop = 0;
    if (showTimeMarker) {
        timeMarkerTop = ((currentTime.hour * 60 + currentTime.minute) / 30) * SLOT_HEIGHT;
    }

    const dayStart = useMemo(() => getStartOfDay(selectedDate, timeZone), [selectedDate, timeZone]);

    return (
        <div className={cx("flex flex-col overflow-hidden border-l border-border", className)}>
            {/* Day header */}
            <div className="flex shrink-0 items-start justify-between border-b border-border px-4 py-3">
                <div>
                    <p className="text-sm font-semibold text-foreground">
                        {dateFormatter.format(selectedDate.toDate(timeZone))}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {dayEvents.length === 0 ? "No events" : `${dayEvents.length} event${dayEvents.length !== 1 ? "s" : ""}`}
                    </p>
                </div>
                {onClose && (
                    <Button iconLeading={XClose} size="sm" color="tertiary" className="size-8 shrink-0" onPress={onClose} />
                )}
            </div>

            {/* Scrollable day schedule */}
            <div className="relative flex flex-1 overflow-y-auto">
                {/* Time gutter */}
                <div className="flex h-max w-14 shrink-0 flex-col border-r border-border">
                    {hours.map((hour) => {
                        const time = new CalendarDateTime(selectedDate.year, selectedDate.month, selectedDate.day, hour);
                        const timeString = hourOnlyFormatter.format(toZoned(time, timeZone).toDate());
                        return <CalendarRowLabel key={`sidebar-time-${hour}`}>{timeString}</CalendarRowLabel>;
                    })}
                </div>

                {/* Time slots + events */}
                <div className="relative flex-1">
                    {Array.from({ length: 48 }).map((_, slotIndex) => (
                        <CalendarDwViewCell
                            key={`sidebar-slot-${slotIndex}`}
                            className={cx("before:border-r-0", slotIndex === 47 && "before:border-b-0")}
                        />
                    ))}

                    {dayEvents.map((event, index) => {
                        const startZoned = event.start;
                        const endZoned = event.end;
                        const dayEnd = getEndOfDay(dayStart, timeZone);

                        const clampedStart = startZoned.compare(dayStart) < 0 ? dayStart : startZoned;
                        const clampedEnd = endZoned.compare(dayEnd) > 0 ? dayEnd : endZoned;

                        const startMinutes = clampedStart.hour * 60 + clampedStart.minute;
                        const endMinutes = clampedEnd.hour * 60 + clampedEnd.minute;
                        const durationMinutes = Math.max(15, endMinutes - startMinutes);

                        const top = (startMinutes / 30) * SLOT_HEIGHT;
                        const height = Math.max(SLOT_HEIGHT / 2, (durationMinutes / 30) * SLOT_HEIGHT);

                        const displayTime = durationMinutes > 30;
                        const supportingText = displayTime ? timeFormatter.format(startZoned.toDate()) : undefined;

                        return (
                            <div
                                key={event.id}
                                className="absolute w-full px-1.5 py-1.5"
                                style={{ top: `${top}px`, height: `${height}px`, zIndex: index }}
                            >
                                <CalendarDwViewEvent
                                    label={event.title}
                                    supportingText={supportingText}
                                    color={event.color as any}
                                    withDot={event.dot}
                                />
                            </div>
                        );
                    })}

                    {showTimeMarker && (
                        <CalendarTimeMarker style={{ top: `${timeMarkerTop}px` }}>
                            {timeFormatter.format(currentTime.toDate())}
                        </CalendarTimeMarker>
                    )}
                </div>
            </div>
        </div>
    );
};
