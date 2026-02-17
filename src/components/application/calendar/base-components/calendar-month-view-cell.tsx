import type { HTMLAttributes } from "react";
import { Plus } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { cx } from "@/lib/utils/cx";

interface CalendarMonthViewCellProps extends HTMLAttributes<HTMLDivElement> {
    day: number;
    state?: "default" | "selected" | "current";
    isDisabled?: boolean;
}

export const CalendarMonthViewCell = ({ isDisabled, children, className, day, state, ...props }: CalendarMonthViewCellProps) => {
    return (
        <div
            {...props}
            className={cx(
                "group relative flex flex-col gap-1.5 bg-card p-1.5 hover:bg-accent max-md:min-h-22 md:gap-1 md:p-2",
                "before:pointer-events-none before:absolute before:inset-0 before:border-r before:border-b before:border-border",
                isDisabled ? "pointer-events-none bg-muted" : "cursor-pointer",
                className,
            )}
        >
            {!isDisabled && (
                <div className="absolute right-1.5 bottom-1.5 z-10 hidden group-hover:inline-flex">
                    <Button aria-label="Add event" size="sm" iconLeading={Plus} color="secondary" className="size-7 text-muted-foreground" />
                </div>
            )}

            <span
                className={cx(
                    "flex size-6 items-center justify-center rounded-full text-xs font-semibold text-foreground/80",
                    state === "selected" && "bg-primary text-primary-foreground",
                    state === "current" && "bg-accent",
                    isDisabled && "text-muted-foreground/50",
                )}
            >
                {day}
            </span>

            {children}
        </div>
    );
};
