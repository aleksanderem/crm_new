import type { CalendarDate } from "@internationalized/date";
import { ChevronLeft, ChevronRight } from "@untitledui/icons";
import {
    Calendar as AriaCalendar,
    CalendarGrid as AriaCalendarGrid,
    CalendarGridBody as AriaCalendarGridBody,
    CalendarGridHeader as AriaCalendarGridHeader,
    CalendarHeaderCell as AriaCalendarHeaderCell,
    Heading as AriaHeading,
} from "react-aria-components";
import { CalendarCell } from "@/components/application/date-picker/cell";
import { Button } from "@/components/base/buttons/button";
import { cx } from "@/lib/utils/cx";

interface CalendarMiniMonthProps {
    selectedDate: CalendarDate | null;
    onDateChange: (date: CalendarDate) => void;
    highlightedDates: Set<string>;
    className?: string;
}

export const CalendarMiniMonth = ({ selectedDate, onDateChange, highlightedDates, className }: CalendarMiniMonthProps) => {
    return (
        <div className={cx("flex border-t border-border px-6 py-4", className)}>
            <AriaCalendar aria-label="Mini calendar" value={selectedDate} onChange={(value) => onDateChange(value)}>
                <header className="mb-3 flex items-center justify-between">
                    <Button slot="previous" iconLeading={ChevronLeft} size="sm" color="tertiary" className="size-8" />
                    <AriaHeading className="text-sm font-semibold text-foreground" />
                    <Button slot="next" iconLeading={ChevronRight} size="sm" color="tertiary" className="size-8" />
                </header>

                <AriaCalendarGrid weekdayStyle="short" className="w-max">
                    <AriaCalendarGridHeader className="border-b-4 border-transparent">
                        {(day) => (
                            <AriaCalendarHeaderCell className="p-0">
                                <div className="flex size-10 items-center justify-center text-sm font-medium text-muted-foreground">{day.slice(0, 2)}</div>
                            </AriaCalendarHeaderCell>
                        )}
                    </AriaCalendarGridHeader>
                    <AriaCalendarGridBody className="[&_tr]:last-of-type]:border-none [&_td]:p-0 [&_tr]:border-b-4 [&_tr]:border-transparent">
                        {(date) => <CalendarCell date={date} isHighlighted={highlightedDates.has(date.toString())} />}
                    </AriaCalendarGridBody>
                </AriaCalendarGrid>
            </AriaCalendar>
        </div>
    );
};
