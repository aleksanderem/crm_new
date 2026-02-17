import type { CalendarDate, ZonedDateTime } from "@internationalized/date";
import { BellRinging01, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, Copy01, Edit01, Trash01 } from "@untitledui/icons";
import {
    Calendar as AriaCalendar,
    CalendarGrid as AriaCalendarGrid,
    CalendarGridBody as AriaCalendarGridBody,
    CalendarGridHeader as AriaCalendarGridHeader,
    CalendarHeaderCell as AriaCalendarHeaderCell,
    Heading as AriaHeading,
} from "react-aria-components";
import { CalendarCell } from "@/components/application/date-picker/cell";
import { Avatar } from "@/components/base/avatar/avatar";
import { AvatarAddButton } from "@/components/base/avatar/base-components";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { cx } from "@/lib/utils/cx";

interface CalendarSidebarProps {
    selectedDate: CalendarDate | null;
    onDateChange: (date: CalendarDate) => void;
    highlightedDates: Set<string>;
    className?: string;
}

export const CalendarSidebar = ({ selectedDate, onDateChange, highlightedDates, className }: CalendarSidebarProps) => {
    return (
        <div className={cx("flex flex-col overflow-auto border-l border-border mask-b-from-94%", className)}>
            <AriaCalendar aria-label="Calendar" className="px-6 py-5" value={selectedDate} onChange={(value) => onDateChange(value)}>
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

            <div className="flex flex-col gap-5 border-t border-border px-6 py-5">
                <div className="flex flex-col gap-2">
                    <section className="flex w-full justify-between">
                        <p className="text-md font-semibold text-foreground">Product demo</p>
                        <div className="-mt-2 -mr-2 flex gap-0.5">
                            <ButtonUtility size="xs" color="tertiary" tooltip="Copy link" icon={Copy01} />
                            <ButtonUtility size="xs" color="tertiary" tooltip="Delete" icon={Trash01} />
                            <ButtonUtility size="xs" color="tertiary" tooltip="Edit" icon={Edit01} />
                        </div>
                    </section>
                    <section className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-1.5">
                            <CalendarIcon className="size-4 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">Friday, Jan 10, 2025</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Clock className="size-4 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">1:30 PM - 3:30 PM</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <BellRinging01 className="size-4 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">10 min before</p>
                        </div>
                    </section>
                </div>
                <div className="flex flex-col gap-3">
                    <section className="flex gap-2">
                        <section className="flex flex-row -space-x-2">
                            <Avatar
                                className="ring-[1.5px] ring-card"
                                src="https://www.untitledui.com/images/avatars/sienna-hewitt?fm=webp&q=80"
                                alt="Sienna Hewitt"
                                size="sm"
                            />
                            <Avatar
                                className="ring-[1.5px] ring-card"
                                src="https://www.untitledui.com/images/avatars/ammar-foley?fm=webp&q=80"
                                alt="Ammar Foley"
                                size="sm"
                            />
                            <Avatar
                                className="ring-[1.5px] ring-card"
                                src="https://www.untitledui.com/images/avatars/pippa-wilkinson?fm=webp&q=80"
                                alt="Pippa Wilkinson"
                                size="sm"
                            />
                            <Avatar
                                className="ring-[1.5px] ring-card"
                                src="https://www.untitledui.com/images/avatars/olly-schroeder?fm=webp&q=80"
                                alt="Olly Schroeder"
                                size="sm"
                            />
                            <Avatar
                                className="ring-[1.5px] ring-card"
                                src="https://www.untitledui.com/images/avatars/mathilde-lewis?fm=webp&q=80"
                                alt="Mathilde Lewis"
                                size="sm"
                            />
                            <Avatar className="ring-[1.5px] ring-card" initials="OR" size="sm" />
                        </section>
                        <AvatarAddButton size="sm" />
                    </section>

                    <section className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">6 guests</p>
                        <span className="h-[13px] border-l border-border" />
                        <p className="text-sm text-muted-foreground">5 yes</p>
                        <span className="h-[13px] border-l border-border" />
                        <p className="text-sm text-muted-foreground">1 awaiting</p>
                    </section>
                </div>

                <section className="flex flex-col gap-2">
                    <p className="text-sm font-semibold text-foreground">About this event</p>
                    <div className="text-sm text-muted-foreground">
                        <p>Sienna is inviting you to a scheduled Zoom meeting.</p>
                        <br />
                        <p>Topic: Product demo for the new dashboard and Q&A session.</p>
                        <br />
                        <p className="break-words whitespace-normal">
                            Join Zoom Meeting:&nbsp;
                            <span className="break-all underline">https://us02web.zoom.us/j/86341969512</span>&nbsp;
                        </p>
                        <br />
                        <p>Meeting ID: 863 4196 9512</p>
                    </div>
                </section>
            </div>
        </div>
    );
};
