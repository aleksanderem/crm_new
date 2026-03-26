import type { ComponentPropsWithRef, ReactNode } from "react";
import { Fragment, createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { TabListProps as AriaTabListProps, TabProps as AriaTabProps, TabRenderProps as AriaTabRenderProps } from "react-aria-components";
import { Tab as AriaTab, TabList as AriaTabList, TabPanel as AriaTabPanel, Tabs as AriaTabs, TabsContext, useSlottedContext } from "react-aria-components";
import type { BadgeColors } from "@untitled/base/badges/badge-types";
import { Badge } from "@untitled/base/badges/badges";
import { cx } from "@/lib/utils/cx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";

type Orientation = "horizontal" | "vertical";

// Types for different orientations
type HorizontalTypes = "button-brand" | "button-gray" | "button-border" | "button-minimal" | "underline";
type VerticalTypes = "button-brand" | "button-gray" | "button-border" | "button-minimal" | "line";
type TabTypeColors<T> = T extends "horizontal" ? HorizontalTypes : VerticalTypes;

// Styles for different types of tab
const getTabStyles = ({ isFocusVisible, isSelected, isHovered }: AriaTabRenderProps) => ({
    "button-brand": cx(
        "outline-focus-ring",
        isFocusVisible && "outline-2 -outline-offset-2",
        (isSelected || isHovered) && "bg-brand-primary_alt text-brand-secondary",
    ),
    "button-gray": cx(
        "outline-focus-ring",
        isHovered && "bg-bg-primary_hover text-fg-secondary",
        isFocusVisible && "outline-2 -outline-offset-2",
        isSelected && "bg-bg-primary_hover text-fg-secondary",
    ),
    "button-border": cx(
        "outline-focus-ring",
        (isSelected || isHovered) && "bg-background text-foreground shadow-sm",
        isFocusVisible && "outline-2 -outline-offset-2",
    ),
    "button-minimal": cx(
        "rounded-lg outline-focus-ring",
        isHovered && "text-fg-secondary",
        isFocusVisible && "outline-2 -outline-offset-2",
        isSelected && "bg-bg-primary_alt text-fg-secondary shadow-xs ring-1 ring-border-primary ring-inset",
    ),
    underline: cx(
        "rounded-none border-b-2 border-transparent outline-focus-ring",
        (isSelected || isHovered) && "border-fg-brand-primary_alt text-brand-secondary",
        isFocusVisible && "outline-2 -outline-offset-2",
    ),
    line: cx(
        "rounded-none border-l-2 border-transparent outline-focus-ring",
        (isSelected || isHovered) && "border-fg-brand-primary_alt text-brand-secondary",
        isFocusVisible && "outline-2 -outline-offset-2",
    ),
});

const sizes = {
    sm: {
        "button-brand": "text-sm font-semibold py-2 px-3",
        "button-gray": "text-sm font-semibold py-2 px-3",
        "button-border": "text-sm font-semibold py-2 px-3",
        "button-minimal": "text-sm font-semibold py-2 px-3",
        underline: "text-sm font-semibold px-1 pb-2.5 pt-0",
        line: "text-sm font-semibold pl-2.5 pr-3 py-0.5",
    },
    md: {
        "button-brand": "text-md font-semibold py-2.5 px-3",
        "button-gray": "text-md font-semibold py-2.5 px-3",
        "button-border": "text-md font-semibold py-2.5 px-3",
        "button-minimal": "text-md font-semibold py-2.5 px-3",
        underline: "text-md font-semibold px-1 pb-2.5 pt-0",
        line: "text-md font-semibold pr-3.5 pl-3 py-1",
    },
};

// Container styles (background, border, rounding) — used on wrapper div when overflow is active
const getContainerStyles = ({ size }: { size?: "sm" | "md" }) => ({
    "button-brand": "",
    "button-gray": "",
    "button-border": cx("rounded-[10px] bg-muted p-1 ring-1 ring-border ring-inset", size === "md" && "rounded-xl p-1.5"),
    "button-minimal": "rounded-lg bg-bg-secondary_alt ring-1 ring-inset ring-border-secondary",
    underline: "",
    line: "",
});

// Flex/gap styles — used on both wrapper and tablist when overflow is active
const getFlexStyles = ({ fullWidth }: { fullWidth?: boolean }) => ({
    "button-brand": "gap-1",
    "button-gray": "gap-1",
    "button-border": "gap-1",
    "button-minimal": "gap-0.5",
    underline: cx("gap-3", fullWidth && "w-full gap-4"),
    line: "gap-2",
});

// Combined styles for non-overflow rendering (original behavior)
const getHorizontalStyles = ({ size, fullWidth }: { size?: "sm" | "md"; fullWidth?: boolean }) => ({
    "button-brand": "gap-1",
    "button-gray": "gap-1",
    "button-border": cx("gap-1 rounded-[10px] bg-muted p-1 ring-1 ring-border ring-inset", size === "md" && "rounded-xl p-1.5"),
    "button-minimal": "gap-0.5 rounded-lg bg-bg-secondary_alt ring-1 ring-inset ring-border-secondary",
    underline: cx("gap-3", fullWidth && "w-full gap-4"),
    line: "gap-2",
});

const getColorStyles = ({ isSelected, isHovered }: Partial<AriaTabRenderProps>) => ({
    "button-brand": isSelected || isHovered ? "brand" : "gray",
    "button-gray": "gray",
    "button-border": "gray",
    "button-minimal": "gray",
    underline: isSelected || isHovered ? "brand" : "gray",
    line: isSelected || isHovered ? "brand" : "gray",
});

// Gap in pixels for each tab type
const getGapPx = (type: string) => {
    if (type === "underline") return 12;
    if (type === "line") return 8;
    if (type === "button-minimal") return 2;
    return 4;
};

interface TabListComponentProps<T extends object, K extends Orientation> extends AriaTabListProps<T> {
    /** The size of the tab list. */
    size?: keyof typeof sizes;
    /** The type of the tab list. */
    type?: TabTypeColors<K>;
    /** The orientation of the tab list. */
    orientation?: K;
    /** The items of the tab list. */
    items: T[];
    /** Whether the tab list is full width. */
    fullWidth?: boolean;
}

interface TabListContextValue {
    size?: "sm" | "md";
    type?: string;
    orientation?: Orientation;
    fullWidth?: boolean;
}

const TabListContext = createContext<TabListContextValue>({
    size: "sm",
    type: "button-brand",
});

export const TabList = <T extends Orientation>({
    size = "sm",
    type = "button-brand",
    orientation: orientationProp,
    fullWidth,
    className,
    children,
    ...otherProps
}: TabListComponentProps<TabComponentProps, T>) => {
    const context = useSlottedContext(TabsContext);
    const orientation = orientationProp ?? context?.orientation ?? "horizontal";
    const items = (otherProps.items ?? []) as TabComponentProps[];

    const shouldOverflow = orientation === "horizontal" && !fullWidth && items.length > 1;

    const wrapperRef = useRef<HTMLDivElement>(null);
    const tabWidthsRef = useRef<Map<string, number>>(new Map());
    const [overflowIds, setOverflowIds] = useState<Set<string>>(new Set());
    const [needsMeasure, setNeedsMeasure] = useState(shouldOverflow);

    const applyOverflowToDOM = useCallback(
        (overflowSet: Set<string>) => {
            const tabList = wrapperRef.current?.querySelector('[role="tablist"]');
            if (!tabList) return;
            const tabs = tabList.querySelectorAll<HTMLElement>('[role="tab"]');
            tabs.forEach((tab) => {
                const key = tab.dataset.key;
                if (key && overflowSet.has(key)) {
                    tab.style.display = "none";
                } else {
                    tab.style.display = "";
                }
            });
        },
        [],
    );

    const calculateOverflow = useCallback(
        (containerWidth: number) => {
            const gap = getGapPx(type);
            const moreButtonWidth = 56;

            // Check if all tabs fit without "More" button
            let totalAll = 0;
            for (let i = 0; i < items.length; i++) {
                totalAll += (tabWidthsRef.current.get(String(items[i].id)) ?? 80) + (i > 0 ? gap : 0);
            }

            if (totalAll <= containerWidth) {
                applyOverflowToDOM(new Set());
                setOverflowIds((prev) => (prev.size === 0 ? prev : new Set()));
                return;
            }

            // Find the selected tab to ensure it stays visible
            const tabList = wrapperRef.current?.querySelector('[role="tablist"]');
            const selectedEl = tabList?.querySelector<HTMLElement>('[aria-selected="true"]');
            const selectedKey = selectedEl?.dataset.key;

            // Calculate which tabs fit (left to right) leaving room for "More" button
            let available = containerWidth - moreButtonWidth - gap;
            const visible = new Set<string>();

            for (const item of items) {
                const id = String(item.id);
                const w = tabWidthsRef.current.get(id) ?? 80;
                if (available >= w) {
                    visible.add(id);
                    available -= w + gap;
                }
            }

            // Ensure selected tab is always visible — swap with last visible if needed
            if (selectedKey && !visible.has(selectedKey)) {
                visible.add(selectedKey);
                const visibleArr = [...visible].filter((id) => id !== selectedKey);
                if (visibleArr.length > 0) {
                    visible.delete(visibleArr[visibleArr.length - 1]);
                }
            }

            const newOverflow = new Set(items.map((i) => String(i.id)).filter((id) => !visible.has(id)));

            applyOverflowToDOM(newOverflow);
            setOverflowIds(newOverflow);
        },
        [items, type, applyOverflowToDOM],
    );

    // Initial measurement — runs before paint (no flash)
    useLayoutEffect(() => {
        if (!shouldOverflow || !needsMeasure || !wrapperRef.current) return;

        const tabList = wrapperRef.current.querySelector('[role="tablist"]');
        if (!tabList) return;

        const tabs = tabList.querySelectorAll<HTMLElement>('[role="tab"]');
        tabWidthsRef.current.clear();
        tabs.forEach((tab) => {
            const key = tab.dataset.key;
            if (key) tabWidthsRef.current.set(key, tab.offsetWidth);
        });

        setNeedsMeasure(false);

        // Account for wrapper padding
        const style = getComputedStyle(wrapperRef.current);
        const availableWidth = wrapperRef.current.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        calculateOverflow(availableWidth);
    }, [shouldOverflow, needsMeasure, calculateOverflow]);

    // Re-measure when items change
    const itemKeys = items.map((i) => String(i.id)).join(",");
    useEffect(() => {
        if (!shouldOverflow) return;
        tabWidthsRef.current.clear();
        setNeedsMeasure(true);
        setOverflowIds(new Set());
        applyOverflowToDOM(new Set());
    }, [shouldOverflow, itemKeys, applyOverflowToDOM]);

    // ResizeObserver for dynamic resize
    useEffect(() => {
        if (!shouldOverflow || needsMeasure || !wrapperRef.current) return;

        const observer = new ResizeObserver(() => {
            if (wrapperRef.current) {
                const style = getComputedStyle(wrapperRef.current);
                const availableWidth =
                    wrapperRef.current.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
                calculateOverflow(availableWidth);
            }
        });

        observer.observe(wrapperRef.current);
        return () => observer.disconnect();
    }, [shouldOverflow, needsMeasure, calculateOverflow]);

    // Recalculate when selection changes (to keep selected tab visible)
    useEffect(() => {
        if (!shouldOverflow || !wrapperRef.current) return;

        const tabList = wrapperRef.current.querySelector('[role="tablist"]');
        if (!tabList) return;

        const observer = new MutationObserver(() => {
            if (wrapperRef.current && !needsMeasure) {
                const style = getComputedStyle(wrapperRef.current);
                const availableWidth =
                    wrapperRef.current.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
                calculateOverflow(availableWidth);
            }
        });

        observer.observe(tabList, { attributes: true, attributeFilter: ["aria-selected"], subtree: true });
        return () => observer.disconnect();
    }, [shouldOverflow, needsMeasure, calculateOverflow]);

    const handleOverflowSelect = useCallback((id: string) => {
        const tabList = wrapperRef.current?.querySelector('[role="tablist"]');
        const tab = tabList?.querySelector<HTMLElement>(`[data-key="${id}"]`);
        if (tab) {
            // Temporarily show the tab so click registers properly
            const prev = tab.style.display;
            tab.style.display = "";
            tab.click();
            tab.style.display = prev;
        }
    }, []);

    // --- Non-overflow rendering (vertical, fullWidth, single item) ---
    if (!shouldOverflow) {
        return (
            <TabListContext.Provider value={{ size, type, orientation, fullWidth }}>
                <AriaTabList
                    {...otherProps}
                    className={(state) =>
                        cx(
                            "group flex",
                            getHorizontalStyles({ size, fullWidth })[type as HorizontalTypes],
                            orientation === "vertical" && "w-max flex-col",
                            orientation === "horizontal" &&
                                type === "underline" &&
                                "relative before:absolute before:inset-x-0 before:bottom-0 before:h-px before:bg-border-secondary",
                            typeof className === "function" ? className(state) : className,
                        )
                    }
                >
                    {children ?? ((item) => <Tab {...item}>{item.children}</Tab>)}
                </AriaTabList>
            </TabListContext.Provider>
        );
    }

    // --- Overflow-capable rendering ---
    const hasOverflow = overflowIds.size > 0;
    const overflowItems = items.filter((item) => overflowIds.has(String(item.id)));

    const containerClass = getContainerStyles({ size })[type as HorizontalTypes];
    const flexClass = getFlexStyles({ fullWidth })[type as HorizontalTypes];

    return (
        <TabListContext.Provider value={{ size, type, orientation, fullWidth }}>
            <div ref={wrapperRef} className={cx("flex items-center", containerClass, flexClass)}>
                <AriaTabList
                    {...otherProps}
                    className={(state) =>
                        cx(
                            "group flex",
                            flexClass,
                            type === "underline" &&
                                "relative before:absolute before:inset-x-0 before:bottom-0 before:h-px before:bg-border-secondary",
                            typeof className === "function" ? className(state) : className,
                        )
                    }
                >
                    {children ?? ((item) => <Tab {...item}>{item.children}</Tab>)}
                </AriaTabList>

                {hasOverflow && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                className={cx(
                                    "z-10 flex h-max shrink-0 cursor-pointer items-center justify-center gap-1 rounded-md whitespace-nowrap text-muted-foreground transition duration-100 ease-linear",
                                    sizes[size][type],
                                    "hover:bg-background hover:text-foreground hover:shadow-sm",
                                )}
                            >
                                Więcej
                                <ChevronDown className="h-3.5 w-3.5" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            {overflowItems.map((item) => (
                                <DropdownMenuItem
                                    key={String(item.id)}
                                    onSelect={() => handleOverflowSelect(String(item.id))}
                                >
                                    {typeof item.label === "string"
                                        ? item.label
                                        : typeof item.children === "string"
                                          ? item.children
                                          : String(item.id)}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>
        </TabListContext.Provider>
    );
};

export const TabPanel = (props: ComponentPropsWithRef<typeof AriaTabPanel>) => {
    return (
        <AriaTabPanel
            {...props}
            className={(state) =>
                cx(
                    "outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2",
                    typeof props.className === "function" ? props.className(state) : props.className,
                )
            }
        />
    );
};

interface TabComponentProps extends AriaTabProps {
    /** The label of the tab. */
    label?: ReactNode;
    /** The children of the tab. */
    children?: ReactNode | ((props: AriaTabRenderProps) => ReactNode);
    /** The badge displayed next to the label. */
    badge?: number | string;
}

export const Tab = (props: TabComponentProps) => {
    const { label, children, badge, ...otherProps } = props;
    const { size = "sm", type = "button-brand", fullWidth } = useContext(TabListContext);

    return (
        <AriaTab
            {...otherProps}
            className={(prop) =>
                cx(
                    "z-10 flex h-max cursor-pointer items-center justify-center gap-2 rounded-md whitespace-nowrap text-muted-foreground transition duration-100 ease-linear",
                    "group-orientation-vertical:justify-start",
                    fullWidth && "w-full flex-1",
                    sizes[size][type as keyof (typeof sizes)["sm"]],
                    getTabStyles(prop)[type as keyof ReturnType<typeof getTabStyles>],
                    typeof props.className === "function" ? props.className(prop) : props.className,
                )
            }
        >
            {(state) => (
                <Fragment>
                    {typeof children === "function" ? children(state) : children || label}
                    {badge && (
                        <Badge
                            size={size}
                            type="pill-color"
                            color={getColorStyles(state)[type as keyof ReturnType<typeof getColorStyles>] as BadgeColors}
                            className={cx("hidden transition-inherit-all md:flex", size === "sm" && "-my-px")}
                        >
                            {badge}
                        </Badge>
                    )}
                </Fragment>
            )}
        </AriaTab>
    );
};

export const Tabs = ({ className, ...props }: ComponentPropsWithRef<typeof AriaTabs>) => {
    return (
        <AriaTabs
            keyboardActivation="manual"
            {...props}
            className={(state) => cx("flex w-full flex-col", typeof className === "function" ? className(state) : className)}
        />
    );
};

Tabs.Panel = TabPanel;
Tabs.List = TabList;
Tabs.Item = Tab;
