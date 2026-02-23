import {
    ArrowLeft,
    BarChartSquare02,
    Calendar as CalendarIcon,
    CheckDone01,
    ChevronRight,
    File05,
    HomeLine,
    PieChart03,
    Rows01,
    SearchLg,
    Users01,
} from "@untitledui/icons";
import type { NavItemType } from "@/components/application/app-navigation/config";
import { SidebarNavigationSectionsSubheadings } from "@/components/application/app-navigation/sidebar-navigation/sidebar-sections-subheadings";
import { Breadcrumbs } from "@/components/application/breadcrumbs/breadcrumbs";
import { Calendar } from "@/components/application/calendar/calendar";
import { events } from "@/components/application/calendar/config";
import { TabList, Tabs } from "@/components/application/tabs/tabs";
import { Avatar } from "@/components/base/avatar/avatar";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";

const navItemsWithSectionsSubheadings: Array<{ label: string; items: NavItemType[] }> = [
    {
        label: "General",
        items: [
            {
                label: "Dashboard",
                href: "/",
                icon: BarChartSquare02,
            },
            {
                label: "Projects",
                href: "/projects",
                icon: Rows01,
            },
            {
                label: "Documents",
                href: "/documents",
                icon: File05,
            },
            {
                label: "Calendar",
                href: "/calendar",
                icon: CalendarIcon,
            },
        ],
    },
    {
        label: "Untitled UI",
        items: [
            {
                label: "Reporting",
                href: "#",
                icon: PieChart03,
            },
            {
                label: "Tasks",
                href: "#",
                icon: CheckDone01,
                badge: (
                    <Badge size="sm" type="modern">
                        8
                    </Badge>
                ),
            },
            {
                label: "Users",
                href: "#",
                icon: Users01,
            },
        ],
    },
    {
        label: "Your teams",
        items: [
            {
                label: "Catalog",
                href: "#",
                icon: () => <Avatar src="https://www.untitledui.com/logos/images/Catalog.jpg" className="mr-2 size-5" />,
                badge: (
                    <div className="flex items-center gap-3">
                        <Badge size="sm" type="modern">
                            ⌘1
                        </Badge>
                        <ChevronRight size={16} className="text-fg-quaternary" />
                    </div>
                ),
            },
            {
                label: "Warpspeed",
                href: "#",
                icon: () => <Avatar src="https://www.untitledui.com/logos/images/Warpspeed.jpg" className="mr-2 size-5" />,
                badge: (
                    <div className="flex items-center gap-3">
                        <Badge size="sm" type="modern">
                            ⌘2
                        </Badge>
                        <ChevronRight size={16} className="text-fg-quaternary" />
                    </div>
                ),
            },
            {
                label: "Boltshift",
                href: "#",
                icon: () => <Avatar src="https://www.untitledui.com/logos/images/Boltshift.jpg" className="mr-2 size-5" />,
                badge: (
                    <div className="flex items-center gap-3">
                        <Badge size="sm" type="modern">
                            ⌘3
                        </Badge>
                        <ChevronRight size={16} className="text-fg-quaternary" />
                    </div>
                ),
            },
            {
                label: "Sisyphus",
                href: "#",
                icon: () => <Avatar src="https://www.untitledui.com/logos/images/Sisyphus.jpg" className="mr-2 size-5" />,
                badge: (
                    <div className="flex items-center gap-3">
                        <Badge size="sm" type="modern">
                            ⌘4
                        </Badge>
                        <ChevronRight size={16} className="text-fg-quaternary" />
                    </div>
                ),
            },
        ],
    },
];

const tabs = [
    { id: "all", label: "All events" },
    { id: "shared", label: "Shared" },
    { id: "public", label: "Public" },
    { id: "archived", label: "Archived" },
];

export const Informational08 = () => {
    return (
        <div className="flex flex-col lg:flex-row">
            <SidebarNavigationSectionsSubheadings activeUrl="/calendar" items={navItemsWithSectionsSubheadings} />
            <main className="min-w-0 flex-1 bg-secondary_subtle pt-8 pb-12 shadow-none lg:bg-primary">
                <div className="mx-auto mb-8 flex max-w-container flex-col gap-5 px-4 lg:px-8">
                    {/* Page header simple */}
                    <div className="relative flex flex-col gap-4">
                        <div className="max-lg:hidden">
                            <Breadcrumbs type="button" divider="slash">
                                <Breadcrumbs.Item href="#" icon={HomeLine} />
                                <Breadcrumbs.Item href="#">Untitled UI</Breadcrumbs.Item>
                                <Breadcrumbs.Item href="#">Calendar</Breadcrumbs.Item>
                            </Breadcrumbs>
                        </div>
                        <div className="flex lg:hidden">
                            <Button href="#" color="link-gray" size="md" iconLeading={ArrowLeft}>
                                Back
                            </Button>
                        </div>
                        <div className="flex flex-col gap-4 lg:flex-row">
                            <div className="flex flex-1 flex-col gap-0.5 md:gap-1">
                                <p className="text-xl font-semibold text-primary lg:text-display-xs">Calendar</p>
                            </div>
                            <Input shortcut className="w-full md:max-w-80" size="sm" aria-label="Search" placeholder="Search" icon={SearchLg} />
                        </div>
                    </div>
                    <Tabs orientation="horizontal" selectedKey="all" className="w-max self-start">
                        <TabList size="sm" type="button-minimal" items={tabs} />
                    </Tabs>
                </div>

                <div className="mx-auto flex max-w-container flex-col lg:gap-8 lg:px-8">
                    <Calendar events={events} view="month" className="max-lg:rounded-none max-lg:shadow-none" />
                </div>
            </main>
        </div>
    );
};
